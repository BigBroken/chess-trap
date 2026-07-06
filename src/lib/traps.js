// Loads the trap dataset (produced by scripts/build-traps.mjs or the seed
// builder) and exposes convenience selectors. The JSON is bundled at build
// time so the app needs no backend.
import data from '../../data/traps.json';
import { OPENINGS } from './engine.js';

export const meta = {
  generatedAt: data.generatedAt,
  source: data.source,
  provisional: data.source !== 'lichess-explorer',
};

export const allTraps = [...(data.traps ?? [])].sort(
  (a, b) => (b.popularity_rank ?? 0) - (a.popularity_rank ?? 0),
);

export const openings = Object.values(OPENINGS);

export function trapsForOpening(openingId) {
  return allTraps.filter((t) => t.opening === openingId);
}

export function trapById(id) {
  return allTraps.find((t) => t.id === id);
}
