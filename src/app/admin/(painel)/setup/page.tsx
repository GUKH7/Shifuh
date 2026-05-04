"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Store } from "lucide-react";
import { getRestaurantByUserId } from "@/lib/supabase/restaurant";

export default function SetupPage() {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return router.push("/admin/login");
    setUser(user);

    const { restaurant } = await getRestaurantByUserId(supabase, user.id);
    if (restaurant) router.push("/admin");
    else setLoading(false);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    setSlug(newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, ""));
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      setError("Preencha todos os campos obrigatorios.");
      return;
    }
    if (!user?.id) {
      setError("Sua sessao expirou. Entre novamente para continuar.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const { data: existingSlug } = await supabase.from("restaurants").select("id").eq("slug", slug).maybeSingle();
      if (existingSlug) {
      setError("Este link já está em uso. Tente outra variação.");
        setIsSaving(false);
        return;
      }

      const { error: insertError } = await supabase.from("restaurants").insert({
        name: name.trim(),
        slug: slug.trim(),
        user_id: user.id,
        phone: "",
      });

      if (insertError) throw insertError;

      let createdRestaurant = null;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { restaurant } = await getRestaurantByUserId(supabase, user.id);

        if (restaurant) {
          createdRestaurant = restaurant;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      if (!createdRestaurant) {
      setError("A loja foi criada, mas o painel ainda não conseguiu carregar. Atualize a página.");
        return;
      }

      router.refresh();
      window.location.replace("/admin/settings");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Ocorreu um erro ao criar o restaurante.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f1ea]">
        <Loader2 className="animate-spin text-[var(--brand)]" size={30} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f1ea] px-4 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="hidden lg:block">
          <div className="inline-flex items-center gap-3">
            <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white">
              <Store size={18} />
            </div>
            <span className="text-2xl font-black tracking-tight text-gray-950">GESTOR.</span>
          </div>
          <h1 className="mt-8 max-w-xl text-6xl font-black leading-[0.95] tracking-[-0.05em] text-gray-950">
            Configure sua loja e publique sua vitrine digital.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-[var(--muted)]">
          Defina nome, link e identidade inicial da operação para começar a vender com pedidos direto no WhatsApp.
          </p>
        </div>

        <div className="surface-card mx-auto w-full max-w-lg rounded-[32px] p-8 shadow-[0_30px_80px_rgba(17,16,15,0.08)]">
          <div className="mb-8 text-center lg:hidden">
            <div className="brand-gradient mx-auto flex h-12 w-12 items-center justify-center rounded-xl text-white">
              <Store size={20} />
            </div>
            <p className="mt-4 text-2xl font-black tracking-tight text-gray-950">GESTOR.</p>
          </div>

              <h2 className="text-3xl font-black tracking-tight text-gray-950">Primeira configuração</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Escolha o nome do negócio e o slug que vai virar o link público do seu cardápio.
          </p>

          {error && <div className="mt-6 rounded-2xl bg-[#fff0e8] px-4 py-3 text-sm font-medium text-[var(--brand)]">{error}</div>}

          <form onSubmit={handleSetup} className="mt-6 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-gray-700">Nome da loja</label>
              <input
                type="text"
                required
                value={name}
                onChange={handleNameChange}
                placeholder="Ex: Burger House"
                className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>

            <div>
                  <label className="mb-1.5 block text-sm font-bold text-gray-700">Link do cardápio</label>
              <div className="flex overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
                <span className="inline-flex items-center border-r border-[var(--line)] bg-[#fbf7f2] px-3 text-sm text-gray-500">
                  gestordelivery.com.br/
                </span>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="w-full px-4 py-3.5 text-sm outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Criando loja...
                </>
              ) : (
                <>
                  Concluir configuração
                  <CheckCircle2 size={18} />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin/login")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-sm font-bold text-gray-700"
            >
              Voltar para login
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
