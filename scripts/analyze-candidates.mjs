// Offline helper (not part of the app): evaluate a curated list of plausible
// club mistakes with Stockfish, report the eval swing from my side's view, and
// print the engine's refutation line in SAN. Used to author sound seed traps.
import { Chess } from 'chess.js';
import { evaluate, shutdown } from './lib/engine-eval.mjs';
import { fenAfter, uciToSan } from './lib/chess-helpers.mjs';
import { appendFileSync, writeFileSync } from 'node:fs';

const OUT = '/tmp/analysis.out';
writeFileSync(OUT, '');
const log = (s) => { appendFileSync(OUT, s + '\n'); process.stdout.write(s + '\n'); };

// opening: 'scotch' (I'm White) | 'caro-kann' (I'm Black)
const C = [
  // ---- SCOTCH: Black to move (odd number of half-moves) ----
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', 'Qh4'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', 'Qf6'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', 'Qg5'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', 'd6'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', 'g6'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', 'Bb4+'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', 'Nge7'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', 'Bd6'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', 'd5'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7', 'Bxd4'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7', 'd6'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nb3 Bb6 Nc3', 'Qf6'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5', 'Qe7'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5', 'Ng4'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4', 'Nb6'],
  ['scotch', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4', 'Nf4'],

  // ---- CARO-KANN: White to move (even number of half-moves) ----
  ['caro-kann', 'e4 c6 d4 d5 e5 Bf5', 'Bd3'],
  ['caro-kann', 'e4 c6 d4 d5 e5 Bf5', 'g4'],
  ['caro-kann', 'e4 c6 d4 d5 e5 Bf5', 'h4'],
  ['caro-kann', 'e4 c6 d4 d5 e5 Bf5', 'Ne2'],
  ['caro-kann', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6', 'Bd3'],
  ['caro-kann', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6', 'Bg5'],
  ['caro-kann', 'e4 c6 d4 d5 f3 e5', 'dxe5'],
  ['caro-kann', 'e4 c6 d4 d5 f3 e5', 'exd5'],
  ['caro-kann', 'e4 c6 d4 d5 f3 dxe4 fxe4 e5', 'dxe5'],
  ['caro-kann', 'e4 c6 d4 d5 f3 dxe4 fxe4 e5', 'Nf3'],
  ['caro-kann', 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6', 'Bf4'],
  ['caro-kann', 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6', 'h3'],
  ['caro-kann', 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6', 'Bg5'],
  ['caro-kann', 'e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6 d4 Nf6', 'e5'],
  ['caro-kann', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 Bd3 Bxd3 Qxd3', 'Ne5'],
  ['caro-kann', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng3 e5', 'dxe5'],
];

const DEPTH = 18;
const PLIES = 8;
const persp = (opening, cp) => (opening === 'caro-kann' ? -cp : cp);

function evalToStr(opening, r) {
  if (r.mate != null) return `#${persp(opening, r.mate)}`;
  return `${persp(opening, r.cp) >= 0 ? '+' : ''}${(persp(opening, r.cp) / 100).toFixed(2)}`;
}

const baselineCache = new Map();

async function main() {
  for (const [opening, lineStr, mistake] of C) {
    const line = lineStr.split(' ');
    const owner = opening === 'scotch' ? 'w' : 'b';
    // sanity: opponent (not owner) must be to move at the trigger
    const triggerFen = fenAfter(line);
    if (triggerFen.split(' ')[1] === owner) {
      log(`BAD PARITY ${opening} ${lineStr} | ${mistake}`);
      continue;
    }

    if (!baselineCache.has(lineStr)) {
      baselineCache.set(lineStr, await evaluate(triggerFen, { depth: DEPTH }));
    }
    const base = baselineCache.get(lineStr);

    let postFen;
    try {
      postFen = fenAfter([...line, mistake]);
    } catch {
      log(`ILLEGAL ${opening} ${lineStr} | ${mistake}`);
      continue;
    }
    const post = await evaluate(postFen, { depth: DEPTH });

    // engine refutation from my side, in SAN
    const pvChess = new Chess(postFen);
    const pvSan = [];
    for (const uci of post.pv.slice(0, PLIES)) {
      const san = uciToSan(pvChess.fen(), uci);
      if (!san) break;
      pvChess.move(san);
      pvSan.push(san);
    }

    const baseMy = persp(opening, base.mate != null ? base.mate * 10000 : base.cp);
    const postMy = persp(opening, post.mate != null ? post.mate * 10000 : post.cp);
    const swing = Math.round(postMy - baseMy);
    const flag = postMy >= 130 && swing >= 90 ? ' <<< TRAP' : '';
    log(
      `${opening} | ${lineStr} | ${mistake}  base=${evalToStr(opening, base)} post=${evalToStr(opening, post)} swing=${swing}cp  punish: ${pvSan.join(' ')}${flag}`,
    );
  }
  await shutdown();
  log('=== done ===');
  process.exit(0);
}

main();
