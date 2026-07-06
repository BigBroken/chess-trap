#!/usr/bin/env node
// Builds a PROVISIONAL data/traps.json from a hand-authored, engine-vetted
// seed set. Every line/mistake/punish below was checked with Stockfish 18
// (see scripts/analyze-candidates*.mjs) so the refutations are sound against
// best defence; the frequency/win-rate figures are honest ESTIMATES, not
// Lichess data. Running scripts/build-traps.mjs where the Lichess explorer is
// reachable overwrites this file with real club-level data.
//
// Each entry lists SAN `line` up to the trigger (opponent to move), the
// opponent's `mistake`, and the `punish` (my move first, then alternating).
// FEN, popularity_rank and legality are derived/checked here.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Chess } from 'chess.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'traps.json');

// est = { freqPct, winRate } provisional estimates; evalCp = Stockfish eval
// (centipawns, from MY side's perspective) after the full punish line.
const SEED = [
  // ---------------- SCOTCH (I play White) ----------------
  {
    id: 'scotch-qg5-bxg5',
    opening: 'scotch',
    name: 'Scotch: the ...Qg5?? lunge',
    line: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4'],
    mistake: 'Qg5',
    est: { freqPct: 1.6, winRate: 90 },
    evalCp: 640,
    payoff: 'wins the queen',
    punish: [
      { san: 'Bxg5', why: 'Playing d4 opened the c1–g5 diagonal. The queen stepped straight onto it and simply drops.' },
    ],
  },
  {
    id: 'scotch-e5-ng4',
    opening: 'scotch',
    name: 'Scotch: ...Ng4 knight lunge',
    line: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nxc6', 'bxc6', 'e5'],
    mistake: 'Ng4',
    est: { freqPct: 4, winRate: 78 },
    evalCp: 400,
    payoff: 'wins a piece',
    punish: [
      { san: 'Qxg4', why: 'The knight jumps to g4 eyeing e5 and f2, but nothing defends g4 — the queen just takes it.' },
    ],
  },
  {
    id: 'scotch-c4-nf4',
    opening: 'scotch',
    name: 'Scotch: ...Nf4 over-eager jump',
    line: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nxc6', 'bxc6', 'e5', 'Qe7', 'Qe2', 'Nd5', 'c4'],
    mistake: 'Nf4',
    est: { freqPct: 3, winRate: 80 },
    evalCp: 390,
    payoff: 'wins a piece',
    punish: [
      { san: 'Bxf4', why: 'Kicked by c4, the knight lands on f4 hitting the queen — but the c1-bishop covers f4 and pockets it.' },
    ],
  },
  {
    id: 'scotch-qh4-a6-nc7',
    opening: 'scotch',
    name: 'Scotch: ...Qh4 & ...a6 walk into Nxc7+',
    line: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Qh4', 'Nb5'],
    mistake: 'a6',
    est: { freqPct: 6, winRate: 74 },
    evalCp: 440,
    payoff: 'wins the exchange and a pawn — the c7-fork nets the rook',
    punish: [
      { san: 'Nxc7+', why: 'Nb5 already eyed this fork. Kicking with ...a6 ignores it: Nxc7+ forks the king and the a8-rook.' },
      { san: 'Kd8', why: 'Forced off the check — nothing can capture the c7-knight.' },
      { san: 'Nxa8', why: 'Collects the rook. White is up the exchange and a pawn; the knight trades itself off or escapes via b6/c7.' },
    ],
  },

  // ---------------- CARO-KANN (I play Black) ----------------
  {
    id: 'caro-advance-nh4',
    opening: 'caro-kann',
    name: 'Caro-Kann Advance: 5.Nh4?? grabs at the bishop',
    line: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6'],
    mistake: 'Nh4',
    est: { freqPct: 3.5, winRate: 82 },
    evalCp: 390,
    payoff: 'wins a piece',
    punish: [
      { san: 'Qxh4', why: 'White reaches for the f5-bishop, but h4 is undefended — the queen swings out and wins the knight outright.' },
    ],
  },
  {
    id: 'caro-fantasy-dxe5',
    opening: 'caro-kann',
    name: 'Caro-Kann Fantasy: 5.dxe5?? and the king hunt',
    line: ['e4', 'c6', 'd4', 'd5', 'f3', 'dxe4', 'fxe4', 'e5'],
    mistake: 'dxe5',
    est: { freqPct: 9, winRate: 63 },
    evalCp: 90,
    payoff: 'regains the pawn and White’s king is stranded in the centre, castling gone',
    punish: [
      { san: 'Qh4+', why: 'With f2 and f3 vacated, the queen check rakes the king. On g3, ...Qxe4+ even wins the rook, so White must run.' },
      { san: 'Kd2', why: 'The only way to keep material — but now the king is walking.' },
      { san: 'Qf4+', why: 'Chasing the king further and clearing the way to e4.' },
      { san: 'Ke1', why: 'Back it goes, having lost the right to castle for good.' },
      { san: 'Qxe4+', why: 'Regains the pawn with check; Black is fully developed while White’s king is stuck on e1.' },
    ],
  },
  {
    id: 'caro-exchange-qf3',
    opening: 'caro-kann',
    name: 'Caro-Kann Exchange: 6.Qf3?! meets ...e5!',
    line: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'Bd3', 'Nc6', 'c3', 'Nf6'],
    mistake: 'Qf3',
    est: { freqPct: 5, winRate: 60 },
    evalCp: 60,
    payoff: 'wins the bishop pair and a fine position',
    punish: [
      { san: 'e5', why: 'The queen left d1, so the d4-pawn is loose — this central break rips the centre open.' },
      { san: 'dxe5', why: 'White grabs the pawn, but it won’t hold.' },
      { san: 'Ng4', why: 'Hitting e5 again and threatening the fork on f2; the pawn falls back.' },
      { san: 'Be3', why: 'Propping up e5 and covering f2.' },
      { san: 'Ngxe5', why: 'Recovers the pawn and attacks the d3-bishop — ...Nxd3+ next snags the bishop pair.' },
    ],
  },
];

function build() {
  const traps = SEED.map((s) => {
    const chess = new Chess();
    s.line.forEach((san) => {
      if (!chess.move(san)) throw new Error(`illegal line move ${san} in ${s.id}`);
    });
    const fen = chess.fen();

    // legality check of mistake + punish
    const probe = new Chess(fen);
    if (!probe.move(s.mistake)) throw new Error(`illegal mistake ${s.mistake} in ${s.id}`);
    s.punish.forEach((p) => {
      if (!probe.move(p.san)) throw new Error(`illegal punish ${p.san} in ${s.id}`);
    });

    const delta = s.est.winRate - 50;
    return {
      id: s.id,
      opening: s.opening,
      name: s.name,
      line: s.line,
      fen,
      mistake: { san: s.mistake, freqPct: s.est.freqPct, winRate: s.est.winRate },
      punish: s.punish,
      payoff: s.payoff,
      popularity_rank: +(s.est.freqPct * delta).toFixed(2),
      evalCp: s.evalCp,
      provisional: true,
    };
  });

  traps.sort((a, b) => b.popularity_rank - a.popularity_rank);
  return traps;
}

async function main() {
  const traps = build();
  const payload = {
    generatedAt: null,
    source: 'seed',
    note: 'Provisional, engine-vetted seed. Replace via scripts/build-traps.mjs with real Lichess data.',
    traps,
  };
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2));
  const byOpening = traps.reduce((m, t) => ((m[t.opening] = (m[t.opening] || 0) + 1), m), {});
  console.log(`Wrote ${traps.length} seed traps (scotch: ${byOpening.scotch || 0}, caro-kann: ${byOpening['caro-kann'] || 0})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
