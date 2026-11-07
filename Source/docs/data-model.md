# Data model v1

The SQLite database uses WAL, foreign-key checks and a five-second busy timeout. Schema version is persisted in meta. Future versions must introduce migration backup/rollback before changing schema; version 0.1.0 only creates v1 and rejects unsupported version values. No claim of tested upgrades from earlier releases.

| Table | Purpose |
| --- | --- |
| books | SHA-256 identity, title, language, page count, status, committed checkpoint, error |
| pages | PDF index, print label, dimensions, graphic regions, conversion issues |
| blocks | Persistent source-derived ID, semantic kind, display text/runs, source bounds, reading order |
| text_search | FTS5 index of all nonempty content blocks |
| toc | Source outline hierarchy or clearly labelled heading/page fallback |
| records | Validated highlight/underline/note/bookmark/card/task payloads |
| positions | Last PDF page and optional HTML block |
| progress | User-selected node learning status |
| settings | Theme, reading preferences and last book |
| translation_links | Future many-to-many cross-language block associations |
| question_banks, questions, practice_sessions, answers | Future independent practice module |

Book IDs equal full file SHA-256. Notes are not deleted by page replacement. Identical source imports reuse the same book; changed PDFs become distinct books. A stable `pdfjs-layout-v1` revision is recorded in anchors. Block IDs use book/page/order and remain stable for resumed import with the same converter; they are not a general migration guarantee across converter changes.

HTML anchors include start/end block, UTF-16 offsets, exact selected text, surrounding context and source page. Multi-block ranges are supported within the displayed PDF page. A single-block shifted quote can be uniquely recovered; ambiguous matches are not silently guessed. PDF anchors use source page, quote and normalized page rectangles, independent of zoom. PDF-to-HTML anchor transfer is not implemented.

Current extraction preserves source strings and joins line/paragraph boundaries without aggressive dehyphenation. It does not yet provide a general original-to-normalized character mapping. Search returns original block identities, so indexed source text maps directly back to displayed blocks.

Backups use `format=cpss-lab` and `schemaVersion=6`, including book identities and metadata, records, positions, progress, settings, practice answers, custom banks, manual chapters and question drafts. Restore also accepts versions 1–5. New answers include an immutable question snapshot and its SHA-256 content identifier; case snapshots also preserve their scenario and table. Older answers may lack snapshots or case context. Version 2 requires its custom-bank and manual-chapter fields, and versions 3–6 also require the draft field. Version 6 requires book metadata and rejects conflicting metadata when merging. Full input validation precedes a transaction. Same-ID identical records are skipped; differing records cause a full rollback instead of silent overwrite. Missing books are preserved as pending PDF association. UUID records survive re-import of the same source hash. Markdown includes notes, citations, tasks, completion status, target dates, reading position and chapter status.

Filesystem:

```text
userData/
  library.sqlite (+ WAL/SHM while running)
  books/<sha256>/source.pdf
```

PDF crops are rendered on demand and not persisted as redundant screenshots. Back up study JSON regularly; for a whole-library copy, fully close the app first. Uninstall is configured to retain userData; actual Windows uninstall behavior remains part of the Windows verification checklist.

The settings panel can also export a full-library folder using an online SQLite snapshot and SHA-256-verified copies of each managed PDF. The folder contains `library.sqlite`, `books/`, and `manifest.json`. Missing textbooks or active imports prevent this export. A restore validates the manifest, database integrity and textbook hashes before creating a separate library folder. Users can select a validated library in settings, then restart the app to use it. The selected path is stored in `active-library.json` in the starting profile. If it is unavailable on startup, the app opens the starting profile with a visible warning. Packaged-app restart and cross-machine recovery remain to be validated.
