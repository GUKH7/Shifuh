export type IfoodCronResult = {
  ok: boolean;
};

export function summarizeIfoodCronResults(results: IfoodCronResult[]) {
  const integrationsSucceeded = results.filter((result) => result.ok).length;
  const integrationsFailed = results.length - integrationsSucceeded;
  const status =
    integrationsFailed === 0
      ? "success"
      : integrationsSucceeded > 0
        ? "partial_success"
        : "error";
  const httpStatus: 200 | 207 | 500 =
    integrationsFailed === 0 ? 200 : integrationsSucceeded > 0 ? 207 : 500;

  return {
    ok: integrationsFailed === 0,
    status,
    httpStatus,
    integrationsProcessed: results.length,
    integrationsSucceeded,
    integrationsFailed,
  };
}
