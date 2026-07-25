"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";

type DiagnosticResponse = {
  status: "connected" | "error";
  checkedAt: string;
  diagnostics?: {
    environment: string;
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    encryptionKeyConfigured: boolean;
    tokenSource: string;
    expiresAt: string | null;
    latencyMs: number;
    tokenReceived: boolean;
  };
  configuration?: {
    environment: string;
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    encryptionKeyConfigured: boolean;
  };
  error?: { code: string; message: string; status: number | null };
};

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
        {ok ? "Configurado" : "Pendente"}
      </span>
    </div>
  );
}

export default function IfoodConnectionDiagnosticsPage() {
  const [data, setData] = useState<DiagnosticResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const checkConnection = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/integrations/ifood/diagnostics", { cache: "no-store" });
      const payload = (await response.json()) as DiagnosticResponse;
      setData(payload);
    } catch {
      setData({
        status: "error",
        checkedAt: new Date().toISOString(),
        error: { code: "network_error", message: "Não foi possível consultar o diagnóstico agora.", status: null },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  const config = data?.diagnostics || data?.configuration;
  const connected = data?.status === "connected";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">Integração oficial</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Conexão com o iFood</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Verifique as credenciais, a persistência segura do token e a comunicação OAuth sem expor dados sensíveis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void checkConnection()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Testar conexão
        </button>
      </div>

      <section className={`mb-6 rounded-2xl border p-5 ${connected ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
        <div className="flex gap-3">
          {connected ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-red-700" />}
          <div>
            <h2 className={`font-semibold ${connected ? "text-emerald-950" : "text-red-950"}`}>
              {loading ? "Verificando conexão..." : connected ? "Conexão oficial ativa" : "A conexão precisa de atenção"}
            </h2>
            <p className={`mt-1 text-sm ${connected ? "text-emerald-800" : "text-red-800"}`}>
              {connected
                ? `Token válido obtido via ${data?.diagnostics?.tokenSource || "OAuth"}.`
                : data?.error?.message || "As credenciais ainda não foram validadas."}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-orange-600" />
            <h2 className="font-semibold text-slate-950">Configuração do ambiente</h2>
          </div>
          <StatusRow label="IFOOD_CLIENT_ID" ok={Boolean(config?.clientIdConfigured)} detail="Identifica o aplicativo no Portal do Desenvolvedor." />
          <StatusRow label="IFOOD_CLIENT_SECRET" ok={Boolean(config?.clientSecretConfigured)} detail="Mantido somente no servidor e nunca enviado ao navegador." />
          <StatusRow label="IFOOD_TOKEN_ENCRYPTION_KEY" ok={Boolean(config?.encryptionKeyConfigured)} detail="Protege o token persistido compartilhado entre instâncias da Vercel." />
          <StatusRow label="Token OAuth" ok={Boolean(data?.diagnostics?.tokenReceived)} detail={data?.diagnostics?.expiresAt ? `Válido até ${new Date(data.diagnostics.expiresAt).toLocaleString("pt-BR")}` : "Aguardando validação."} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Resumo técnico</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-slate-500">Ambiente</dt>
              <dd className="mt-1 font-medium text-slate-900">{config?.environment || "Não identificado"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Origem do token</dt>
              <dd className="mt-1 font-medium text-slate-900">{data?.diagnostics?.tokenSource || "Indisponível"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Latência da validação</dt>
              <dd className="mt-1 font-medium text-slate-900">{data?.diagnostics ? `${data.diagnostics.latencyMs} ms` : "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Última verificação</dt>
              <dd className="mt-1 font-medium text-slate-900">{data?.checkedAt ? new Date(data.checkedAt).toLocaleString("pt-BR") : "—"}</dd>
            </div>
            {data?.error?.code ? (
              <div>
                <dt className="text-slate-500">Código do diagnóstico</dt>
                <dd className="mt-1 font-medium text-red-700">{data.error.code}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>
    </main>
  );
}
