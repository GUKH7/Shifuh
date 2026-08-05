"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { CheckCircle2, CreditCard, Loader2, Save, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { AdminPageHeader, AdminPageShell } from "@/components/ui/admin-primitives";
import { AdminErrorState, AdminPageSkeleton } from "@/components/ui/admin-page-states";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import {
  defaultStorefrontPaymentMethods,
  normalizeStorefrontPaymentMethods,
  paymentMethodDetails,
  storefrontPaymentMethods,
  type StorefrontPaymentMethod,
} from "@/features/storefront/checkout-format";

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

export default function PaymentsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [supabase, setSupabase] = useState<BrowserSupabaseClient | null>(null);
  const [restaurantId, setRestaurantId] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<StorefrontPaymentMethod[]>(
    defaultStorefrontPaymentMethods,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadSettings = async (client: BrowserSupabaseClient | null = supabase) => {
    if (!client) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const { restaurant, user } = await getCurrentRestaurant(client);
      if (!user) {
        router.push("/admin/login");
        return;
      }
      if (!restaurant) throw new Error("Loja não encontrada.");

      setRestaurantId(restaurant.id);
      setPaymentMethods(
        normalizeStorefrontPaymentMethods((restaurant as any).accepted_payment_methods),
      );
    } catch (error) {
      console.error(error);
      setErrorMessage("Não foi possível carregar as formas de pagamento da loja.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      setErrorMessage("A conexão com o Supabase não está configurada neste ambiente.");
      setLoading(false);
      return;
    }

    setSupabase(createBrowserClient(supabaseUrl, supabaseAnonKey));
  }, []);

  useEffect(() => {
    if (supabase) void loadSettings(supabase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const togglePaymentMethod = (method: StorefrontPaymentMethod) => {
    setPaymentMethods((current) => {
      if (current.includes(method)) {
        if (current.length === 1) {
          showToast({
            title: "Mantenha uma forma ativa",
            description: "A vitrine precisa ter pelo menos uma forma de pagamento disponível.",
            tone: "error",
          });
          return current;
        }
        return current.filter((item) => item !== method);
      }

      return storefrontPaymentMethods.filter(
        (item) => item === method || current.includes(item),
      );
    });
  };

  const handleSave = async () => {
    if (!supabase || !restaurantId || paymentMethods.length === 0) return;

    setSaving(true);
    const { error } = await supabase
      .from("restaurants")
      .update({ accepted_payment_methods: paymentMethods } as any)
      .eq("id", restaurantId);

    if (error) {
      console.error(error);
      showToast({
        title: "Não foi possível salvar",
        description: error.message.includes("accepted_payment_methods")
          ? "A migration de formas de pagamento ainda precisa ser aplicada no Supabase."
          : error.message,
        tone: "error",
      });
    } else {
      showToast({
        title: "Formas de pagamento salvas",
        description: "A vitrine e a validação dos pedidos já usarão estas opções.",
        tone: "success",
      });
    }

    setSaving(false);
  };

  if (loading) return <AdminPageSkeleton ariaLabel="Carregando formas de pagamento" metrics={2} />;
  if (errorMessage) {
    return <AdminErrorState description={errorMessage} onRetry={() => void loadSettings()} />;
  }

  return (
    <AdminPageShell className="space-y-6 pb-20">
      <AdminPageHeader
        title="Pagamentos"
        description="Escolha quais formas de pagamento o cliente poderá selecionar na vitrine."
        icon={<WalletCards size={22} />}
        action={
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || paymentMethods.length === 0}
            className="brand-gradient inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar alterações
          </button>
        }
      />

      <section className="rounded-[28px] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
            <CreditCard size={20} />
          </span>
          <div>
            <h2 className="text-xl font-black text-gray-950">Formas aceitas pela loja</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
              Somente as opções ativadas serão exibidas no checkout. O servidor também bloqueará tentativas de usar uma forma desativada.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {storefrontPaymentMethods.map((method) => {
            const active = paymentMethods.includes(method);
            const details = paymentMethodDetails[method];

            return (
              <button
                key={method}
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => togglePaymentMethod(method)}
                className={`flex min-h-24 items-start gap-4 rounded-2xl border p-4 text-left transition-colors ${
                  active
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                    : "border-[var(--line)] bg-white hover:bg-[#faf7f3]"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    active ? "bg-[var(--brand)] text-white" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  <CheckCircle2 size={17} />
                </span>
                <span className="min-w-0">
                  <strong className="block text-base font-black text-gray-950">{details.label}</strong>
                  <span className="mt-1 block text-sm leading-5 text-gray-500">{details.description}</span>
                  <span className={`mt-2 block text-xs font-bold ${active ? "text-[var(--brand)]" : "text-gray-400"}`}>
                    {active ? "Disponível na vitrine" : "Oculto na vitrine"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          Nesta etapa, todas as opções representam pagamento feito diretamente à loja. A integração de pagamento online poderá ser adicionada separadamente.
        </p>
      </section>
    </AdminPageShell>
  );
}
