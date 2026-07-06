import { useEffect, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { legalTargets, isPromotion } from '../lib/engine.js';

const SELECTED = { background: 'rgba(255, 214, 10, 0.45)' };
const LAST_MOVE = { background: 'rgba(120, 170, 255, 0.30)' };
const HINT = { boxShadow: 'inset 0 0 0 4px rgba(255, 214, 10, 0.95)', borderRadius: '4px' };
const DOT = {
  background: 'radial-gradient(circle, rgba(20,20,22,0.35) 22%, transparent 24%)',
};
const CAPTURE_DOT = {
  background: 'radial-gradient(circle, transparent 55%, rgba(20,20,22,0.35) 57%)',
};

/**
 * Controlled board. The parent owns `fen`; when the user completes a move we
 * call onUserMove(from, to, promotion) and the parent decides whether to
 * accept it (advancing `fen`) or reject it (board snaps back).
 */
export default function BoardView({
  fen,
  orientation = 'white',
  interactive = false,
  onUserMove,
  lastMove = null,
  hintSquare = null,
  errorFlash = 0,
  animationMs = 220,
}) {
  const [selected, setSelected] = useState(null);
  const [shake, setShake] = useState(false);
  const wrapRef = useRef(null);

  // reset any selection whenever the position changes underneath us
  useEffect(() => {
    setSelected(null);
  }, [fen]);

  // red flash + shake when the parent bumps errorFlash
  useEffect(() => {
    if (!errorFlash) return;
    setShake(true);
    const t = setTimeout(() => setShake(false), 480);
    return () => clearTimeout(t);
  }, [errorFlash]);

  function attempt(from, to) {
    if (!interactive || !onUserMove) return false;
    const promotion = isPromotion(fen, from, to) ? 'q' : undefined;
    return onUserMove(from, to, promotion);
  }

  function onSquareClick({ square, piece }) {
    if (!interactive) return;
    if (selected && square !== selected) {
      const targets = legalTargets(fen, selected);
      if (targets.includes(square)) {
        attempt(selected, square);
        setSelected(null);
        return;
      }
    }
    if (piece && legalTargets(fen, square).length) {
      setSelected(square);
    } else {
      setSelected(null);
    }
  }

  function onPieceDrop({ sourceSquare, targetSquare }) {
    setSelected(null);
    if (!targetSquare) return false;
    return attempt(sourceSquare, targetSquare);
  }

  const squareStyles = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { ...LAST_MOVE };
    squareStyles[lastMove.to] = { ...LAST_MOVE };
  }
  if (selected) {
    squareStyles[selected] = { ...(squareStyles[selected] || {}), ...SELECTED };
    for (const t of legalTargets(fen, selected)) {
      const occupied = fenHasPiece(fen, t);
      squareStyles[t] = { ...(squareStyles[t] || {}), ...(occupied ? CAPTURE_DOT : DOT) };
    }
  }
  if (hintSquare) {
    squareStyles[hintSquare] = { ...(squareStyles[hintSquare] || {}), ...HINT };
  }

  return (
    <div ref={wrapRef} className={`board-wrap${shake ? ' board-shake' : ''}`}>
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: interactive,
          onPieceDrop,
          onSquareClick,
          squareStyles,
          animationDurationInMs: animationMs,
          darkSquareStyle: { backgroundColor: '#6c7a89' },
          lightSquareStyle: { backgroundColor: '#c7cfd6' },
          showNotation: true,
          id: 'trap-board',
        }}
      />
    </div>
  );
}

function fenHasPiece(fen, square) {
  // cheap check without constructing a Chess: parse the board part of the FEN
  const board = fen.split(' ')[0].split('/');
  const file = square.charCodeAt(0) - 97; // a=0
  const rank = 8 - Number(square[1]); // rank 8 => row 0
  let col = 0;
  for (const ch of board[rank]) {
    if (/\d/.test(ch)) col += Number(ch);
    else {
      if (col === file) return true;
      col += 1;
    }
    if (col > file) break;
  }
  return false;
}
