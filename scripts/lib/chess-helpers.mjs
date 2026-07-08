// Shared chess utilities used by the seed builder, the Lichess pipeline,
// and the validation script. Everything is driven through chess.js so the
// three tools agree on legality and position derivation.
import { Chess } from 'chess.js';

/**
 * Replay a list of SAN moves from the standard start position (or a given FEN).
 * Throws with a helpful message on the first illegal move.
 * Returns the resulting Chess instance.
 */
export function replaySan(sanMoves, startFen) {
  const chess = startFen ? new Chess(startFen) : new Chess();
  sanMoves.forEach((san, i) => {
    const move = chess.move(san);
    if (!move) {
      throw new Error(
        `Illegal move "${san}" at ply ${i + 1} (from ${chess.fen()}). ` +
          `Legal moves: ${chess.moves().join(', ')}`,
      );
    }
  });
  return chess;
}

/** FEN of the position reached after replaying `sanMoves`. */
export function fenAfter(sanMoves, startFen) {
  return replaySan(sanMoves, startFen).fen();
}

/**
 * Convert a UCI move ("e2e4", "e7e8q") to SAN in the given position.
 * Returns null (instead of throwing, as chess.js does) for illegal moves.
 * Lichess encodes castling as king-takes-rook ("e1h1", "e8a8"); chess.js
 * wants the king's destination square, so translate those.
 */
export function uciToSan(fen, uci) {
  const chess = new Chess(fen);
  const from = uci.slice(0, 2);
  let to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  const castling = { e1h1: 'g1', e1a1: 'c1', e8h8: 'g8', e8a8: 'c8' };
  if (chess.get(from)?.type === 'k' && castling[from + to]) {
    to = castling[from + to];
  }
  try {
    const move = chess.move({ from, to, promotion });
    return move ? move.san : null;
  } catch {
    return null;
  }
}

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Material balance from White's perspective (positive = White is up material),
 * counting standard piece values, ignoring kings.
 */
export function materialBalance(fen) {
  const chess = new Chess(fen);
  let balance = 0;
  for (const row of chess.board()) {
    for (const square of row) {
      if (!square) continue;
      const value = PIECE_VALUE[square.type];
      balance += square.color === 'w' ? value : -value;
    }
  }
  return balance;
}

/**
 * Given a trap object, walk line -> mistake -> punish and return the material
 * swing (in pawns) for `side` between the trigger position and the end of the
 * punish sequence. Used to sanity-check payoff claims.
 */
export function payoffSwing(trap) {
  const triggerFen = fenAfter(trap.line);
  const startBalance = materialBalance(triggerFen);
  const all = [...trap.line, trap.mistake.san, ...trap.punish.map((p) => p.san)];
  const endBalance = materialBalance(fenAfter(all));
  const perspective = trap.opening === 'caro-kann' ? -1 : 1; // caro-kann = Black's gain
  return (endBalance - startBalance) * perspective;
}
