"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-950">
        <main className="flex min-h-screen items-center justify-center px-6 py-12">
          <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-600">
              Shifuh
            </p>
            <h1 className="mt-3 text-2xl font-semibold">Não foi possível carregar esta tela.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              O erro foi registrado para análise. Tente novamente para continuar.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
            >
              Tentar novamente
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
