# Architecture / ADR 001

## Runtime

Electron 44.9.0 + React 19.3.1 + TypeScript 5.9.3 + PDF.js 5.4.624. Dependencies are locked. No remote application API, CDN, or database.

- Main owns windows, dialogs, file selection, resource protocol and request allowlist.
- Sandboxed renderer has no Node integration and only a preload bridge. All content renders as React text/components, never arbitrary extracted HTML.
- A Node worker thread owns `node:sqlite` DatabaseSync, serialized writes, document extraction and import checkpoints. Async PDF work yields between pages; SQLite commits happen per page. UI is not blocked by parsing.
- PDF.js in the renderer renders the source, selectable text layer, and graph/figure crops on demand.

## Decisions based on executed probes

1. Use Electron's bundled Node 24 SQLite rather than better-sqlite3. FTS5, persistence and transactions were verified in Node and in the Electron app. This avoids an unnecessary Electron ABI rebuild. SQLite API stability follows the pinned runtime, not an assumed system Node version.
2. Use a Node worker rather than Electron utilityProcess. PDF.js treats Electron utility processes as browser-like and its Node DOMMatrix/file factories do not initialize there. A probe confirmed worker_threads have `process.type === undefined`, which selects the supported Node implementation. The worker then passed real app import tests. This is thread isolation, not OS process crash isolation.
3. Preserve complex scientific figures through source-region rendering, including vector drawing bounds. No external conversion service. Regions are heuristics and must be verified against the target textbook.
4. Windows cross builds use a separate staging app with `npm ci --os=win32 --cpu=x64 --omit=dev`, ensuring the N-API Canvas Windows binary is included rather than the Linux binary. Native Windows builds use normal npm ci.

## Resource boundary

`cpss://app/` serves only the built renderer directory; traversal is rejected. `cpss://book/<sha256>/source.pdf` serves only the managed PDF with byte-range support. Main denies unrelated external requests and navigation. Renderer CSP disallows arbitrary scripts and embedded objects. Local PDF fonts/CMaps/WASM are bundled.

## Import behavior

Stream source hash → verify PDF → copy and verify → per-page text/layout/graphics → transactional page/FTS checkpoint → real PDF outline or explicitly labelled inferred/fallback navigation → ready.

One worker permits multiple asynchronous imports but each SQLite write is synchronous/serialized. Initial page extraction concurrency per book is one. Duplicate managed PDFs are identified by full SHA-256. Pause is effective between pages. Interrupted imports reopen as paused. Import progress counts committed pages, not an invented ETA.

There is currently no OCR, exhaustive visual-layout model, lossless table reconstruction, or cross-converter revision migration. Do not label this a fully verified NSCA conversion until the book is accessible and a coverage report exists.
