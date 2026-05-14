export type WriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: unknown };

export interface LexwareLogger {
  log(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}
