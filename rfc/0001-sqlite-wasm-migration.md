# RFC: Migrate from IndexedDB + idb to SQLite Wasm + OPFS

**Status:** Draft
**Author:** Markus Murakaru
**Date:** 2026-04-05

---

## Summary

Replace the current IndexedDB persistence layer (`idb` library) with SQLite compiled to WebAssembly (`@sqlite.org/sqlite-wasm`), backed by the Origin Private File System (OPFS). This gives offline.cat a real relational database in the browser - SQL queries, indexes, joins, transactions - without adding any server infrastructure.

---

## Motivation

The current stack uses `idb` (v8.0.3) wrapping IndexedDB with two object stores: `translationMemory` and `files`. This works for v1 but creates friction as the app grows:

**1. Translation memory fuzzy matching is inefficient against IndexedDB.**
Today `findTranslationMemoryMatch()` pulls every entry for a language pair into JS memory, then loops through candidates running Levenshtein comparisons. IndexedDB has no query language, no computed columns, no aggregation - the entire dataset must be deserialized into JS objects before any filtering happens.

Here's what the current translation memory lookup looks like (`app/lib/translation-memory.ts`):

```ts
// idb wraps IndexedDB - but the "query" is just getAll + JS loop
export async function findTranslationMemoryMatch(
  source: string,
  langPair: string,
): Promise<TranslationMemoryMatch> {
  const db = await getDB();
  const normalized = normalize(source);
  const tokens = tokenize(normalized);

  // This pulls EVERY translation memory entry for this language pair into memory
  const allEntries = await db.getAllFromIndex("translationMemory", "langPair", langPair);

  let bestMatch: TranslationMemoryMatch = { score: 0, translation: "" };

  // Then we filter in JS - IndexedDB can't do this
  const candidates = allEntries.filter((entry) => {
    const overlap = tokens.filter((token) =>
      entry.sourceTokens.includes(token),
    ).length;
    return tokens.length === 0 || overlap / tokens.length > 0.3;
  });

  // And loop through survivors running expensive string comparison
  for (const entry of candidates) {
    const score = similarity(normalized, entry.sourceNormalized);
    if (score > bestMatch.score) {
      bestMatch = { score, translation: entry.target };
    }
  }

  return bestMatch;
}
```

And writing a translation memory entry:

```ts
export async function addTranslationMemoryEntry(
  source: string,
  target: string,
  langPair: string,
): Promise<void> {
  const db = await getDB();
  const sourceNormalized = normalize(source);
  const sourceTokens = tokenize(sourceNormalized);

  // idb's put() - no schema validation, no constraints, no ON CONFLICT
  await db.put("translationMemory", {
    id: crypto.randomUUID(),
    source,
    sourceNormalized,
    sourceTokens,
    target,
    langPair,
    createdAt: Date.now(),
  });
}
```

The database itself is initialized with raw object store creation - no schema definition language, just imperative JS:

```ts
// app/lib/db.ts
const db = await openDB<OfflineCatDB>("offline-cat", 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("translationMemory")) {
      const store = db.createObjectStore("translationMemory", { keyPath: "id" });
      store.createIndex("langPair", "langPair");
    }
    if (!db.objectStoreNames.contains("files")) {
      db.createObjectStore("files", { keyPath: "id" });
    }
  },
});
```

With SQLite, the same translation memory lookup becomes a parameterized query. The token pre-filter and Levenshtein comparison still happen in JS (no way around that), but the initial fetch is a proper indexed query rather than "dump everything into memory and hope for the best."

**2. No relational queries.**
As the schema grows (projects, glossaries, user preferences, file metadata), IndexedDB forces you into manual joins - multiple `getAll()` calls stitched together in application code. SQL handles this natively.

**3. Phase 2 portability.**
The PRD roadmap calls for a Mac/Windows desktop app via Tauri in Q3. SQLite is Tauri's native storage backend. A shared `.db` file format means the web app and desktop app read and write the same database with zero translation layer. IndexedDB has no equivalent - you'd need an export/import bridge.

**4. Phase 3 sync.**
Optional self-hosted sync between devices (Q4 roadmap) is dramatically simpler when both endpoints speak SQLite. Protocols like cr-sqlite (CRDTs on SQLite) or simple dump-and-merge strategies work out of the box. IndexedDB sync requires custom serialization for every object store.

**5. Tooling and debugging.**
SQLite databases can be inspected with any SQLite viewer. IndexedDB requires Chrome DevTools. Developers can `SELECT * FROM translation_memory WHERE lang_pair = 'en-es' ORDER BY created_at DESC LIMIT 10` during debugging instead of writing throwaway JS.

---

## Background

The SQLite team officially supports a WebAssembly build: [`@sqlite.org/sqlite-wasm`](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm). When backed by the Origin Private File System (OPFS), it provides durable, persistent storage that survives page reloads and browser restarts - the same guarantees IndexedDB provides today.

Reference: Thomas Steiner, ["Deprecating and removing Web SQL"](https://developer.chrome.com/blog/deprecating-web-sql) and ["SQLite Wasm in the browser backed by the Origin Private File System"](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system). The SQLite team's benchmarks show SQLite Wasm performs on par with the deprecated Web SQL - sometimes faster, sometimes slower, but in the same ballpark. See the [results page](https://googlechrome.github.io/samples/sqlite-wasm-opfs/).

The migration guide ["From Web SQL to SQLite Wasm"](https://developer.chrome.com/blog/from-web-sql-to-sqlite-wasm) outlines the pattern: export existing data as SQL statements, replay them into SQLite Wasm, then drop the old store. We adapt this pattern from "Web SQL to SQLite" to "IndexedDB to SQLite."

---

## Browser support

OPFS is available in Chrome 102+, Edge 102+, Firefox 111+, and Safari 15.2+. The `createSyncAccessHandle()` method required by SQLite Wasm's OPFS VFS is available in Chrome 108+, Firefox 111+, and Safari 17.0+.

offline.cat already targets Chrome 138+ (for the Translator API). OPFS support is not a constraint.

---

## What changes

### Dependencies

```diff
- idb
+ @sqlite.org/sqlite-wasm
```

OPFS is a browser built-in - no additional package.

### Required HTTP headers

SQLite Wasm with OPFS requires `SharedArrayBuffer`, which needs these headers on the document:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Cloudflare Pages supports custom headers via a `_headers` file in the output directory.

### Schema

Current IndexedDB schema (from `app/lib/db.ts`):

```
Object store: translationMemory
  keyPath: id (string)
  index: langPair (string)
  Fields: id, source, sourceNormalized, sourceTokens[], target, langPair, createdAt

Object store: files
  keyPath: id (string)
  Fields: id, name, type, data (Uint8Array), createdAt
```

Equivalent SQLite schema:

```sql
CREATE TABLE IF NOT EXISTS translation_memory (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_normalized TEXT NOT NULL,
  source_tokens TEXT NOT NULL,  -- JSON array, e.g. '["quick","brown","fox"]'
  target TEXT NOT NULL,
  lang_pair TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_translation_memory_lang_pair ON translation_memory(lang_pair);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
```

`source_tokens` becomes a JSON text column. SQLite's `json_each()` function can query into it if needed, but the primary use case (token overlap pre-filtering) will still happen in JS after fetching candidates - same as today.

### Files affected

| File | Change |
|------|--------|
| `app/lib/db.ts` | Replace `idb` with SQLite Wasm initialization, expose query helpers |
| `app/lib/translation-memory.ts` | Replace `db.getAllFromIndex()` / `db.put()` with SQL queries |
| `app/routes/_index.tsx` | Replace `db.put("files", ...)` with SQL insert |
| `app/routes/translate.$fileId.tsx` | Replace `db.get("files", fileId)` with SQL select |
| `package.json` | Swap `idb` for `@sqlite.org/sqlite-wasm` |
| `public/_headers` | Add COOP/COEP headers |
| `vite.config.ts` | Configure headers for dev server, handle wasm asset serving |

### New `db.ts` (sketch)

```ts
import { sqlite3Worker1Promiser } from "@sqlite.org/sqlite-wasm";

let promiser: any = null;
let dbId: string | null = null;

export async function getDB() {
  if (promiser && dbId) return { promiser, dbId };

  promiser = await new Promise((resolve) => {
    const instance = sqlite3Worker1Promiser({
      onready: () => resolve(instance),
    });
  });

  const response = await promiser("open", {
    filename: "file:offline-cat.db?vfs=opfs",
  });
  dbId = response.dbId;

  // Create tables
  await promiser("exec", {
    dbId,
    sql: `
      CREATE TABLE IF NOT EXISTS translation_memory (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        source_normalized TEXT NOT NULL,
        source_tokens TEXT NOT NULL,
        target TEXT NOT NULL,
        lang_pair TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_translation_memory_lang_pair ON translation_memory(lang_pair);
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        data BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );
    `,
  });

  return { promiser, dbId };
}
```

### New `translation-memory.ts` query pattern (sketch)

```ts
export async function findTranslationMemoryMatch(
  source: string,
  langPair: string,
): Promise<TranslationMemoryMatch> {
  const { promiser, dbId } = await getDB();
  const normalized = normalize(source);
  const tokens = tokenize(normalized);

  const response = await promiser("exec", {
    dbId,
    sql: "SELECT * FROM translation_memory WHERE lang_pair = ?",
    bind: [langPair],
    returnValue: "resultRows",
    rowMode: "object",
  });

  const entries = response.result.resultRows;

  // Token overlap pre-filter + Levenshtein - same logic as today
  let bestMatch: TranslationMemoryMatch = { score: 0, translation: "" };

  const candidates = entries.filter((entry: any) => {
    const entryTokens: string[] = JSON.parse(entry.source_tokens);
    const overlap = tokens.filter((token) =>
      entryTokens.includes(token),
    ).length;
    return tokens.length === 0 || overlap / tokens.length > 0.3;
  });

  for (const entry of candidates) {
    const score = similarity(normalized, entry.source_normalized);
    if (score > bestMatch.score) {
      bestMatch = { score, translation: entry.target };
    }
  }

  return bestMatch;
}

export async function addTranslationMemoryEntry(
  source: string,
  target: string,
  langPair: string,
): Promise<void> {
  const { promiser, dbId } = await getDB();
  const sourceNormalized = normalize(source);
  const sourceTokens = tokenize(sourceNormalized);

  await promiser("exec", {
    dbId,
    sql: `INSERT OR REPLACE INTO translation_memory (id, source, source_normalized, source_tokens, target, lang_pair, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      crypto.randomUUID(),
      source,
      sourceNormalized,
      JSON.stringify(sourceTokens),
      target,
      langPair,
      Date.now(),
    ],
  });
}
```

---

## Migration strategy

Existing users may have translation memory data and files stored in IndexedDB. We need a one-time migration.

### Approach

On app startup, check if the old IndexedDB database `offline-cat` exists. If it does:

1. Open the old IndexedDB via `idb` (keep it as a dev dependency temporarily, or use raw IndexedDB API)
2. Read all entries from `translationMemory` and `files` stores
3. Insert them into the new SQLite database using prepared statements in a transaction
4. Delete the old IndexedDB database via `indexedDB.deleteDatabase("offline-cat")`
5. Set a flag in SQLite (`PRAGMA user_version` or a `migrations` table) so the migration doesn't run again

```ts
async function migrateFromIndexedDB() {
  const { promiser, dbId } = await getDB();

  // Check if migration already happened
  const versionResult = await promiser("exec", {
    dbId,
    sql: "PRAGMA user_version",
    returnValue: "resultRows",
  });
  if (versionResult.result.resultRows[0][0] >= 1) return;

  // Check if old IndexedDB exists
  const databases = await indexedDB.databases();
  const oldDb = databases.find((db) => db.name === "offline-cat");
  if (!oldDb) {
    await promiser("exec", { dbId, sql: "PRAGMA user_version = 1" });
    return;
  }

  // Open old database, read all data, insert into SQLite
  // ... (use raw IndexedDB API to avoid keeping idb as dependency)

  // Mark migration complete
  await promiser("exec", { dbId, sql: "PRAGMA user_version = 1" });

  // Delete old IndexedDB
  indexedDB.deleteDatabase("offline-cat");
}
```

### Risk

The migration reads the entire IndexedDB into memory, then writes it into SQLite. For a user with a very large translation memory (tens of thousands of entries), this could be slow. Mitigation: batch inserts inside a single SQLite transaction (SQLite is fast for bulk inserts within a transaction - thousands of rows per second).

---

## Architecture considerations

### Worker requirement

SQLite Wasm's OPFS VFS uses `FileSystemSyncAccessHandle`, which is only available in Web Workers. The `sqlite3Worker1Promiser` API handles this by spawning a worker internally - the main thread communicates via message passing. This is transparent to our code.

This is actually an improvement: the PRD notes "IndexedDB lives on the main thread... you can access it from a Worker but it adds complexity for no gain." With SQLite Wasm, the database operations run in a worker by default, keeping the main thread free.

### Binary data (files store)

The `files` table stores `Uint8Array` blobs (uploaded PPTX/DOCX files). SQLite handles BLOBs natively. No encoding/decoding needed - pass the `Uint8Array` directly as a bind parameter.

### Future: SQL-powered translation memory queries

Once on SQLite, the token overlap pre-filter could move into SQL using `json_each()`:

```sql
SELECT *, (
  SELECT COUNT(*) FROM json_each(source_tokens) AS token
  WHERE token.value IN (SELECT value FROM json_each(?))
) AS overlap_count
FROM translation_memory
WHERE lang_pair = ?
HAVING overlap_count > ? * 0.3
```

This is optional and not part of the initial migration. The current JS-side filtering works and should be preserved to minimize risk.

### Future: FTS5 for translation memory

SQLite's FTS5 extension could eventually replace the Levenshtein-based fuzzy matching entirely. An FTS5 virtual table on `source_normalized` would support fast full-text search with ranking. This is a potential Phase 2 optimization, not a migration concern.

---

## What doesn't change

- **Translation memory matching logic** - `normalize()`, `tokenize()`, `levenshtein()`, `similarity()` stay as-is (move to `translation-memory.ts`)
- **File parsing** - fflate, fast-xml-parser, Worker-based translation pipeline
- **UI components** - translation editor, segment grid, file upload
- **Service worker** - cache-first strategy for offline support
- **AbortController flow** - cancellation logic is independent of storage

---

## Testing plan

1. **Unit tests** - verify `addTranslationMemoryEntry` and `findTranslationMemoryMatch` produce identical results with SQLite backend (same inputs, same outputs)
2. **Migration test** - seed an IndexedDB with known data, run migration, verify all rows exist in SQLite with correct values
3. **Blob round-trip** - upload a PPTX, store in SQLite, retrieve, confirm byte-for-byte equality
4. **E2E** - existing Playwright tests (upload, translate, download, translation memory reuse) should pass without modification if the API surface stays the same

---

## Rollout

1. Implement new `db.ts` and `translation-memory.ts` against SQLite Wasm
2. Add migration logic
3. Update route files to use new API
4. Remove `idb` dependency
5. Add COOP/COEP headers to dev server and Cloudflare Pages `_headers`
6. Run full test suite
7. Keep `idb` migration code for ~2 releases, then remove

---

## Open questions

- **Bundle size impact?** `@sqlite.org/sqlite-wasm` ships a ~1MB wasm binary. This is cached by the service worker after first load, so repeat visits pay nothing. But first-load cost is meaningful for a tool that promises "zero installation." Measure and decide if lazy-loading the wasm is worth the complexity.
- **Safari OPFS support depth?** Safari 17+ supports `createSyncAccessHandle()`, but offline.cat currently targets Chrome 138+ only. If Safari support matters for Phase 1, verify SQLite Wasm's OPFS VFS works correctly on Safari.
- **Should the SQLite file name include a version?** e.g. `offline-cat-v1.db`. This makes future breaking schema changes simpler (open new file, migrate, delete old) but adds naming complexity.

---

## References

- [SQLite Wasm in the browser backed by the Origin Private File System](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system) - Thomas Steiner
- [From Web SQL to SQLite Wasm](https://developer.chrome.com/blog/from-web-sql-to-sqlite-wasm) - Thomas Steiner
- [Deprecating and removing Web SQL](https://developer.chrome.com/blog/deprecating-web-sql) - Thomas Steiner
- [`@sqlite.org/sqlite-wasm` on npm](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm)
- [SQLite Wasm API reference](https://sqlite.org/wasm/doc/trunk/api-index.md)
- [SQLite Wasm vs Web SQL benchmarks](https://googlechrome.github.io/samples/sqlite-wasm-opfs/speedtest.html)
- [Origin Private File System (MDN)](https://developer.mozilla.org/docs/Web/API/File_System_Access_API#origin_private_file_system)
