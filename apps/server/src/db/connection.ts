import { sql } from "drizzle-orm";

import type { ServerDatabase } from ".";

const DEFAULT_DATABASE_CONNECTION_TIMEOUT_MS = 5_000;

export class DatabaseConnectionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Database connection verification timed out after ${timeoutMs}ms`);
    this.name = "DatabaseConnectionTimeoutError";
  }
}

export async function verifyDatabaseConnection(
  database: ServerDatabase,
  { timeoutMs = DEFAULT_DATABASE_CONNECTION_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new DatabaseConnectionTimeoutError(timeoutMs)),
      timeoutMs,
    );
  });

  try {
    await Promise.race([
      database.execute(sql`select 1`),
      timeoutPromise,
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
