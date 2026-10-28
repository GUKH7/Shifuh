// PostgREST cancellation aborts the HTTP request, NOT a committed transaction.
// Callers must treat aborted writes and lost responses as ambiguous.
export function withIfoodSqlSignal<T>(
  query: T, signal?: AbortSignal,
): T {
  signal?.throwIfAborted();
  // PostgREST abortSignal mutates the query builder but returns a less specific
  // base type. Preserve T so .single(), .select() and typed data stay intact.
  if (signal) (query as T & { abortSignal(signal: AbortSignal): unknown }).abortSignal(signal);
  return query;
}
