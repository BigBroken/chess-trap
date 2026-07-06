import { useEffect, useMemo, useRef, useState } from 'react';
import BoardView from '../components/BoardView.jsx';
import { buildTimeline, orientationFor, tryMoveSan, OPENINGS } from '../lib/engine.js';
import { recordResult } from '../lib/srs.js';

/**
 * Drives a queue of traps in quiz form. Used for single-opening quizzes,
 * the mixed drill, and the "due today" session. `hideOpening` powers the
 * mixed drill, where we don't announce which opening a trap is from.
 */
export default function Quiz({ traps, onBack, title, hideOpening = false }) {
  const [qi, setQi] = useState(0);
  const [results, setResults] = useState([]); // booleans
  const trap = traps[qi];

  function handleComplete(pass) {
    setResults((r) => (r.length > qi ? r : [...r, pass]));
  }
  function next() {
    if (qi + 1 < traps.length) setQi(qi + 1);
    else setQi(traps.length); // summary
  }

  if (!traps.length) {
    return (
      <div className="screen">
        <Top title={title} onBack={onBack} />
        <div className="empty-state">
          <p>Nothing to drill here right now. 🎉</p>
        </div>
      </div>
    );
  }

  if (qi >= traps.length) {
    const passed = results.filter(Boolean).length;
    return (
      <div className="screen">
        <Top title={title} onBack={onBack} />
        <div className="empty-state">
          <h3>Session complete</h3>
          <p className="big-score">
            {passed}/{traps.length}
          </p>
          <p className="hint-text">clean solves</p>
          <button className="btn primary wide" onClick={onBack}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <Top
        title={title}
        onBack={onBack}
        progress={`${qi + 1} / ${traps.length}`}
      />
      <TrapQuiz key={trap.id} trap={trap} hideOpening={hideOpening} onComplete={handleComplete} onNext={next} />
    </div>
  );
}

function Top({ title, onBack, progress }) {
  return (
    <header className="topbar">
      <button className="ghost" onClick={onBack}>
        ‹ Home
      </button>
      <h2 className="ellipsis">{title}</h2>
      <span className="progress-pill">{progress}</span>
    </header>
  );
}

function TrapQuiz({ trap, hideOpening, onComplete, onNext }) {
  const { steps, fens, triggerIndex } = useMemo(() => buildTimeline(trap), [trap]);
  const orientation = orientationFor(trap);

  const [played, setPlayed] = useState(0);
  const [phase, setPhase] = useState('intro'); // intro -> solve -> done
  const [misses, setMisses] = useState(0);
  const [hint, setHint] = useState(false);
  const [errorFlash, setErrorFlash] = useState(0);
  const [failedTrap, setFailedTrap] = useState(false);
  const completedRef = useRef(false);
  const timer = useRef(null);

  // Drive intro auto-play, reply auto-play, and completion.
  useEffect(() => {
    clearTimeout(timer.current);

    if (played >= steps.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        setPhase('done');
        recordResult(trap.id, !failedTrap);
        onComplete(!failedTrap);
      }
      return;
    }

    if (phase === 'intro') {
      if (played === triggerIndex + 1) {
        setPhase('solve');
        return;
      }
      const delay = played < triggerIndex ? 380 : 950; // linger on the blunder
      timer.current = setTimeout(() => setPlayed((p) => p + 1), delay);
      return;
    }

    if (phase === 'solve' && steps[played]?.phase === 'reply') {
      timer.current = setTimeout(() => setPlayed((p) => p + 1), 700);
    }
    return () => clearTimeout(timer.current);
  }, [played, phase, steps, triggerIndex, trap.id, failedTrap, onComplete]);

  function onUserMove(from, to, promotion) {
    const expected = steps[played];
    if (!expected || expected.phase !== 'mine') return false;
    const san = tryMoveSan(fens[played], from, to, promotion);
    if (san && san === expected.san) {
      setMisses(0);
      setHint(false);
      setPlayed((p) => p + 1);
      return true;
    }
    const m = misses + 1;
    setMisses(m);
    setErrorFlash((f) => f + 1);
    if (m >= 3) {
      // reveal the answer and move on, marking the trap as missed
      setFailedTrap(true);
      setHint(false);
      setMisses(0);
      setPlayed((p) => p + 1);
    } else if (m >= 2) {
      setHint(true);
    }
    return false;
  }

  const userToMove = phase === 'solve' && steps[played]?.phase === 'mine';
  const lastStep = played > 0 ? steps[played - 1] : null;
  const lastMove = lastStep ? { from: lastStep.from, to: lastStep.to } : null;
  const hintSquare = hint && userToMove ? steps[played].from : null;

  return (
    <>
      <div className="quiz-banner">
        {hideOpening ? (
          <span className="tag muted">Mixed · which trap is this?</span>
        ) : (
          <span className="tag">{OPENINGS[trap.opening].label} · you play {orientation}</span>
        )}
      </div>

      <BoardView
        fen={fens[played]}
        orientation={orientation}
        interactive={userToMove}
        onUserMove={onUserMove}
        lastMove={lastMove}
        hintSquare={hintSquare}
        errorFlash={errorFlash}
      />

      <QuizCaption
        phase={phase}
        userToMove={userToMove}
        lastStep={lastStep}
        misses={misses}
        failedTrap={failedTrap}
        trap={trap}
        triggerIndex={triggerIndex}
        played={played}
      />

      <div className="controls">
        {phase === 'done' ? (
          <button className="btn primary wide" onClick={onNext}>
            {failedTrap ? 'Next trap ›' : 'Nailed it — next ›'}
          </button>
        ) : (
          <div className="quiz-status">
            {userToMove ? (
              <span className="pulse">Your move</span>
            ) : (
              <span className="muted-text">watching…</span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function QuizCaption({ phase, userToMove, lastStep, misses, failedTrap, trap, triggerIndex, played }) {
  if (phase === 'done') {
    return (
      <div className={`caption ${failedTrap ? 'mistake' : 'payoff'}`}>
        <span className={`tag ${failedTrap ? 'bad' : 'win'}`}>{failedTrap ? 'Revealed' : 'Solved'}</span>
        <p>{trap.payoff}.</p>
      </div>
    );
  }
  if (phase === 'intro') {
    if (played === triggerIndex + 1 && lastStep?.phase === 'mistake') {
      return (
        <div className="caption mistake">
          <span className="tag bad">Blunder · {lastStep.san}</span>
          <p>Punish it.</p>
        </div>
      );
    }
    return (
      <div className="caption">
        <span className="tag">{OPENINGS[trap.opening].subtitle}</span>
        <p>Playing the line…</p>
      </div>
    );
  }
  // solve
  if (userToMove) {
    const justReplied = lastStep?.phase === 'reply';
    return (
      <div className="caption mine">
        <span className="tag good">Punish it</span>
        <p>
          {justReplied ? `They reply ${lastStep.san}. ` : ''}
          Find the move on the board.
          {misses >= 2 && ' Hint: the highlighted piece.'}
          {misses === 1 && ' Not quite — try again.'}
        </p>
      </div>
    );
  }
  // after correct mine move, showing why while reply plays
  if (lastStep && (lastStep.phase === 'mine' || lastStep.phase === 'reply')) {
    return (
      <div className="caption mine">
        <span className="tag good">{lastStep.san}</span>
        <p>{lastStep.why}</p>
      </div>
    );
  }
  return <div className="caption" />;
}
