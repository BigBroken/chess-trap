// A tiny forcing-line search used only offline, to vet seed traps.
// The trap owner is restricted to forcing moves (captures / promotions /
// checks); the opponent may play ANY move (full-width defense). If the search
// reports a forced material gain, the punish line is tactically sound against
// best defense -- good enough to trust a hand-authored placeholder trap.
import { Chess } from 'chess.js';
import { materialBalance } from './chess-helpers.mjs';

const MATE = 100000;

function ownerScore(chess, owner) {
  return materialBalance(chess.fen()) * (owner === 'w' ? 1 : -1);
}

function isForcing(move) {
  return Boolean(move.captured) || Boolean(move.promotion) || move.san.includes('+') || move.san.includes('#');
}

class NodeBudgetExceeded extends Error {}

/**
 * @returns {{score:number, pv:string[]}} score is material from the owner's
 * perspective assuming the owner only makes forcing moves and may stop
 * ("stand pat") whenever staying put is better than any forcing continuation.
 */
export function searchForcing(chess, owner, depthPlies, budget) {
  if (budget) {
    if (budget.nodes <= 0) throw new NodeBudgetExceeded();
    budget.nodes -= 1;
  }
  const turn = chess.turn();
  const moves = chess.moves({ verbose: true });

  if (moves.length === 0) {
    if (chess.inCheck()) {
      // side to move is checkmated
      return { score: turn === owner ? -MATE : MATE, pv: [] };
    }
    return { score: 0, pv: [] }; // stalemate
  }
  if (depthPlies === 0) {
    return { score: ownerScore(chess, owner), pv: [] };
  }

  if (turn === owner) {
    // Owner maximizes, but only over forcing moves; may also stop searching.
    let best = ownerScore(chess, owner); // stand-pat option
    let bestPv = [];
    for (const move of moves.filter(isForcing)) {
      chess.move(move.san);
      const child = searchForcing(chess, owner, depthPlies - 1, budget);
      chess.undo();
      if (child.score > best) {
        best = child.score;
        bestPv = [move.san, ...child.pv];
      }
    }
    return { score: best, pv: bestPv };
  }

  // Opponent minimizes over ALL replies (best defense).
  let best = Infinity;
  let bestPv = [];
  for (const move of moves) {
    chess.move(move.san);
    const child = searchForcing(chess, owner, depthPlies - 1, budget);
    chess.undo();
    if (child.score < best) {
      best = child.score;
      bestPv = [move.san, ...child.pv];
    }
  }
  return { score: best, pv: bestPv };
}

/** Convenience: run the search from a FEN. Returns {inconclusive:true} if the
 * node budget is blown before the tree is fully searched. */
export function forcedGain(fen, owner, depthPlies = 6, maxNodes = 1500000) {
  const chess = new Chess(fen);
  const baseline = ownerScore(chess, owner);
  const budget = { nodes: maxNodes };
  try {
    const { score, pv } = searchForcing(chess, owner, depthPlies, budget);
    return { gain: score - baseline, finalScore: score, pv, inconclusive: false };
  } catch (e) {
    if (e instanceof NodeBudgetExceeded) return { gain: 0, pv: [], inconclusive: true };
    throw e;
  }
}
