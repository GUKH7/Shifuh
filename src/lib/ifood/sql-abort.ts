// PostgREST cancellation aborts the HTTP request, NOT a committed transaction.
// Callers must treat aborted writes and lost responses as ambiguous.
export function withIfoodSqlSignal<T extends { abortSignal(signal: AbortSignal): T }>(
  query: T, signal?: AbortSignal,
): T {
  signal?.throwIfAborted();
  return signal ? query.abortSignal(signal) : query;
}
