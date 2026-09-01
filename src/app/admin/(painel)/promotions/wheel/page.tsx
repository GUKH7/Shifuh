import { Gift } from "lucide-react";
import {
  AdminPageHeader,
  AdminPageShell,
} from "@/components/ui/admin-primitives";

export default function PromotionsWheelPage() {
  return (
    <AdminPageShell className="space-y-6 pb-12">
      <AdminPageHeader
        title="Roleta da Sorte"
        description="A estrutura deste módulo já está pronta para receber a configuração de campanhas, prêmios e regras de liberação."
        icon={<Gift size={24} />}
      />

      <section className="surface-card rounded-[28px] p-6 sm:p-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff2ea] text-[var(--brand)]">
            <Gift size={24} />
          </span>
          <h2 className="mt-5 text-xl font-black text-gray-950">Roleta da Sorte preparada para a próxima frente</h2>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            Na próxima etapa entraremos com período da campanha, critérios para liberar giros, cadastro de prêmios e os modos de distribuição por probabilidade ou frequência.
          </p>
        </div>
      </section>
    </AdminPageShell>
  );
}
