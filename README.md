# Lelele Sudoku — 了了了数独

A pure front-end sudoku game for the Lelele Games platform and standalone browsers.
Built with native HTML, CSS and JavaScript ES Modules. No build step, no backend,
no database and no user account are required.

## Features

- **Board sizes**: 4 × 4 Mini, 6 × 6 Mini, 9 × 9 Classic and 16 × 16 Mega (1–9, A–G).
- **Variants**: Diagonal, Jigsaw, Killer, Thermo, Consecutive, Windoku, Arrow and Samurai.
  Every variant has real constraint checking, solving and generation logic.
- **Modes**: Classic, Daily Challenge, Time Attack and Variant Puzzles.
- **Five difficulty levels** based on actual solving techniques, search depth and clue
  density, not on the number of empty cells alone.
- **Unique-solution generator**: every generated puzzle is verified to have exactly one
  solution. Deterministic seeds power reproducible puzzles and the daily challenge.
- **Human-style solver**: ten logical techniques (Naked/Hidden Singles, Pairs, Triples,
  Pointing, Box-Line, X-Wing, Swordfish, XY-Wing) with explanations and step-by-step hints.
- **Play tools**: notes, auto candidates, instant error check, undo/redo, hints, erase,
  timer, keyboard input, mobile number pad, autosave and resume.
- **Local records**: per size, variant, difficulty and mode statistics, best and average
  times, mistake/hint totals and local daily streaks.
- **English / Simplified Chinese**, English by default.
- **LeleleSDK** integration with graceful fallback outside the platform player.

Daily Challenge and all statistics are stored locally on the device. This project does
not provide a global daily leaderboard or cloud saves.

## Running locally

ES Modules require HTTP, so serve the folder through any static server:

```bash
cd sudoku
python3 -m http.server 8000
# open http://localhost:8000/
```

Any static host works (GitHub Pages, Cloudflare Pages, nginx, etc.). Deploy the whole
folder as-is; generated puzzles are computed in the browser and no build output is needed.

`index.html` is the only entry point. Generation and solving run in a Web Worker when
available, with an in-page fallback if Workers are unavailable.

## Controls

- Mouse / touch: select a cell, then tap a digit on the number pad.
- Keyboard: arrow keys move, `1`–`9` and `A`–`G` enter digits, `N` toggles notes,
  `H` opens hints, `Z` undo, `Y` redo, `Backspace` erases, `Space` pauses.

## Tests

Tests use only Node's built-in test runner:

```bash
node --test tests/*.test.mjs
```

There are no runtime or development dependencies.

## LeleleSDK

`src/sdk.js` is the same verified adapter used by other Lelele Games projects. It loads
the official script on demand and safely no-ops outside the platform player. The game
calls `submitScore` on completion and can call `shareScore`, `nextGame`, `getLeaderboard`,
`getPlayerName`, `isInPlatform` and `openDetail` when the SDK reports platform context.

## Project structure

```
index.html              Page entry
styles/                 Layout, components, board, variants and animations
src/config.js           Sizes, symbols, modes and difficulty configuration
src/constraints.js      Generic board spec and constraint validation
src/solver.js           Propagation + backtracking solver, solution counting
src/techniques.js       Human solving techniques and deduction steps
src/difficulty.js       Multi-factor difficulty evaluation
src/generator.js        Seeded full-grid generation, digging and variant builders
src/daily-challenge.js  Deterministic local-date puzzles
src/game-state.js       Values, notes, history, mistakes, hints and saves
src/storage.js          Versioned localStorage adapter
src/statistics.js       Local statistics aggregation
src/board.js            Board rendering and variant overlays
src/main.js             Application controller
src/solver-worker.js    Web Worker task protocol
src/language.js         English / Chinese strings
src/sound.js            WebAudio feedback
src/animations.js       Lightweight visual feedback
src/sdk.js              LeleleSDK adapter
tests/                  Node test suites
```

Made by Lelele Games.
