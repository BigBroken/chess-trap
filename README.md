# Opening Trap Trainer — Scotch & Caro-Kann

A mobile-first web app that drills opening pitfalls and their punishing
follow-ups for two repertoires:

- **Scotch** as White — `1.e4 e5 2.Nf3 Nc6 3.d4`
- **Caro-Kann** as Black — `1.e4 c6`

The idea: learn the *mistakes your opponents actually play at club level*, and
the concrete way to punish each one. Trap data is meant to be sourced from real
[Lichess opening-explorer](https://explorer.lichess.ovh) game data (blitz/rapid,
1200–1800), not from theory.

---

## Quick start

```bash
npm install
npm run dev        # open the printed URL on your phone (or laptop)
```

Build for production / Vercel:

```bash
npm run build      # -> dist/ (static, no backend)
npm run preview
```

Deploying to Vercel: framework preset **Vite**, build `npm run build`, output
`dist`. Everything is client-side — no server, no login.

---

## How it's built

### Phase 1 — data pipeline (`scripts/build-traps.mjs`)

Walks each opening tree with the Lichess explorer API and flags common,
punishable opponent replies as traps. No API key needed.

```bash
npm run traps:build                 # both openings, depth ~12
node scripts/build-traps.mjs --opening=scotch --max-depth=12
```

- Rate-limited to ~1 req/sec with 429 backoff; raw responses cached under
  `data/cache/` keyed by move sequence, so re-runs are cheap.
- A reply is a **trap candidate** when it is *common* (played in ≥8% of games at
  a node with ≥500 total games) **and** *punishable* (my win rate after it ≥58%,
  or ≥8 points above the node average).
- For each candidate it follows the highest-win-rate continuation for my side to
  build the refutation, and writes everything to `data/traps.json`
  (sorted by `popularity_rank = frequency × win-rate delta`).
- Thin branches (<500 games) are pruned rather than loosening the thresholds.

> **Network note:** the explorer host (`explorer.lichess.ovh`) must be reachable.
> In sandboxes where it's blocked, the app instead ships a **provisional seed**
> (below); running `traps:build` where Lichess is reachable overwrites it with
> real data.

#### Provisional seed (`scripts/build-seed.mjs`)

Because this repo was built in an environment where the Lichess host was blocked
by network policy, `data/traps.json` currently holds a small **hand-authored,
engine-vetted** seed so the app is usable immediately. Every seed line was
checked with Stockfish 18 (see `scripts/analyze-candidates.mjs`) so the
refutations are sound against best defence; the frequency/win-rate figures are
honest **estimates**, not Lichess data, and each entry is flagged
`"provisional": true`. The home screen shows a banner while seed data is active.

```bash
npm run traps:seed        # regenerate the provisional data/traps.json
npm run traps:analyze     # re-run the Stockfish vetting of candidate mistakes
```

### Phase 2 — trainer app (Vite + React)

`chess.js` for move logic, [`react-chessboard`](https://github.com/Clariity/react-chessboard)
(v5) for a touch-friendly board (tap-tap **and** drag, legal-move dots).

- **Learn** — browse traps by opening, sorted by `popularity_rank`. Each trap
  auto-plays with move-by-move explanations, then you can step forward/back.
- **Quiz** — the app plays the line, animates the opponent's mistake, then
  *"Punish it."* Correct → advance with the note; wrong → shake + retry; a hint
  (highlighted piece) after 2 misses, the answer after 3. The board auto-flips
  to your side.
- **Mixed drill** — random traps from both openings, without telling you which.
- **Progress** — a Leitner spaced-repetition system in `localStorage`
  (`new → learning → known`, misses demote), with per-opening progress bars and
  a "due today" count on the home screen.

Dark theme, single column, board fills the width, controls sit in the thumb zone.

### Phase 3 — verification (`scripts/validate-traps.mjs`)

Replays every `line + mistake + punish` through chess.js and asserts all moves
are legal, the stored FEN matches the line, and the punish alternates sides
correctly. Runs in CI and as a pre-commit hook.

```bash
npm run traps:validate
```

- **CI:** `.github/workflows/ci.yml` runs validate + lint + build on every push/PR.
- **Pre-commit:** `npm install` points `core.hooksPath` at `.githooks/`, so
  `.githooks/pre-commit` validates the data before every commit.

---

## Project layout

```
scripts/
  build-traps.mjs        Phase 1 — Lichess explorer pipeline -> data/traps.json
  build-seed.mjs         provisional engine-vetted seed -> data/traps.json
  validate-traps.mjs     Phase 3 — legality/consistency checker (CI + pre-commit)
  analyze-candidates.mjs offline Stockfish vetting of candidate mistakes
  lib/
    chess-helpers.mjs    SAN replay, FEN, UCI->SAN, material
    tactics.mjs          forcing-line search (used while vetting the seed)
    engine-eval.mjs      Stockfish 18 (WASM) wrapper — offline only
data/
  traps.json             the dataset the app bundles
  cache/                 cached Lichess explorer responses
src/
  screens/               Home, Learn, Quiz
  components/BoardView   react-chessboard wrapper (tap-tap + drag + dots)
  lib/                   engine (timeline), traps (loader), srs (Leitner)
```

## Trap schema

```jsonc
{
  "id": "scotch-e5-ng4",
  "opening": "scotch",                 // "scotch" | "caro-kann"
  "name": "Scotch: ...Ng4 knight lunge",
  "line": ["e4","e5","Nf3","Nc6","d4","exd4","Nxd4","Nf6","Nxc6","bxc6","e5"],
  "fen": "…",                          // position at the trigger (opponent to move)
  "mistake": { "san": "Ng4", "freqPct": 4, "winRate": 78 },
  "punish": [ { "san": "Qxg4", "why": "…nothing defends g4 — the queen just takes it." } ],
  "payoff": "wins a piece",
  "popularity_rank": 112               // frequency × win-rate delta
}
```
