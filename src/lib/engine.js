// Turns a trap record into a linear timeline the UI can step through, and
// exposes small chess helpers shared by the Learn and Quiz screens.
import { Chess } from 'chess.js';

export const OPENINGS = {
  scotch: { id: 'scotch', label: 'Scotch', side: 'white', subtitle: '1.e4 e5 2.Nf3 Nc6 3.d4' },
  'caro-kann': { id: 'caro-kann', label: 'Caro-Kann', side: 'black', subtitle: '1.e4 c6' },
};

export function orientationFor(trap) {
  return OPENINGS[trap.opening]?.side ?? 'white';
}

export function mySideChar(trap) {
  return orientationFor(trap) === 'white' ? 'w' : 'b';
}

/**
 * Build the full move timeline for a trap.
 * Each step: { san, phase: 'line'|'mistake'|'mine'|'reply', why?, meta? }
 * Also returns `fens`: fens[i] is the position BEFORE step i (fens[0] = start),
 * and fens[steps.length] is the final position.
 * `triggerIndex` is the step index of the opponent's mistake.
 */
export function buildTimeline(trap) {
  const steps = [];
  trap.line.forEach((san) => steps.push({ san, phase: 'line' }));
  const triggerIndex = steps.length;
  steps.push({ san: trap.mistake.san, phase: 'mistake', meta: trap.mistake });
  trap.punish.forEach((p, i) => steps.push({ san: p.san, phase: i % 2 === 0 ? 'mine' : 'reply', why: p.why }));

  const chess = new Chess();
  const fens = [chess.fen()];
  for (const step of steps) {
    const move = chess.move(step.san);
    if (!move) throw new Error(`Illegal timeline move ${step.san} in trap ${trap.id}`);
    step.from = move.from;
    step.to = move.to;
    fens.push(chess.fen());
  }
  return { steps, fens, triggerIndex };
}

/** Legal target squares from a given square in a FEN (for tap highlighting). */
export function legalTargets(fen, square) {
  const chess = new Chess(fen);
  return chess.moves({ square, verbose: true }).map((m) => m.to);
}

/** Try a from/to(/promotion) move on a FEN. Returns the SAN if legal, else null. */
export function tryMoveSan(fen, from, to, promotion = 'q') {
  const chess = new Chess(fen);
  try {
    const move = chess.move({ from, to, promotion });
    return move ? move.san : null;
  } catch {
    return null;
  }
}

/** Does a from/to move need a promotion choice (pawn reaching last rank)? */
export function isPromotion(fen, from, to) {
  const chess = new Chess(fen);
  const piece = chess.get(from);
  if (!piece || piece.type !== 'p') return false;
  const rank = to[1];
  return (piece.color === 'w' && rank === '8') || (piece.color === 'b' && rank === '1');
}
