#!/usr/bin/env node
// Phase 1 -- Opening Trap Trainer data pipeline.
//
// Walks the Scotch (White) and Caro-Kann (Black) opening trees using the
// Lichess opening explorer, flags common-but-punishable opponent replies as
// trap candidates, and writes data/traps.json.
//
// Usage:  node scripts/build-traps.mjs [--opening=scotch|caro-kann] [--max-depth=12]
//
// No API key required. Responses are cached under data/cache/ keyed by the
// move sequence so re-runs are cheap. We self-rate-limit to ~1 req/sec and
// honour 429 Retry-After with exponential backoff.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Chess } from 'chess.js';
import { uciToSan, materialBalance } from './lib/chess-helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'data', 'cache');
const OUT_FILE = path.join(ROOT, 'data', 'traps.json');

const API = 'https://explorer.lichess.ovh/lichess';
const SPEEDS = 'blitz,rapid';
const RATINGS = '1200,1400,1600,1800';

// The explorer returns 401 to anonymous requests from datacenter IPs; a
// personal API token (https://lichess.org/account/oauth/token, no scopes)
// passed via LICHESS_TOKEN gets through.
const TOKEN = process.env.LICHESS_TOKEN || process.env.LICHESS_API_TOKEN || '';
const HTTP_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'chess-trap-trainer/1.0 (opening-trap study tool)',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

// ---- Tunable thresholds (from the build spec) --------------------------------
const MIN_GAMES_AT_NODE = 500; // prune thinner branches rather than lower this
const MIN_FREQ = 0.08; //  reply played in >=8% of games at the node
const MIN_WINRATE = 0.58; //  my win rate after the reply
const MIN_WINRATE_JUMP = 0.08; //  or jumps >=8 pts vs the node average
const MAX_DEPTH_DEFAULT = 12; // plies from the root
const TRUNK_FREQ = 0.06; //  only descend moves this common to build the trunk
const TRUNK_BRANCH = 4; //  ...and at most this many per node
const PUNISH_MAX_PLIES = 8;
const PUNISH_MIN_PLIES = 4;
const PUNISH_MIN_SAMPLE = 20; //  ignore noisy low-count moves when choosing punish
const MATERIAL_WON = 2; //  stop punish once my material edge reaches this
const RATE_LIMIT_MS = 1100;

const OPENINGS = {
  scotch: {
    id: 'scotch',
    label: 'Scotch',
    // 1.e4 e5 2.Nf3 Nc6 3.d4
    rootUci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4'],
    mySide: 'white', // I play White; I punish Black's mistakes
  },
  'caro-kann': {
    id: 'caro-kann',
    label: 'Caro-Kann',
    // 1.e4 c6
    rootUci: ['e2e4', 'c7c6'],
    mySide: 'black', // I play Black; I punish White's mistakes
  },
};

// ---- HTTP with cache + rate limit -------------------------------------------
let lastRequest = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cacheKey(uciMoves) {
  return uciMoves.length ? uciMoves.join('-') : 'root';
}

async function explorer(uciMoves) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${cacheKey(uciMoves)}.json`);
  if (existsSync(file)) {
    return JSON.parse(await readFile(file, 'utf8'));
  }

  const url = `${API}?variant=standard&speeds=${SPEEDS}&ratings=${RATINGS}&play=${uciMoves.join(',')}`;
  for (let attempt = 0; ; attempt++) {
    const wait = Math.max(0, RATE_LIMIT_MS - (Date.now() - lastRequest));
    if (wait) await sleep(wait);
    lastRequest = Date.now();

    const res = await fetch(url, { headers: HTTP_HEADERS });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `explorer ${res.status} — the explorer refused this request. ` +
          (TOKEN
            ? 'The LICHESS_TOKEN provided was rejected.'
            : 'Set LICHESS_TOKEN to a personal API token from https://lichess.org/account/oauth/token (no scopes needed).'),
      );
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      const backoff = Math.max(retryAfter * 1000, 2000 * 2 ** attempt);
      console.warn(`  429 rate-limited, backing off ${backoff}ms`);
      await sleep(backoff);
      continue;
    }
    if (!res.ok) {
      if (attempt < 4) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      throw new Error(`explorer ${res.status} for play=${uciMoves.join(',')}`);
    }
    const data = await res.json();
    await writeFile(file, JSON.stringify(data));
    return data;
  }
}

// ---- Stats helpers -----------------------------------------------------------
const totalGames = (n) => n.white + n.draws + n.black;
const winRateFor = (n, side) => {
  const t = totalGames(n);
  if (!t) return 0;
  return (side === 'white' ? n.white : n.black) / t;
};

// ---- Punish construction -----------------------------------------------------
// From the position right after the opponent's mistake, follow my
// highest-win-rate replies (and the opponent's most common defense) until I've
// won material or hit the ply cap. Returns SAN steps with a heuristic "why".
async function buildPunish(uciMoves, mySide, chessAtTrigger) {
  const chess = new Chess(chessAtTrigger.fen());
  const punish = [];
  const uci = [...uciMoves];
  const myColorChar = mySide === 'white' ? 'w' : 'b';

  for (let ply = 0; ply < PUNISH_MAX_PLIES; ply++) {
    const node = await explorer(uci);
    const moves = (node.moves || []).filter((m) => totalGames(m) >= PUNISH_MIN_SAMPLE);
    if (!moves.length) break;

    const myTurn = chess.turn() === myColorChar;
    let chosen;
    if (myTurn) {
      // best practical result for me
      chosen = moves.reduce((a, b) => (winRateFor(b, mySide) > winRateFor(a, mySide) ? b : a));
    } else {
      // opponent's most popular defense
      chosen = moves.reduce((a, b) => (totalGames(b) > totalGames(a) ? b : a));
    }

    const san = uciToSan(chess.fen(), chosen.uci);
    if (!san) break;
    const moveObj = chess.move(san);
    if (!moveObj) break;
    uci.push(chosen.uci);
    punish.push({ san, why: describeMove(moveObj, chess, myTurn, winRateFor(chosen, mySide)) });

    const edge = materialBalance(chess.fen()) * (mySide === 'white' ? 1 : -1);
    if (ply + 1 >= PUNISH_MIN_PLIES && edge >= MATERIAL_WON) break;
  }
  return punish;
}

// Heuristic explanation -- the real repertoire whys are meant to be authored by
// a human; the pipeline marks these `auto` so they can be refined later.
function describeMove(moveObj, chessAfter, myTurn, winRate) {
  const parts = [];
  if (moveObj.flags.includes('c') || moveObj.flags.includes('e')) parts.push(`captures on ${moveObj.to}`);
  if (moveObj.san.includes('+')) parts.push('with check');
  if (chessAfter.isCheckmate()) return 'checkmate.';
  if (!parts.length) parts.push(myTurn ? 'keeps the initiative' : 'best defensive try');
  const pct = Math.round(winRate * 100);
  return `${parts.join(' ')}${myTurn ? ` (scores ${pct}% here)` : ''}.`;
}

function payoffFor(chessEnd, mySide) {
  const edge = materialBalance(chessEnd.fen()) * (mySide === 'white' ? 1 : -1);
  if (chessEnd.isCheckmate()) return 'checkmate';
  if (edge >= 5) return 'wins a rook or more';
  if (edge >= 3) return 'wins a piece';
  if (edge >= 2) return 'wins the exchange';
  if (edge >= 1) return 'wins a pawn with a lasting edge';
  return 'clear practical advantage, opponent under pressure';
}

// ---- Tree walk ---------------------------------------------------------------
async function walk(opening, uciMoves, sanLine, depth, maxDepth, chess, traps, seen) {
  if (depth > maxDepth) return;
  const node = await explorer(uciMoves);
  const N = totalGames(node);
  if (N < MIN_GAMES_AT_NODE) return; // prune thin branch

  const opponentToMove = chess.turn() !== (opening.mySide === 'white' ? 'w' : 'b');
  const nodeWinRate = winRateFor(node, opening.mySide);

  if (opponentToMove) {
    for (const m of node.moves || []) {
      const g = totalGames(m);
      const freq = g / N;
      if (freq < MIN_FREQ || g < 30) continue;
      const moveWin = winRateFor(m, opening.mySide);
      const jump = moveWin - nodeWinRate;
      const punishable = moveWin >= MIN_WINRATE || jump >= MIN_WINRATE_JUMP;
      if (!punishable) continue;

      const san = uciToSan(chess.fen(), m.uci);
      if (!san) continue;
      const key = `${opening.id}:${cacheKey([...uciMoves, m.uci])}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const branch = new Chess(chess.fen());
      branch.move(san);
      const punish = await buildPunish([...uciMoves, m.uci], opening.mySide, branch);
      if (punish.length < PUNISH_MIN_PLIES) continue; // no convincing refutation found

      const punishChess = new Chess(branch.fen());
      punish.forEach((p) => punishChess.move(p.san));

      const moveNumber = Math.floor(depth / 2) + 1;
      const dots = opening.mySide === 'white' ? `${moveNumber}...` : `${moveNumber}.`;
      traps.push({
        id: `${opening.id}-${cacheKey([...uciMoves, m.uci])}`,
        opening: opening.id,
        name: `${opening.label}: ${dots}${san}`,
        line: [...sanLine],
        fen: chess.fen(),
        mistake: { san, freqPct: +(freq * 100).toFixed(1), winRate: +(moveWin * 100).toFixed(1) },
        punish,
        payoff: payoffFor(punishChess, opening.mySide),
        popularity_rank: +(freq * 100 * (jump * 100)).toFixed(2),
        whyAuto: true,
      });
    }
  }

  // descend the trunk: only common moves, capped, until maxDepth
  if (depth >= maxDepth) return;
  const trunk = (node.moves || [])
    .filter((m) => totalGames(m) / N >= TRUNK_FREQ)
    .sort((a, b) => totalGames(b) - totalGames(a))
    .slice(0, TRUNK_BRANCH);
  for (const m of trunk) {
    const san = uciToSan(chess.fen(), m.uci);
    if (!san) continue;
    const child = new Chess(chess.fen());
    child.move(san);
    await walk(opening, [...uciMoves, m.uci], [...sanLine, san], depth + 1, maxDepth, child, traps, seen);
  }
}

async function buildOpening(opening, maxDepth) {
  console.log(`\n=== ${opening.label} (playing ${opening.mySide}) ===`);
  const chess = new Chess();
  const sanLine = [];
  for (const uci of opening.rootUci) {
    const san = uciToSan(chess.fen(), uci);
    chess.move(san);
    sanLine.push(san);
  }
  const traps = [];
  const seen = new Set();
  await walk(opening, [...opening.rootUci], sanLine, opening.rootUci.length, maxDepth, chess, traps, seen);
  traps.sort((a, b) => b.popularity_rank - a.popularity_rank);
  console.log(`  found ${traps.length} trap candidates`);
  return traps;
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    }),
  );
  const maxDepth = Number(args['max-depth']) || MAX_DEPTH_DEFAULT;
  const which = args.opening ? [args.opening] : ['scotch', 'caro-kann'];

  let all = [];
  for (const id of which) {
    const opening = OPENINGS[id];
    if (!opening) throw new Error(`unknown opening ${id}`);
    all = all.concat(await buildOpening(opening, maxDepth));
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'lichess-explorer',
    params: { speeds: SPEEDS, ratings: RATINGS, maxDepth },
    traps: all,
  };
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));

  // Show the top 5 per opening for review.
  for (const id of which) {
    const top = all.filter((t) => t.opening === id).slice(0, 5);
    console.log(`\n----- TOP ${top.length} ${id} -----`);
    top.forEach((t, i) => {
      console.log(`${i + 1}. ${t.name}  [${t.mistake.freqPct}% played, ${t.mistake.winRate}% my score, rank ${t.popularity_rank}]`);
      console.log(`   line: ${t.line.join(' ')}  |  mistake: ${t.mistake.san}`);
      console.log(`   punish: ${t.punish.map((p) => p.san).join(' ')}  => ${t.payoff}`);
    });
  }
  console.log(`\nWrote ${all.length} traps to ${path.relative(ROOT, OUT_FILE)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
