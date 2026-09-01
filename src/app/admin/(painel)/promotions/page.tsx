import Link from "next/link";
import { Gift, Percent, Ticket } from "lucide-react";
import {
  AdminPageHeader,
  AdminPageShell,
} from "@/components/ui/admin-primitives";

const PROMOTION_MODULES = [
  {
    title: "Cupons",
    description: "Crie códigos promocionais e acompanhe o impacto dos descontos nas vendas da loja.",
    href: "/admin/promotions/coupons",
    status: "Disponível",
    icon: Ticket,
  },
  {
    title: "Roleta da Sorte",
    description: "Prepare campanhas gamificadas com regras de liberação, prêmios e chances configuráveis.",
    href: "/admin/promotions/wheel",
    status: "Em preparação",
    icon: Gift,
  },
];

export default function PromotionsPage() {
  return (
    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Promoções"
        description="Centralize as campanhas da sua loja e escolha a mecânica ideal para cada objetivo."
        icon={<Percent size={24} />}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {PROMOTION_MODULES.map((module) => {
          const Icon = module.icon;

          return (
            <Link
              key={module.href}
              href={module.href}
              className="surface-card group rounded-[28px] p-5 transition-transform hover:-translate-y-0.5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
                  <Icon size={20} />
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    module.status === "Disponível"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {module.status}
                </span>
              </div>

              <h2 className="mt-5 text-xl font-black text-gray-950">{module.title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">{module.description}</p>
              <p className="mt-5 text-sm font-black text-[var(--brand)] transition-transform group-hover:translate-x-0.5">
                Abrir módulo →
              </p>
            </Link>
          );
        })}
      </section>

      <section className="rounded-[28px] border border-dashed border-orange-200 bg-[#fffaf6] p-5 sm:p-6">
        <p className="text-sm font-black text-gray-950">Uma área pronta para crescer</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
          A estrutura de Promoções passa a concentrar as diferentes mecânicas comerciais da loja. Novas campanhas poderão ser adicionadas aqui sem sobrecarregar o menu principal.
        </p>
      </section>
    </AdminPageShell>
  );
}
