import { useEffect, useState } from 'react';
import { openings, trapsForOpening, allTraps, meta } from '../lib/traps.js';
import { progressFor, dueTraps, resetAll } from '../lib/srs.js';

export default function Home({ onStart }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('srs-change', bump);
    return () => window.removeEventListener('srs-change', bump);
  }, []);

  const dueAll = dueTraps(allTraps);
  const totalProgress = progressFor(allTraps);

  return (
    <div className="screen home">
      <header className="home-head">
        <h1>Trap Trainer</h1>
        <p className="tagline">Punish the mistakes your opponents actually play.</p>
      </header>

      {meta.provisional && (
        <div className="banner">
          <strong>Provisional seed data.</strong> Run{' '}
          <code>node scripts/build-traps.mjs</code> where Lichess is reachable to
          replace these with real club-level traps.
        </div>
      )}

      <button
        className="due-card"
        disabled={!dueAll.length}
        onClick={() => onStart({ name: 'quiz', traps: dueAll, title: 'Due today' })}
      >
        <span className="due-count">{dueAll.length}</span>
        <span className="due-label">{dueAll.length ? 'traps due for review' : 'nothing due — nice'}</span>
      </button>

      {openings.map((op) => {
        const traps = trapsForOpening(op.id);
        const p = progressFor(traps);
        return (
          <section className="opening-card" key={op.id}>
            <div className="opening-head">
              <div>
                <h2>{op.label}</h2>
                <span className="opening-sub">
                  {op.subtitle} · play {op.side}
                </span>
              </div>
              <span className="count-chip">{traps.length} traps</span>
            </div>

            <ProgressBar p={p} />

            <div className="card-actions">
              <button
                className="btn"
                disabled={!traps.length}
                onClick={() => onStart({ name: 'learn', traps, title: `Learn · ${op.label}` })}
              >
                Learn
              </button>
              <button
                className="btn primary"
                disabled={!traps.length}
                onClick={() => onStart({ name: 'quiz', traps, title: `Quiz · ${op.label}` })}
              >
                Quiz
              </button>
            </div>
          </section>
        );
      })}

      <button
        className="btn wide mixed"
        disabled={allTraps.length < 2}
        onClick={() =>
          onStart({
            name: 'quiz',
            traps: shuffle(allTraps),
            title: 'Mixed drill',
            hideOpening: true,
          })
        }
      >
        🎲 Mixed drill — both openings, no hints
      </button>

      <footer className="home-foot">
        <span>
          {totalProgress.known}/{totalProgress.total} known · {totalProgress.learning} learning
        </span>
        <button
          className="link"
          onClick={() => {
            if (confirm('Reset all progress?')) resetAll();
          }}
        >
          Reset progress
        </button>
      </footer>
    </div>
  );
}

function ProgressBar({ p }) {
  const pct = (n) => (p.total ? (n / p.total) * 100 : 0);
  return (
    <div className="progress" role="img" aria-label={`${p.known} known, ${p.learning} learning`}>
      <div className="seg known" style={{ width: `${pct(p.known)}%` }} />
      <div className="seg learning" style={{ width: `${pct(p.learning)}%` }} />
      {p.due > 0 && <span className="due-badge">{p.due} due</span>}
    </div>
  );
}

function shuffle(arr) {
  // deterministic-enough shuffle without Math.random dependence at module load
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(((i * 9301 + 49297 + Date.now()) % 233280) / 233280 * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
