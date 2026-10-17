# IPC contracts

Only the active window main frame can invoke handlers. Main has an explicit public method allowlist; worker validates arguments with Zod. Renderer cannot invoke private import-path, backup serialization or arbitrary filesystem operations through the generic API.

- `choosePDF()` → native local PDF dialog → main-only `importPath` worker method.
- `call('snapshot')` → books + settings.
- `call('detail', bookId)` → book/toc/records/progress/position.
- `call('page', {bookId,page})` → semantic blocks, regions, page labels, conversion issues.
- `call('search', {bookId,query})` → real source text and note hits. FTS syntax is constructed from safely quoted tokens.
- `call('saveRecord', StudyRecord)`, `removeRecord(id)` → validated learning-data writes.
- `position({bookId,page,blockId?})`, `progress({bookId,nodeId,status})`, `setting({key,value})`.
- `pause(bookId)`, `resume(bookId)`, `report(bookId)`.
- `exportData('json'|'markdown')` → native save dialog, temporary write + rename.
- `restoreData()` → native file dialog, size guard, version/schema validation, atomic restore.
- `openDataFolder()` opens only the known userData path.
- `onProgress(listener)` → committed page counts + status; returns an unsubscribe function.

Private worker commands are not renderer-callable: `importPath`, `backup`, `markdown`, `restore`. Structured cloning is used between main and worker. An exited worker rejects pending requests; the renderer displays an error and requests restart.

Development-only test environment variables: CPSS_DATA_DIR redirects userData; CPSS_TESTING=1 plus CPSS_TEST_PDF automates file choice. All are ignored by packaged applications. They never grant renderer filesystem access.
