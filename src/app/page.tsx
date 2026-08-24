import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Gift,
  MessageCircle,
  ReceiptText,
  ShoppingBag,
  Star,
  Store,
  Users,
  UtensilsCrossed,
  Zap,
} from "lucide-react";

const capabilities = [
  {
    title: "Vitrine própria",
    description: "Uma experiência de compra com a identidade do restaurante, pronta para receber pedidos online.",
    icon: Store,
  },
  {
    title: "Pedidos centralizados",
    description: "Acompanhe o fluxo dos pedidos, status e histórico da operação em um único painel.",
    icon: ShoppingBag,
  },
  {
    title: "Cardápio organizado",
    description: "Gerencie produtos, categorias e disponibilidade sem depender de várias ferramentas.",
    icon: UtensilsCrossed,
  },
  {
    title: "Base de clientes",
    description: "Consulte clientes e histórico de compra para entender melhor quem compra da sua loja.",
    icon: Users,
  },
  {
    title: "Cupons e campanhas",
    description: "Crie incentivos comerciais e acompanhe ações para estimular novas compras.",
    icon: Gift,
  },
  {
    title: "Avaliações",
    description: "Centralize a percepção dos clientes e acompanhe a qualidade da experiência entregue.",
    icon: Star,
  },
];

const operationSteps = [
  {
    number: "01",
    title: "Venda pela sua vitrine",
    description: "O cliente acessa o cardápio, monta o pedido e conclui a compra pela experiência digital da sua loja.",
  },
  {
    number: "02",
    title: "Opere tudo pelo painel",
    description: "Pedidos, cardápio, clientes, cupons, avaliações e configurações ficam organizados no mesmo lugar.",
  },
  {
    number: "03",
    title: "Acompanhe o negócio",
    description: "Use métricas e histórico para enxergar o ritmo da operação e tomar decisões com mais contexto.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f8f3ec] text-gray-950">
      <nav className="sticky top-0 z-50 border-b border-[#eadfd4] bg-[#f8f3ec]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="Shifuh - início">
            <Image
              src="/brand/shifuh-icon.svg"
              alt="Símbolo Shifuh"
              width={38}
              height={38}
              priority
              className="h-9 w-9 shrink-0 object-contain"
            />
            <div className="leading-none">
              <span className="font-brand block text-[1.35rem] font-semibold tracking-tight text-gray-950">SHIFUH</span>
              <span className="mt-1 hidden text-[9px] font-medium text-gray-500 sm:block">Você mestre do seu delivery</span>
            </div>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-semibold text-gray-600 lg:flex">
            <a href="#produto" className="transition-colors hover:text-gray-950">Produto</a>
            <a href="#operacao" className="transition-colors hover:text-gray-950">Como funciona</a>
            <a href="#integracoes" className="transition-colors hover:text-gray-950">Integrações</a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/admin/login"
              className="hidden min-h-11 items-center px-3 text-sm font-semibold text-gray-700 transition-colors hover:text-black min-[420px]:inline-flex"
            >
              Entrar
            </Link>
            <Link
              href="/admin/login"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#171311] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-black"
            >
              Criar minha loja <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[460px] max-w-7xl bg-[radial-gradient(circle_at_72%_22%,rgba(246,93,2,0.14),transparent_42%)]" />

          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-24">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#f2d7c5] bg-white/70 px-4 py-2 text-xs font-bold text-[#a34716] shadow-sm">
                <Zap size={13} />
                Gestão de delivery para restaurantes
              </div>

              <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[0.96] tracking-[-0.055em] text-gray-950 sm:text-6xl lg:text-[5.25rem]">
                O sistema para <span className="text-[var(--brand)]">comandar</span> seu delivery.
              </h1>

              <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl sm:leading-9">
                O Shifuh conecta sua vitrine, cardápio, pedidos, clientes, cupons, avaliações e integrações em um único painel para a operação funcionar com mais clareza.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/admin/login"
                  className="brand-gradient inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold text-white shadow-[0_14px_34px_rgba(246,93,2,0.2)] transition-transform hover:-translate-y-0.5"
                >
                  Começar com o Shifuh <ArrowRight size={17} />
                </Link>
                <a
                  href="#produto"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--line)] bg-white/70 px-6 py-3.5 text-base font-semibold text-gray-900 transition-colors hover:bg-white"
                >
                  Conhecer o produto
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-gray-600">
                <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /> Vitrine integrada</span>
                <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /> Operação em tempo real</span>
                <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /> iFood e WhatsApp</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[620px] lg:mx-0 lg:ml-auto">
              <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-[var(--brand-soft)] blur-3xl" />
              <div className="relative overflow-hidden rounded-3xl border border-[#ded3c7] bg-white shadow-[0_40px_90px_rgba(44,31,20,0.15)]">
                <div className="flex items-center justify-between border-b border-[#eee5dc] px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <Image src="/brand/shifuh-icon.svg" alt="" width={30} height={30} className="h-7 w-7 object-contain" />
                    <div>
                      <p className="text-sm font-bold text-gray-950">Painel operacional</p>
                      <p className="text-[11px] text-gray-500">Restaurante Villa Costa</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Loja aberta
                  </span>
                </div>

                <div className="bg-[#fbf8f4] p-4 sm:p-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl bg-[var(--brand)] p-4 text-white shadow-sm">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">Faturamento</p>
                      <p className="mt-2 text-xl font-black">R$ 3.842</p>
                      <p className="mt-2 text-[10px] font-semibold text-white/75">Hoje</p>
                    </div>
                    <div className="rounded-2xl border border-[#eee3d8] bg-white p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Pedidos</p>
                      <p className="mt-2 text-xl font-black text-gray-950">67</p>
                      <p className="mt-2 text-[10px] font-semibold text-emerald-600">+12% no dia</p>
                    </div>
                    <div className="rounded-2xl border border-[#eee3d8] bg-white p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Ticket médio</p>
                      <p className="mt-2 text-xl font-black text-gray-950">R$ 57,34</p>
                      <p className="mt-2 text-[10px] font-semibold text-gray-400">Operação</p>
                    </div>
                    <div className="rounded-2xl border border-[#eee3d8] bg-white p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Concluídos</p>
                      <p className="mt-2 text-xl font-black text-gray-950">54</p>
                      <p className="mt-2 text-[10px] font-semibold text-emerald-600">Em andamento</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-[#eee3d8] bg-white p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-gray-950">Pedidos recentes</p>
                          <p className="mt-1 text-[11px] text-gray-400">Atualização da operação</p>
                        </div>
                        <ReceiptText size={18} className="text-[var(--brand)]" />
                      </div>
                      <div className="mt-4 space-y-2.5">
                        {[
                          ["#2841", "2x Pizza Calabresa G", "R$ 114,90", "Em preparo"],
                          ["#2839", "1x Smash Burger Combo", "R$ 58,00", "Novo"],
                          ["#2835", "1x Açaí 500 ml", "R$ 22,00", "Concluído"],
                        ].map(([id, item, value, status]) => (
                          <div key={id} className="flex items-center justify-between gap-3 rounded-xl bg-[#fbf8f4] px-3 py-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-950">{id} <span className="font-medium text-gray-400">• {status}</span></p>
                              <p className="mt-0.5 truncate text-[11px] text-gray-500">{item}</p>
                            </div>
                            <span className="shrink-0 text-xs font-black text-gray-950">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#eee3d8] bg-white p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-950">Visão do dia</p>
                        <BarChart3 size={18} className="text-[var(--brand)]" />
                      </div>
                      <div className="mt-6 flex h-28 items-end gap-2">
                        {[42, 58, 36, 74, 64, 88, 72, 96, 76].map((height, index) => (
                          <span
                            key={`${height}-${index}`}
                            className="flex-1 rounded-t-md bg-[var(--brand-soft)]"
                            style={{ height: `${height}%` }}
                          />
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between text-[10px] font-semibold text-gray-400">
                        <span>11h</span><span>15h</span><span>19h</span><span>23h</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="produto" className="border-y border-[var(--line)] bg-white/55 scroll-mt-24">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8 lg:py-24">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Produto</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-gray-950 sm:text-5xl">
                Mais que uma vitrine. Uma operação conectada.
              </h2>
              <p className="mt-5 text-lg leading-8 text-[var(--muted)]">
                O Shifuh evoluiu para reunir os principais pontos da rotina do delivery em uma experiência única para o restaurante.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {capabilities.map((feature) => (
                <div key={feature.title} className="surface-card rounded-3xl p-7 transition-transform hover:-translate-y-0.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                    <feature.icon size={19} />
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-gray-950">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="operacao" className="scroll-mt-24">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div className="lg:sticky lg:top-28">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Operação</p>
                <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-gray-950 sm:text-5xl">
                  Da venda à gestão, sem perder o contexto.
                </h2>
                <p className="mt-5 text-lg leading-8 text-[var(--muted)]">
                  A proposta do Shifuh é reduzir a fragmentação da rotina: menos abas, menos retrabalho e mais visão do que está acontecendo na loja.
                </p>
              </div>

              <div className="space-y-4">
                {operationSteps.map((step) => (
                  <div key={step.number} className="surface-card grid gap-5 rounded-3xl p-7 sm:grid-cols-[72px_1fr] sm:p-8">
                    <div className="font-brand text-3xl font-semibold text-[var(--brand)]">{step.number}</div>
                    <div>
                      <h3 className="text-2xl font-bold tracking-tight text-gray-950">{step.title}</h3>
                      <p className="mt-3 text-base leading-7 text-[var(--muted)]">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="integracoes" className="border-y border-[var(--line)] bg-[#171311] text-white scroll-mt-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:px-8 lg:py-24">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#ff8a47]">Integrações</p>
              <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                O Shifuh trabalha junto com os canais da operação.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#b9aea7]">
                Integrações com iFood e WhatsApp ajudam a aproximar pedidos, catálogo e comunicação do mesmo ecossistema de gestão.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[#ff8a47]">
                  <ReceiptText size={20} />
                </div>
                <p className="mt-5 text-xl font-bold">iFood</p>
                <p className="mt-2 text-sm leading-6 text-[#b9aea7]">Integração de merchant, catálogo, eventos e pedidos dentro da estrutura do Shifuh.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[#ff8a47]">
                  <MessageCircle size={20} />
                </div>
                <p className="mt-5 text-xl font-bold">WhatsApp</p>
                <p className="mt-2 text-sm leading-6 text-[#b9aea7]">Canal conectado à operação para apoiar comunicação e automações do restaurante.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="relative overflow-hidden rounded-3xl bg-[var(--brand)] px-6 py-12 text-white shadow-[0_30px_70px_rgba(246,93,2,0.22)] sm:px-10 lg:px-14 lg:py-14">
            <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full border-[52px] border-white/10" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">Shifuh</p>
                <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                  Menos improviso. Mais controle sobre o delivery.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
                  Crie sua loja e organize a operação em um sistema construído para a rotina de restaurantes.
                </p>
              </div>
              <Link
                href="/admin/login"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-bold text-[#171311] transition-transform hover:-translate-y-0.5"
              >
                Criar minha loja <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--line)] bg-white/45">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Image src="/brand/shifuh-icon.svg" alt="Símbolo Shifuh" width={30} height={30} className="h-7 w-7 object-contain" />
            <span className="font-brand text-lg font-semibold text-gray-950">SHIFUH</span>
          </div>
          <p className="text-sm text-[var(--muted)]">© {new Date().getFullYear()} Shifuh. Gestão para delivery.</p>
        </div>
      </footer>
    </div>
  );
}
