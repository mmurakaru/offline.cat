export interface FileRecord {
  id: string;
  name: string;
  type: string;
  data: Uint8Array;
  created_at: number;
}

export interface TranslationMemoryRecord {
  id: string;
  source_text: string;
  source_normalized: string;
  source_tokens: string;
  target_text: string;
  source_locale: string;
  target_locale: string;
  source_prev_content: string | null;
  source_next_content: string | null;
  change_source: string;
  created_at: number;
  updated_at: number;
}

interface WorkerResponse {
  id: string;
  result?: unknown;
  error?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface SqliteClient {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  getOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null>;
}

let clientPromise: Promise<SqliteClient> | null = null;

function createClient(): Promise<SqliteClient> {
  return new Promise((resolveClient, rejectClient) => {
    if (typeof window === "undefined" || typeof window.Worker === "undefined") {
      rejectClient(
        new Error("Web Workers are not available in this environment."),
      );
      return;
    }

    const worker = new Worker(new URL("./db-worker.ts", import.meta.url), {
      type: "module",
    });

    const pending = new Map<string, PendingRequest>();

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, result, error } = event.data;

      if (id === "__init__") {
        if (error) {
          rejectClient(new Error(error));
        } else {
          resolveClient(client);
        }
        return;
      }

      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);

      if (error) {
        request.reject(new Error(error));
      } else {
        request.resolve(result);
      }
    };

    worker.onerror = (event) => {
      rejectClient(new Error(`Worker error: ${event.message}`));
    };

    function send(
      method: string,
      sql: string,
      params?: unknown[],
    ): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, method, sql, params });
      });
    }

    const client: SqliteClient = {
      async execute(sql: string, params?: unknown[]): Promise<void> {
        await send("execute", sql, params);
      },

      async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
        return (await send("query", sql, params)) as T[];
      },

      async getOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
        return (await send("getOne", sql, params)) as T | null;
      },
    };
  });
}

export function getDB(): Promise<SqliteClient> {
  if (!clientPromise) {
    clientPromise = createClient();
  }
  return clientPromise;
}
