# RFC: Migrate from IndexedDB + idb to SQLite Wasm + OPFS

**Status:** Implemented
**Author:** Markus Murakaru
**Date:** 2026-04-05
**Updated:** 2026-04-06

---

## Summary

Replace the current IndexedDB persistence layer (`idb` library) with SQLite compiled to WebAssembly (`@sqlite.org/sqlite-wasm`), backed by the Origin Private File System (OPFS). This gives offline.cat a real relational database in the browser - SQL queries, indexes, joins, transactions - without adding any server infrastructure.

---

## Strategic context

offline.cat's core promise is "professional CAT tooling with no server, no account, no lock-in." SQLite + OPFS is the storage layer that makes that promise durable at scale. This isn't just a performance improvement - it's the foundation the Phase 2 and Phase 3 roadmap is built on.

### Phased roadmap

| Phase | Scope | Storage implication |
|-------|-------|---------------------|
| **Phase 1** | Personal TM, browser only, stays local | SQLite Wasm + OPFS replaces IndexedDB |
| **Phase 2** | Mac/Windows app (Tauri) reads the same `.db` file | Zero translation layer - Tauri uses SQLite natively |
| **Phase 3** | Collaborative TM: multiple translators contributing to a shared translation memory. Requires conflict resolution (e.g. cr-sqlite, merge-on-import). | SQLite has ecosystem tools for this; IndexedDB does not |

### Competitive differentiation

No other browser-based CAT tool has real SQL + durable local storage + a portable file format. Most browser-based tools either depend on a server or store data in IndexedDB with no export path. The combination of SQLite, OPFS, and a single-file database format is a moat, not just a technical detail.

---

## Motivation

The current stack uses `idb` (v8.0.3) wrapping IndexedDB with two object stores: `translationMemory` and `files`. This works for v1 but creates friction as the app grows:

**1. Translation memory fuzzy matching is inefficient against IndexedDB.**
`findTranslationMemoryMatch()` pulls every entry for a language pair into JS memory, then loops through candidates running Levenshtein comparisons. IndexedDB has no query language, no computed columns, no aggregation - the entire dataset must be deserialized into JS objects before any filtering happens.

**2. No relational queries.**
As the schema grows (projects, glossaries, user preferences, file metadata), IndexedDB forces you into manual joins - multiple `getAll()` calls stitched together in application code. SQL handles this natively.

**3. Phase 2 portability.**
The PRD roadmap calls for a Mac/Windows desktop app via Tauri in Q3. SQLite is Tauri's native storage backend. A shared `.db` file format means the web app and desktop app read and write the same database with zero translation layer. IndexedDB has no equivalent - you'd need an export/import bridge.

**4. Phase 3 sync.**
Optional self-hosted sync between devices (Q4 roadmap) is dramatically simpler when both endpoints speak SQLite. Protocols like cr-sqlite (CRDTs on SQLite) or simple dump-and-merge strategies work out of the box. IndexedDB sync requires custom serialization for every object store.

**5. Tooling and debugging.**
SQLite databases can be inspected with any SQLite viewer. IndexedDB requires Chrome DevTools. Developers can run ad-hoc SQL queries during debugging instead of writing throwaway JS.

**6. Data durability.**
IndexedDB is subject to browser eviction under low disk pressure. The browser can silently delete stored data when the device runs low on space. OPFS is not evictable - it's treated as a real file by the OS. For a translator whose TM represents months of accumulated work, this is a meaningful safety guarantee.

**7. Export/import as a user-facing feature.**
The `.db` file isn't just a portability detail for developers - it's a user feature. Export your entire TM as a single file, share it with other translators, import on a new machine in one step. This is invisible with IndexedDB.

---

## Background

The SQLite team officially supports a WebAssembly build: [`@sqlite.org/sqlite-wasm`](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm). When backed by the Origin Private File System (OPFS), it provides durable, persistent storage that survives page reloads and browser restarts.

References:
- Thomas Steiner, ["SQLite Wasm in the browser backed by the Origin Private File System"](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system)
- ["From Web SQL to SQLite Wasm"](https://developer.chrome.com/blog/from-web-sql-to-sqlite-wasm)

---

## Browser support

OPFS is available in Chrome 102+, Edge 102+, Firefox 111+, and Safari 15.2+. The `createSyncAccessHandle()` method required by SQLite Wasm's OPFS VFS is available in Chrome 108+, Firefox 111+, and Safari 17.0+.

offline.cat already targets Chrome 138+ (for the Translator API). OPFS support is not a constraint.

---

## What was built

### Dependencies

```diff
- idb
+ @sqlite.org/sqlite-wasm
```

### Worker model: custom Web Worker over sqlite3Worker1Promiser

The RFC originally proposed using `sqlite3Worker1Promiser` - the built-in promise-based worker API from the sqlite-wasm package. The implementation uses a custom Web Worker instead, for these reasons:

1. **Initialization control.** `sqlite3Worker1Promiser` uses an `onready` callback pattern that doesn't map cleanly to a single `getDB()` promise. The custom worker posts an `__init__` message when ready, which resolves a one-shot promise.

2. **Typed message contract.** The custom worker exposes exactly three operations (`execute`, `query`, `getOne`) with typed request/response interfaces. The promiser's API is generic - you pass operation strings like `"open"`, `"exec"` with varying argument shapes.

3. **Direct oo1 API access.** Inside the worker, we use `sqlite3.oo1.OpfsDb` directly with `database.exec()`, `returnValue: "resultRows"`, `rowMode: "object"`. The promiser adds a serialization layer on top that provides no value when you already own the worker.

4. **BLOB handling.** With a custom worker, we control exactly what gets posted back over the message boundary.

The `sqlite3Worker1Promiser` is a convenience wrapper for projects that don't want to manage their own worker. Since we need the worker anyway (Vite `?worker` import, typed messages, initialization lifecycle), the wrapper would add indirection without adding value.

### API surface

`getDB()` returns a `SqliteClient` with three methods:

```ts
interface SqliteClient {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  getOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
}
```

The main thread spawns the worker, maintains a pending request map (keyed by UUID), and resolves/rejects promises as responses arrive.

### Schema (as implemented)

The RFC originally proposed mirroring the IndexedDB schema with a `lang_pair` column. The implementation uses separate locale columns, upsert semantics, and provenance tracking:

```sql
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS translation_memory (
  id TEXT PRIMARY KEY,
  source_text TEXT NOT NULL,
  source_normalized TEXT NOT NULL,
  source_tokens TEXT NOT NULL,          -- JSON array
  target_text TEXT NOT NULL,
  source_locale TEXT NOT NULL,
  target_locale TEXT NOT NULL,
  source_prev_content TEXT,             -- nullable, for future ICE matching
  source_next_content TEXT,             -- nullable, for future ICE matching
  change_source TEXT NOT NULL DEFAULT 'HUMAN',  -- HUMAN | MT | IMPORT
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(source_locale, target_locale, source_normalized)
);

CREATE INDEX IF NOT EXISTS idx_tm_locale_pair
  ON translation_memory(source_locale, target_locale);
```

Key differences from the RFC proposal:

| RFC proposed | Implemented | Reason |
|-------------|-------------|--------|
| `lang_pair TEXT` (e.g. `"en-es"`) | `source_locale TEXT` + `target_locale TEXT` | Proper indexing, no string parsing, cleaner queries |
| `INSERT OR REPLACE` (new UUID each time) | `INSERT ... ON CONFLICT DO UPDATE` on `(source_locale, target_locale, source_normalized)` | Upsert preserves `created_at`, updates `updated_at` - 1 row per unique source, not duplicates |
| No provenance | `change_source` column | Tracks whether entry came from human, MT, or import |
| No context fields | `source_prev_content`, `source_next_content` | Enables future ICE (In-Context Exact) matching without schema migration |
| `source`, `target` | `source_text`, `target_text` | Avoids collision with SQL reserved words |

### TM scoring convention

Score is a pure 0-100 similarity percentage. Match type (`ice` / `exact` / `fuzzy`) is derived at query time from score + context match - not stored as a field or overloaded into the score. See `TM_SCORING.md`.

### COOP/COEP headers

SQLite Wasm with OPFS requires `SharedArrayBuffer`, which needs:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Learning:** The RFC assumed Vite's `server.headers` config would work. It doesn't - React Router's dev plugin overrides it. The solution is a custom Vite plugin using `configureServer` middleware, which runs before other plugins:

```ts
const coopCoepHeaders = (): Plugin => ({
  name: "coop-coep",
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
  },
});
```

Production uses `public/_headers` for Cloudflare Pages.

### Files changed

| File | Change |
|------|--------|
| `app/lib/db-worker.ts` | New: Web Worker running SQLite Wasm with `oo1.OpfsDb` |
| `app/lib/db.ts` | Rewritten: `SqliteClient` facade with worker message passing |
| `app/lib/translation-memory.ts` | Updated: SQL queries, separate locale params, upsert |
| `app/routes/_index.tsx` | Updated: `db.execute("INSERT INTO files ...")` |
| `app/routes/translate.$fileId.tsx` | Updated: `db.getOne("SELECT * FROM files WHERE id = ?")` |
| `vite.config.ts` | Updated: COOP/COEP plugin, `worker: { format: 'es' }`, `optimizeDeps.exclude` |
| `public/_headers` | New: COOP/COEP for Cloudflare Pages |
| `package.json` | `@sqlite.org/sqlite-wasm` added, `idb` removed |

### Migration from IndexedDB

The RFC included a detailed migration strategy. This was not implemented because the migration happened before any production users had stored data. IndexedDB was replaced entirely - no bridge needed.

If migration becomes necessary in the future (e.g. for a schema change within SQLite), `PRAGMA user_version` can gate one-time migration logic in the worker's initialization.

---

## What doesn't change

- **Translation memory matching logic** - `normalize()`, `tokenize()`, `levenshtein()`, `similarity()` are pure functions, untouched
- **File parsing** - fflate, fast-xml-parser, Worker-based translation pipeline
- **UI components** - translation editor, segment grid, file upload
- **Service worker** - cache-first strategy for offline support (`.wasm` is cached)
- **AbortController flow** - cancellation logic is independent of storage

---

## Testing

### Unit tests (75 total, all passing)

- 18 existing pure function tests (`normalize`, `tokenize`, `levenshtein`, `similarity`) - unchanged
- 9 new tests for async TM functions with mocked `SqliteClient`:
  - `findTranslationMemoryMatch`: queries by separate locales, returns correct scores, filters by token overlap
  - `addTranslationMemoryEntry`: correct SQL with `ON CONFLICT`, `change_source` parameter, timestamp behavior
- 48 tests for parsers and other modules - unchanged

### Manual verification

- Upload file -> store in SQLite -> reload -> file persists from OPFS
- Confirm translation -> TM entry stored with separate locale columns
- Re-upload same file -> TM matches appear
- Confirm same source twice -> upserts (1 row, not 2)
- `npm run build` succeeds, `.wasm` bundled at ~860KB (gzip ~402KB)

---

## Open questions (resolved)

- **Bundle size:** The `.wasm` binary is ~860KB (gzip ~402KB). Cached by the service worker after first load. Acceptable for the target audience (professional translators who will use the tool repeatedly).
- **Database file name versioning:** Not needed. `offline-cat.db` without a version suffix. Future schema changes can use `PRAGMA user_version` and `ALTER TABLE` within the worker initialization.

---

## Future considerations

### SAH Pool VFS for write performance

The current implementation uses the default OPFS VFS (`oo1.OpfsDb`). SQLite Wasm also offers `installOpfsSAHPoolVfs()`, which maintains a pool of pre-opened `FileSystemSyncAccessHandle` instances. This avoids the overhead of opening/closing file handles on every operation.

**Why not now:**

- The default OPFS VFS is simpler and more debuggable - the database file is visible in DevTools > Application > Storage > OPFS as `offline-cat.db`
- SAH Pool uses an opaque directory structure for its file pool, making the database invisible in DevTools
- SAH Pool has a fixed capacity (default 6 slots) that requires explicit management via `addCapacity()` and `reserveMinimumCapacity()`
- Exporting the database requires an extra `exportFile()` call rather than reading the file directly
- No evidence of a write performance bottleneck yet

**When to adopt:** If TM write performance becomes a bottleneck (e.g. bulk imports of thousands of entries, or high-frequency confirmations), SAH Pool is a low-effort upgrade - the change is isolated to `db-worker.ts` initialization (~10 lines). The `SqliteClient` interface and all consuming code remain unchanged.

### SQL-powered token pre-filtering

The token overlap pre-filter currently runs in JS after fetching all entries for a locale pair. This could move into SQL using `json_each()`:

```sql
SELECT *, (
  SELECT COUNT(*) FROM json_each(source_tokens) AS token
  WHERE token.value IN (SELECT value FROM json_each(?))
) AS overlap_count
FROM translation_memory
WHERE source_locale = ? AND target_locale = ?
HAVING overlap_count > ? * 0.3
```

Worth benchmarking when TM size exceeds a few thousand entries per locale pair.

### FTS5 for fuzzy matching

SQLite's FTS5 extension could supplement or replace Levenshtein-based fuzzy matching. An FTS5 virtual table on `source_normalized` would support fast full-text search with BM25 ranking. Potential Phase 2 optimization.

### ICE matching

The schema includes nullable `source_prev_content` and `source_next_content` columns. When both match alongside an exact source text match (score = 100), the derived match type is `ice` instead of `exact`. This enables higher-confidence auto-fill for segments that appear in the same surrounding context. See `TM_SCORING.md` for the scoring convention.

---

## Data scalability

The scalability challenge for offline.cat isn't server scalability - there is no server. It's data scalability: a professional translator with 10 million TM segments should get fast fuzzy matches, offline, in the browser. IndexedDB has no query planner, no indexes beyond simple key ranges, and no way to push filtering into the storage engine. Every query is a full scan deserialized into JS.

SQLite handles this natively. B-tree indexes, the query planner, FTS5, and `json_each()` all run inside the Wasm engine at near-native speed. The database scales with the translator's career, not against it.

---

## References

- [SQLite Wasm in the browser backed by the Origin Private File System](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system) - Thomas Steiner
- [From Web SQL to SQLite Wasm](https://developer.chrome.com/blog/from-web-sql-to-sqlite-wasm) - Thomas Steiner
- [`@sqlite.org/sqlite-wasm` on npm](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm)
- [SQLite Wasm API reference](https://sqlite.org/wasm/doc/trunk/api-index.md)
- [Origin Private File System (MDN)](https://developer.mozilla.org/docs/Web/API/File_System_Access_API#origin_private_file_system)
