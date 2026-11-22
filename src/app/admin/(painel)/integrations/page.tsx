import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, ExternalLink, ShieldCheck, Store, Workflow } from "lucide-react";

const nextSteps = [
  "Registrar o aplicativo do Shifuh no portal de desenvolvedores da 99Food",
  "Confirmar o acordo de cooperação e obter acesso ao sandbox oficial",
  "Homologar autenticação, eventos, pedidos, aceite e cancelamento com testes reais de sandbox",
  "Ativar a integração por restaurante somente após autorização e testes aprovados",
];

export default function IntegrationsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-3 py-6 sm:px-6 sm:py-8">
      <header className="space-y-2">
        <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--brand)]">
          Gestão multicanal
        </p>
        <h1 className="text-2xl font-black tracking-tight text-gray-950 sm:text-3xl">
          Integrações de delivery
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-gray-600">
          Prepare iFood e 99Food para operar no mesmo painel. Cada integração precisa ser
          autorizada e homologada antes de receber ou alterar pedidos de restaurantes.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-700">
              <Store size={23} />
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
              Diagnóstico disponível
            </span>
          </div>
          <h2 className="mt-5 text-xl font-black text-gray-950">iFood</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            O Shifuh já possui módulos de autenticação, sincronização de pedidos e ações iFood.
            Verifique as credenciais e a conexão da sua loja pelo diagnóstico oficial.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-gray-600">
            <CheckCircle2 size={15} className="text-emerald-600" />
            Base de integração implementada — conexão da loja não verificada nesta tela
          </div>
          <Link
            href="/admin/integrations/ifood"
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-extrabold text-white sm:w-auto"
          >
            Verificar conexão iFood <ArrowRight size={17} />
          </Link>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">
              <Workflow size={23} />
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              Aguardando homologação
            </span>
          </div>
          <h2 className="mt-5 text-xl font-black text-gray-950">99Food</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            A 99Food oferece portal de desenvolvedores, sandbox e integração por Open Delivery.
            O Shifuh ainda não possui autorização nem conector ativo para pedidos reais.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-amber-800">
            <Clock3 size={15} /> Recebimento e confirmação de pedidos desativados até a homologação
          </div>
          <a
            href="https://developer-food.99app.com/pt-BR/home"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-extrabold text-gray-800 hover:border-orange-300 sm:w-auto"
          >
            Portal de desenvolvedores 99Food <ExternalLink size={16} />
          </a>
        </section>
      </div>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck size={21} className="mt-0.5 shrink-0 text-[var(--brand)]" />
          <div>
            <h2 className="text-lg font-black text-gray-950">Preparação para conectar a 99Food</h2>
            <p className="mt-1 text-sm text-gray-600">
              Antes de ativar a sincronização, precisamos confirmar o contrato técnico e a autorização do aplicativo.
            </p>
          </div>
        </div>
        <ol className="mt-5 space-y-3">
          {nextSteps.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-sm text-gray-700">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 font-extrabold text-[var(--brand)]">
                {index + 1}
              </span>
              <span className="pt-1">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs leading-relaxed text-gray-500">
          A integração 99Food não está conectada. Não são enviados tokens, pedidos ou dados da loja
          à 99Food por esta página. As credenciais futuras devem permanecer no servidor.
        </p>
      </section>
    </main>
  );
}
