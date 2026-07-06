#!/usr/bin/env node
// Phase 3 -- replay every trap through chess.js to prove all moves are legal
// and internally consistent. Runs in CI / pre-commit. Exits non-zero on any
// problem so bad data can never be committed.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Chess } from 'chess.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'traps.json');

const REQUIRED = ['id', 'opening', 'name', 'line', 'fen', 'mistake', 'punish', 'payoff', 'popularity_rank'];

function validateTrap(trap, index) {
  const errors = [];
  const where = `trap[${index}] ${trap.id || '(no id)'}`;

  for (const key of REQUIRED) {
    if (trap[key] === undefined || trap[key] === null) errors.push(`${where}: missing "${key}"`);
  }
  if (errors.length) return errors;

  if (!['scotch', 'caro-kann'].includes(trap.opening)) {
    errors.push(`${where}: unknown opening "${trap.opening}"`);
  }

  // 1) the line must be legal from the start
  let chess;
  try {
    chess = new Chess();
    trap.line.forEach((san) => {
      if (!chess.move(san)) throw new Error(`illegal line move ${san}`);
    });
  } catch (e) {
    errors.push(`${where}: ${e.message}`);
    return errors;
  }

  // 2) the stored FEN must match the position after the line
  if (chess.fen() !== trap.fen) {
    errors.push(`${where}: fen mismatch\n    stored:   ${trap.fen}\n    computed: ${chess.fen()}`);
  }

  // 3) at the trigger, the OPPONENT (not my side) must be to move
  const mySide = trap.opening === 'scotch' ? 'w' : 'b';
  if (chess.turn() === mySide) {
    errors.push(`${where}: at trigger it is my move, but a trap needs the opponent to move`);
  }

  // 4) the mistake must be legal
  if (!chess.move(trap.mistake.san)) {
    errors.push(`${where}: illegal mistake move ${trap.mistake.san}`);
    return errors;
  }

  // 5) after the mistake it must be MY move, and punish moves must alternate
  if (chess.turn() !== mySide) {
    errors.push(`${where}: after the mistake it should be my move`);
  }
  trap.punish.forEach((step, i) => {
    const shouldBeMine = i % 2 === 0;
    const isMine = chess.turn() === mySide;
    if (shouldBeMine !== isMine) {
      errors.push(`${where}: punish[${i}] side-to-move parity is wrong`);
    }
    if (!step.san || typeof step.why !== 'string' || !step.why.length) {
      errors.push(`${where}: punish[${i}] missing san/why`);
    }
    if (!chess.move(step.san)) {
      errors.push(`${where}: illegal punish move ${step.san} at index ${i} (from ${chess.fen()})`);
      throw new StopTrap(errors);
    }
  });

  return errors;
}

class StopTrap extends Error {
  constructor(errors) {
    super('stop');
    this.errors = errors;
  }
}

async function main() {
  const raw = JSON.parse(await readFile(DATA, 'utf8'));
  const traps = raw.traps || [];
  const allErrors = [];
  const seenIds = new Set();

  traps.forEach((trap, i) => {
    if (seenIds.has(trap.id)) allErrors.push(`duplicate id: ${trap.id}`);
    seenIds.add(trap.id);
    try {
      allErrors.push(...validateTrap(trap, i));
    } catch (e) {
      if (e instanceof StopTrap) allErrors.push(...e.errors);
      else throw e;
    }
  });

  const byOpening = { scotch: 0, 'caro-kann': 0 };
  traps.forEach((t) => { byOpening[t.opening] = (byOpening[t.opening] || 0) + 1; });

  console.log(`Validated ${traps.length} traps  (scotch: ${byOpening.scotch}, caro-kann: ${byOpening['caro-kann']})`);
  if (allErrors.length) {
    console.error(`\n✗ ${allErrors.length} problem(s):\n`);
    allErrors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }
  console.log('✓ all lines, mistakes and punishes are legal and consistent');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
