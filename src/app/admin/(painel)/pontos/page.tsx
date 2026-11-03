import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Coins } from "lucide-react";
import ManualLoyaltyCredit from "@/features/loyalty/ManualLoyaltyCredit";

export default function AdminManualPointsPage() {
  return (
    <div className="admin-page-shell mx-auto w-full max-w-4xl space-y-4 pb-8 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-gray-600 transition-colors hover:text-[var(--brand)]">
          <ArrowLeft size={17} aria-hidden="true" /> Voltar ao painel
        </Link>
        <Link href="/admin/promotions/loyalty" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-4 text-xs font-bold text-gray-700 hover:border-orange-300 hover:text-[var(--brand)]">
          Gerenciar fidelidade <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <div className="flex items-start gap-3 rounded-[24px] bg-[#fff4e9] px-4 py-5 sm:px-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--brand)]">
          <Coins size={24} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-gray-950 sm:text-3xl">Adicionar pontos</h1>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            Atendimento presencial: busque o cliente, informe o valor e confirme o crédito.
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Disponível ao proprietário com programa de fidelidade ativo.
          </p>
        </div>
      </div>
      <ManualLoyaltyCredit />
    </div>
  );
}
