// Thin promise wrapper around the bundled single-threaded Stockfish (WASM).
// Used offline to evaluate positions and extract principal variations when
// authoring / vetting seed traps. Not shipped to the browser.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINE = path.join(ROOT, 'node_modules', 'stockfish', 'bin', 'stockfish-18-lite-single.js');

let enginePromise = null;

async function getEngine() {
  if (enginePromise) return enginePromise;
  const initEngine = require('stockfish');
  enginePromise = initEngine(ENGINE).then((engine) => {
    engine.listener = () => {}; // replaced per-analysis
    engine.sendCommand('uci');
    engine.sendCommand('setoption name Threads value 1');
    engine.sendCommand('setoption name Hash value 64');
    return engine;
  });
  return enginePromise;
}

/**
 * Evaluate a FEN. Returns { cp, mate, bestmove, pv } where cp is centipawns
 * from White's perspective (mate is signed plies-to-mate, White-positive).
 */
export async function evaluate(fen, { depth = 16, movetime } = {}) {
  const engine = await getEngine();
  return new Promise((resolve) => {
    let lastInfo = null;
    engine.listener = (line) => {
      if (typeof line !== 'string') return;
      if (line.startsWith('info') && line.includes(' score ') && line.includes(' pv ')) {
        lastInfo = line;
      } else if (line.startsWith('bestmove')) {
        const bestmove = line.split(' ')[1];
        resolve(parseInfo(lastInfo, bestmove, fen));
      }
    };
    engine.sendCommand(`position fen ${fen}`);
    engine.sendCommand(movetime ? `go movetime ${movetime}` : `go depth ${depth}`);
  });
}

function parseInfo(info, bestmove, fen) {
  const whiteToMove = fen.split(' ')[1] === 'w';
  if (!info) return { cp: 0, mate: null, bestmove, pv: [] };
  const scoreMatch = info.match(/ score (cp|mate) (-?\d+)/);
  const pvMatch = info.match(/ pv (.+)$/);
  const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];
  let cp = null;
  let mate = null;
  if (scoreMatch) {
    const val = Number(scoreMatch[2]);
    // engine reports from side-to-move perspective; normalise to White.
    const sign = whiteToMove ? 1 : -1;
    if (scoreMatch[1] === 'cp') cp = val * sign;
    else mate = val * sign;
  }
  return { cp, mate, bestmove, pv };
}

export async function shutdown() {
  if (!enginePromise) return;
  const engine = await enginePromise;
  try {
    engine.sendCommand('quit');
  } catch {
    /* ignore */
  }
}
