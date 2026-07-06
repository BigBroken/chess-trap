// Dead-simple Leitner spaced repetition, persisted to localStorage.
// Boxes: 0 = new/struggling, 1 = learning, 2 = known.
// Correct in quiz promotes a box (longer interval); a miss demotes it.
const KEY = 'trap-srs-v1';
const DAY = 86_400_000;
const INTERVALS = [0, 1 * DAY, 4 * DAY]; // per box, until next due

function now() {
  return Date.now();
}

export function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
  // let any mounted screen know progress changed
  window.dispatchEvent(new Event('srs-change'));
}

export function getRecord(id) {
  return load()[id] || null;
}

/** 'new' (untouched) | 'learning' | 'known' */
export function statusOf(id, map = load()) {
  const rec = map[id];
  if (!rec) return 'new';
  return rec.box >= 2 ? 'known' : 'learning';
}

export function isDue(id, map = load()) {
  const rec = map[id];
  if (!rec) return true; // never seen => due
  return rec.due <= now();
}

/** Record a quiz attempt result and reschedule. */
export function recordResult(id, correct) {
  const map = load();
  const rec = map[id] || { box: 0, attempts: 0, correct: 0, due: 0 };
  rec.attempts += 1;
  if (correct) {
    rec.correct += 1;
    rec.box = Math.min(rec.box + 1, 2);
  } else {
    rec.box = Math.max(rec.box - 1, 0);
  }
  rec.due = now() + INTERVALS[rec.box];
  rec.lastSeen = now();
  map[id] = rec;
  save(map);
  return rec;
}

/** Aggregate progress for a set of traps. */
export function progressFor(traps) {
  const map = load();
  const counts = { total: traps.length, known: 0, learning: 0, fresh: 0, due: 0 };
  for (const t of traps) {
    const status = statusOf(t.id, map);
    if (status === 'known') counts.known += 1;
    else if (status === 'learning') counts.learning += 1;
    else counts.fresh += 1;
    if (isDue(t.id, map)) counts.due += 1;
  }
  return counts;
}

export function dueTraps(traps) {
  const map = load();
  return traps.filter((t) => isDue(t.id, map));
}

export function resetAll() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('srs-change'));
}
