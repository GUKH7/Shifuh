"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Store } from "lucide-react";

export default function AdminLogin() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setRestaurantName(newName);
    setRestaurantSlug(newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, ""));
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      if (isRegistering) {
        if (!restaurantName.trim() || !restaurantSlug.trim()) {
          throw new Error("Preencha o nome e o link da sua loja.");
        }

        const { data: existingSlug } = await supabase
          .from("restaurants")
          .select("id")
          .eq("slug", restaurantSlug)
          .maybeSingle();

        if (existingSlug) throw new Error("Este link ja esta em uso.");

        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        if (!authData.user) throw new Error("Nao foi possivel criar o usuario.");

        const { error: dbError } = await supabase.from("restaurants").insert({
          name: restaurantName.trim(),
          slug: restaurantSlug.trim(),
          user_id: authData.user.id,
          phone: "",
        });

        if (dbError) throw dbError;

        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;

        router.push("/admin/settings");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/admin");
      }
    } catch (error: any) {
      setErrorMsg(error.message || "Ocorreu um erro. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f1ea]">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="hidden lg:block">
          <div className="inline-flex items-center gap-3">
            <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white">
              <Store size={18} />
            </div>
            <span className="text-2xl font-black tracking-tight text-gray-950">GESTOR.</span>
          </div>
          <h1 className="mt-8 max-w-xl text-6xl font-black leading-[0.95] tracking-[-0.05em] text-gray-950">
            Gerencie sua loja com pedidos direto no <span className="italic text-[var(--brand)]">WhatsApp.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-[var(--muted)]">
            Um painel simples para configurar a vitrine, publicar o cardapio e acompanhar os pedidos em tempo real.
          </p>
          <div className="mt-10 surface-card max-w-xl rounded-[28px] p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Fluxo MVP</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl bg-white px-4 py-4 text-sm font-semibold text-gray-700">1. Criar conta da loja</div>
              <div className="rounded-2xl bg-white px-4 py-4 text-sm font-semibold text-gray-700">2. Configurar cardapio e entrega</div>
              <div className="rounded-2xl bg-white px-4 py-4 text-sm font-semibold text-gray-700">3. Receber pedidos no painel</div>
            </div>
          </div>
        </div>

        <div className="surface-card mx-auto w-full max-w-md rounded-[32px] p-8 shadow-[0_30px_80px_rgba(17,16,15,0.08)]">
          <div className="mb-8 text-center lg:hidden">
            <div className="brand-gradient mx-auto flex h-12 w-12 items-center justify-center rounded-xl text-white">
              <Store size={20} />
            </div>
            <p className="mt-4 text-2xl font-black tracking-tight text-gray-950">GESTOR.</p>
          </div>

          <div>
            <h2 className="text-3xl font-black tracking-tight text-gray-950">
              {isRegistering ? "Crie sua loja" : "Entrar no painel"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {isRegistering
                ? "Abra sua operacao digital em poucos minutos."
                : "Use seu email para acessar cardapio, configuracoes e pedidos."}
            </p>
          </div>

          {errorMsg && (
            <div className="mt-6 rounded-2xl bg-[#fff0e8] px-4 py-3 text-sm font-medium text-[var(--brand)]">
              {errorMsg}
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleAuth}>
            {isRegistering && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-gray-700">Nome do negocio</label>
                  <input
                    type="text"
                    required
                    value={restaurantName}
                    onChange={handleNameChange}
                    className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none focus:border-[var(--brand)]"
                    placeholder="Ex: Pizzaria do Gustavo"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-gray-700">Link do cardapio</label>
                  <div className="flex overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
                    <span className="inline-flex items-center border-r border-[var(--line)] bg-[#fbf7f2] px-3 text-sm text-gray-500">
                      gestordelivery.com.br/
                    </span>
                    <input
                      type="text"
                      required
                      value={restaurantSlug}
                      onChange={(e) => setRestaurantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      className="w-full px-4 py-3.5 text-sm outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-bold text-gray-700">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none focus:border-[var(--brand)]"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-gray-700">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none focus:border-[var(--brand)]"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {isRegistering ? "Criar loja e entrar" : "Entrar agora"}
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 border-t border-[var(--line)] pt-6 text-center">
            <button
              onClick={() => {
                setIsRegistering(!isRegistering);
                setErrorMsg("");
              }}
              className="text-sm font-bold text-gray-600 transition-colors hover:text-[var(--brand)]"
            >
              {isRegistering ? "Ja tem uma conta? Faca login." : "Ainda nao tem loja? Crie uma conta."}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
