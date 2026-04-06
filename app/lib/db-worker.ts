import init, { type BindableValue } from "@sqlite.org/sqlite-wasm";

interface WorkerRequest {
  id: string;
  method: "execute" | "query" | "getOne";
  sql: string;
  params?: BindableValue[];
}

interface WorkerResponse {
  id: string;
  result?: unknown;
  error?: string;
}

let database: InstanceType<
  Awaited<ReturnType<typeof init>>["oo1"]["OpfsDb"]
> | null = null;

const DDL = `
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
  source_tokens TEXT NOT NULL,
  target_text TEXT NOT NULL,
  source_locale TEXT NOT NULL,
  target_locale TEXT NOT NULL,
  source_prev_content TEXT,
  source_next_content TEXT,
  change_source TEXT NOT NULL DEFAULT 'HUMAN',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(source_locale, target_locale, source_normalized)
);

CREATE INDEX IF NOT EXISTS idx_tm_locale_pair
  ON translation_memory(source_locale, target_locale);
`;

async function initialize() {
  const sqlite3 = await init();

  if (!sqlite3.oo1.OpfsDb) {
    throw new Error(
      "OPFS VFS is not available. Ensure the page is served with COOP/COEP headers.",
    );
  }

  database = new sqlite3.oo1.OpfsDb("offline-cat.db", "c");
  database.exec(DDL);

  self.postMessage({ id: "__init__", result: true } satisfies WorkerResponse);
}

function handleMessage(request: WorkerRequest): WorkerResponse {
  if (!database) {
    return { id: request.id, error: "Database not initialized" };
  }

  try {
    switch (request.method) {
      case "execute": {
        database.exec({ sql: request.sql, bind: request.params });
        return { id: request.id, result: null };
      }

      case "query": {
        const rows = database.exec({
          sql: request.sql,
          bind: request.params,
          returnValue: "resultRows",
          rowMode: "object",
        });
        return { id: request.id, result: rows };
      }

      case "getOne": {
        const rows = database.exec({
          sql: request.sql,
          bind: request.params,
          returnValue: "resultRows",
          rowMode: "object",
        });
        return { id: request.id, result: rows[0] ?? null };
      }

      default:
        return { id: request.id, error: `Unknown method: ${request.method}` };
    }
  } catch (error) {
    return {
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const response = handleMessage(event.data);
  self.postMessage(response);
};

initialize().catch((error) => {
  self.postMessage({
    id: "__init__",
    error: error instanceof Error ? error.message : String(error),
  } satisfies WorkerResponse);
});
