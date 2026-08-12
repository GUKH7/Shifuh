import Link from "next/link";
import { ArrowRight, BarChart3, ReceiptText, Smartphone, Store } from "lucide-react";

const features = [
  {
    title: "Vitrine pública",
    description: "Link único para compartilhar no Instagram, Google e WhatsApp.",
    icon: Store,
  },
  {
    title: "Pedidos no Zap",
    description: "Cliente monta o pedido e envia formatado direto para a loja.",
    icon: ReceiptText,
  },
  {
    title: "Métricas reais",
    description: "Acompanhe o volume de pedidos e a operação em um painel simples.",
    icon: BarChart3,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen text-gray-950">
      <nav className="sticky top-0 z-50 border-b border-[#eadfd4] bg-[#f8f3ec]/95 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-5 sm:flex sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-md text-white">
              <Store size={16} />
            </div>
            <span className="truncate text-lg font-bold tracking-tight sm:text-xl">SHIFUH</span>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium sm:gap-4">
            <Link href="/admin/login" className="hidden min-h-11 items-center px-2 text-gray-700 transition-colors hover:text-black min-[420px]:inline-flex">
              Entrar
            </Link>
            <Link
              href="/admin/login"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#171311] px-3 py-2.5 text-white transition-colors hover:bg-black sm:px-4"
            >
              Criar conta grátis <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-12 md:grid-cols-[1.05fr_0.95fr] md:items-center md:pt-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] px-4 py-2 text-xs font-semibold text-[#9f4d2b]">
              <Smartphone size={12} />
              Multi-tenant • WhatsApp • sem mensalidade
            </div>
            <h1 className="mt-8 max-w-2xl text-5xl font-black leading-[0.95] tracking-[-0.05em] md:text-7xl">
              Sua vitrine digital com pedidos direto no{" "}
              <span className="italic text-[var(--brand)]">WhatsApp.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">
              Crie seu cardápio em minutos, gerencie pedidos em tempo real e receba tudo
              formatado no seu Zap. Sem comissão, sem complicação.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/admin/login"
                className="brand-gradient inline-flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold text-white shadow-[0_12px_30px_rgba(255,90,31,0.18)]"
              >
                Começar agora <ArrowRight size={17} />
              </Link>
              <Link
                href="/admin/login"
                className="inline-flex items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-6 py-4 text-base font-semibold text-gray-900"
              >
                Já tenho conta
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -left-16 top-6 hidden h-36 w-36 rounded-full bg-[radial-gradient(circle,_rgba(255,90,31,0.16)_0%,_rgba(255,90,31,0)_72%)] md:block" />
            <div className="rounded-[28px] border border-[#221d19] bg-[#13100e] p-6 shadow-[0_40px_80px_rgba(15,12,10,0.16)]">
              <div className="mb-8 flex gap-2">
                <span className="h-3 w-3 rounded-full bg-[#ce4338]" />
                <span className="h-3 w-3 rounded-full bg-[#d0a62b]" />
                <span className="h-3 w-3 rounded-full bg-[#3aa66d]" />
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border-l-4 border-[var(--brand)] bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-extrabold text-gray-950">#2841</p>
                      <p className="mt-1 text-sm text-gray-500">2x Pizza Calabresa G</p>
                    </div>
                    <span className="text-2xl font-black text-gray-950">R$ 114,90</span>
                  </div>
                </div>
                <div className="rounded-2xl border-l-4 border-[#2f9cff] bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-extrabold text-gray-950">#2839</p>
                      <p className="mt-1 text-sm text-gray-500">1x Smash Burger Combo</p>
                    </div>
                    <span className="text-2xl font-black text-gray-950">R$ 58,00</span>
                  </div>
                </div>
                <div className="rounded-2xl border-l-4 border-[#28b16d] bg-[#6b6865] px-4 py-4 text-black/45">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-extrabold">#2835</p>
                      <p className="mt-1 text-sm">1x Açaí 500 ml</p>
                    </div>
                    <span className="text-2xl font-black">R$ 22,00</span>
                  </div>
                </div>
              </div>
              <p className="mt-8 text-center text-xs font-medium uppercase tracking-[0.3em] text-[#a28f80]">
                Cozinha em pico • 19:42
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--line)] bg-[rgba(255,255,255,0.35)]">
          <div className="mx-auto grid max-w-6xl gap-5 px-6 py-14 md:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="surface-card rounded-[24px] p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                  <feature.icon size={20} />
                </div>
                <h3 className="mt-6 text-xl font-bold text-gray-950">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--line)] px-6 py-10 text-center text-sm text-[var(--muted)]">
        © {new Date().getFullYear()} Shifuh
      </footer>
    </div>
  );
}
