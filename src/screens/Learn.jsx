import { useEffect, useMemo, useRef, useState } from 'react';
import BoardView from '../components/BoardView.jsx';
import { buildTimeline, orientationFor, OPENINGS } from '../lib/engine.js';
import { statusOf } from '../lib/srs.js';

const PHASE_LABEL = {
  line: 'Book',
  mistake: 'Mistake',
  mine: 'Punish',
  reply: 'Reply',
};

export default function Learn({ traps, onBack, title }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = traps.find((t) => t.id === selectedId) || null;

  if (!selected) {
    return <TrapList traps={traps} title={title} onBack={onBack} onPick={setSelectedId} />;
  }
  return <TrapWalkthrough trap={selected} onBack={() => setSelectedId(null)} />;
}

function TrapList({ traps, title, onBack, onPick }) {
  return (
    <div className="screen">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ‹ Home
        </button>
        <h2>{title}</h2>
        <span className="spacer" />
      </header>
      <p className="hint-text">Sorted by how often they pay off. Tap one to walk through it.</p>
      <ul className="trap-list">
        {traps.map((t, i) => (
          <li key={t.id}>
            <button className="trap-row" onClick={() => onPick(t.id)}>
              <span className="rank-badge">{i + 1}</span>
              <span className="trap-row-main">
                <span className="trap-row-name">{t.name}</span>
                <span className="trap-row-sub">
                  {t.mistake.freqPct}% play it · {t.mistake.winRate}% for us · {t.payoff}
                </span>
              </span>
              <span className={`status-dot ${statusOf(t.id)}`} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrapWalkthrough({ trap, onBack }) {
  const { steps, fens, triggerIndex } = useMemo(() => buildTimeline(trap), [trap]);
  const [i, setI] = useState(0); // number of steps played (0 = start)
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);
  const orientation = orientationFor(trap);

  useEffect(() => {
    // restart the walkthrough whenever the trap changes
    setI(0);
    setAuto(true);
  }, [trap.id]);

  useEffect(() => {
    clearInterval(timer.current);
    if (auto && i < steps.length) {
      timer.current = setInterval(() => {
        setI((prev) => {
          if (prev >= steps.length) {
            clearInterval(timer.current);
            return prev;
          }
          return prev + 1;
        });
      }, 1150);
    }
    return () => clearInterval(timer.current);
  }, [auto, i, steps.length]);

  useEffect(() => {
    if (i >= steps.length) setAuto(false);
  }, [i, steps.length]);

  const lastStep = i > 0 ? steps[i - 1] : null;
  const lastMove = lastStep ? { from: lastStep.from, to: lastStep.to } : null;
  const done = i >= steps.length;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="ghost" onClick={onBack}>
          ‹ Traps
        </button>
        <h2 className="ellipsis">{trap.name}</h2>
        <span className="spacer" />
      </header>

      <BoardView fen={fens[i]} orientation={orientation} lastMove={lastMove} interactive={false} />

      <MoveStrip steps={steps} current={i} triggerIndex={triggerIndex} onJump={(n) => { setAuto(false); setI(n); }} />

      <Caption step={lastStep} done={done} trap={trap} atStart={i === 0} />

      <div className="controls">
        <button className="ctrl" onClick={() => { setAuto(false); setI(0); }} disabled={i === 0}>
          ⏮
        </button>
        <button className="ctrl" onClick={() => { setAuto(false); setI(Math.max(0, i - 1)); }} disabled={i === 0}>
          ‹
        </button>
        <button className="ctrl primary" onClick={() => setAuto((a) => !a)} disabled={done}>
          {auto ? '❚❚' : '▶'}
        </button>
        <button className="ctrl" onClick={() => { setAuto(false); setI(Math.min(steps.length, i + 1)); }} disabled={done}>
          ›
        </button>
        <button className="ctrl" onClick={() => { setAuto(false); setI(steps.length); }} disabled={done}>
          ⏭
        </button>
      </div>
    </div>
  );
}

function Caption({ step, done, trap, atStart }) {
  if (done) {
    return (
      <div className="caption payoff">
        <span className="tag win">Payoff</span>
        <p>{trap.payoff}.</p>
      </div>
    );
  }
  if (atStart || !step) {
    return (
      <div className="caption">
        <span className="tag">{OPENINGS[trap.opening].label}</span>
        <p>{OPENINGS[trap.opening].subtitle} — playing {OPENINGS[trap.opening].side}. Watch the trap unfold.</p>
      </div>
    );
  }
  if (step.phase === 'mistake') {
    return (
      <div className="caption mistake">
        <span className="tag bad">The mistake · {step.san}</span>
        <p>
          Played in {step.meta.freqPct}% of games here, but scores {step.meta.winRate}% for us. Now punish it.
        </p>
      </div>
    );
  }
  return (
    <div className={`caption ${step.phase === 'mine' ? 'mine' : 'reply'}`}>
      <span className={`tag ${step.phase === 'mine' ? 'good' : ''}`}>
        {PHASE_LABEL[step.phase]} · {step.san}
      </span>
      <p>{step.why}</p>
    </div>
  );
}

function MoveStrip({ steps, current, triggerIndex, onJump }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current?.querySelector('.mv.active');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [current]);
  return (
    <div className="move-strip" ref={ref}>
      {steps.map((s, idx) => {
        const num = Math.floor(idx / 2) + 1;
        const white = idx % 2 === 0;
        return (
          <button
            key={idx}
            className={`mv ${s.phase}${idx + 1 === current ? ' active' : ''}${idx === triggerIndex ? ' trigger' : ''}`}
            onClick={() => onJump(idx + 1)}
          >
            {white ? `${num}.` : ''}
            {s.san}
          </button>
        );
      })}
    </div>
  );
}
