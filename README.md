# Chess — Lelele Games

A pure front-end chess game for the Lelele Games platform and standalone browsers.

Built with native HTML, CSS and JavaScript ES Modules. No build step, no Node.js
server, no Python backend and no database are required at runtime.

## Features

- **Local two-player game** with full move validation.
- **Computer opponent** with Easy / Medium / Hard levels, running in a Web Worker.
- **Online two-player game** over WebRTC data channels.
- **Complete chess rules**: castling, en passant, promotion, check, checkmate,
  stalemate, threefold repetition, the 50-move rule and insufficient material.
- **Move history** in Standard Algebraic Notation, undo/redo, resign and draw.
- **Animations** for movement, captures and captured-piece gravestones.
- **English / Simplified Chinese** interface (English by default).
- **Local persistence** for settings, statistics, match records and saved games,
  with JSON export/import and safe degradation when `localStorage` is blocked.
- **LeleleSDK integration** for player name, score, leaderboard, rating, sharing
  and game navigation when running inside the platform player.

## Running locally

ES Modules require HTTP, so open the folder through a static server:

```bash
cd chess
python3 -m http.server 8000
# then open http://localhost:8000/
```

Any static host (GitHub Pages, Cloudflare Pages, etc.) works. Deploy the whole
folder as-is; no generated files are needed.

## Online play — important limitation

A four-digit room code **cannot** by itself connect two browsers on the internet.
There is no signaling server in this repository, and adding one would require a
backend, which is outside the project's pure static architecture.

This project therefore uses a **manual signaling adapter**:

1. The host creates a room and receives a four-digit code plus a generated
   "Your signal" text (SDP with ICE candidates embedded).
2. The guest enters the same code and pastes the host's signal, then copies the
   generated answer back to the host.
3. The host pastes the answer. Both sides then connect directly over WebRTC.

You can exchange the two texts through any channel you already have (chat,
email, messaging). No account, API key or server is involved.

Limitations:

- Peers behind restrictive symmetric NAT may still fail to connect because no
  TURN relay is configured. Adding a TURN service would require an external
  credential and is not included.
- Reconnection re-runs the same handshake; the host resends the authoritative
  move list, which the guest validates through the rules engine before use.

## LeleleSDK

`src/sdk.js` is a thin adapter around the official script:

```html
<script src="https://game.leleleling.site/lelele-sdk.js"></script>
```

The official SDK exposes `window.LeleleSDK` (it has no `init()` method and no ES
module export). See <https://game.leleleling.site/sdk-docs>. Outside the
platform player all SDK operations safely no-op.

## Tests

Rule, AI, protocol and storage-independent tests use only Node's built-in test
runner:

```bash
cd chess
node --test tests/*.test.mjs
```

Browser smoke tests require a static server; the project has no Playwright or
other runtime dependency.

## Project structure

```
index.html          Page structure
styles/             Board, components, layout and animation styles
src/chess-rules.js  Pure rules engine (no DOM)
src/game.js         Game controller: moves, undo, history, results
src/ai.js           Minimax + alpha-beta evaluation
src/ai-worker.js    Web Worker message protocol
src/ui.js           Board rendering and interaction
src/animations.js   Movement, capture and gravestone effects
src/language.js     English / Chinese strings and language manager
src/storage.js      Settings, statistics, matches and saved games
src/sdk.js          LeleleSDK adapter
src/network.js      WebRTC transport + manual signaling adapter
src/online.js       Room, handshake and game events
src/main.js         Application controller
tests/              Node test runner suites
```

## Copyright

Copyright © 2026 Lelele Games. All rights reserved.

This repository is provided for viewing purposes only. No permission is granted
to use, copy, modify, redistribute, or publish this project's code or assets
without prior written permission from the copyright holder.
