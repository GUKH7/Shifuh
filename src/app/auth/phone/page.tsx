"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, CheckCircle2, Loader2, MessageSquareText, Phone, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { sanitizeCustomerReturnUrl } from "@/lib/customer-auth-routing";

function normalizeBrazilianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (!/^\d{10,11}$/.test(national)) return null;
  return `+55${national}`;
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function friendlyPhoneError(message = "") {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate") || normalized.includes("too many")) {
    return "Aguarde um pouco antes de solicitar outro código.";
  }
  if (normalized.includes("sms") || normalized.includes("phone provider") || normalized.includes("unsupported")) {
    return "O envio do código por SMS está temporariamente indisponível.";
  }
  if (normalized.includes("expired") || normalized.includes("token") || normalized.includes("otp")) {
    return "O código é inválido ou expirou. Solicite um novo código.";
  }
  return message || "Não foi possível confirmar o telefone agora.";
}

function PhoneVerificationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const returnUrl = sanitizeCustomerReturnUrl(searchParams.get("returnUrl"), "/minha-conta");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ),
    [],
  );

  const verifier = useMemo(
    () => createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    ),
    [],
  );

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;

      if (!user) {
        const phonePath = `/auth/phone?returnUrl=${encodeURIComponent(returnUrl)}`;
        router.replace(`/auth?returnUrl=${encodeURIComponent(phonePath)}`);
        return;
      }

      if (user.phone && user.phone_confirmed_at) {
        const response = await fetch("/api/customer/phone/link", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (response.ok) {
          await supabase.auth.refreshSession();
          router.replace(returnUrl);
          router.refresh();
          return;
        }
      }

      try {
        const profileResponse = await fetch("/api/customer/profile", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const profilePayload = await profileResponse.json().catch(() => ({}));
        const savedPhone = profilePayload?.customer?.phone;
        if (typeof savedPhone === "string" && savedPhone.trim()) {
          setPhoneInput(formatPhoneInput(savedPhone));
        }
      } catch {
        // Prefill is optional; verification remains available without it.
      }

      if (active) setLoading(false);
    };

    bootstrap();
    return () => {
      active = false;
    };
  }, [returnUrl, router, supabase]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const requestCode = async (event?: FormEvent) => {
    event?.preventDefault();
    if (sending || cooldown > 0) return;

    const phone = normalizeBrazilianPhone(phoneInput);
    if (!phone) {
      showToast({
        title: "Telefone inválido",
        description: "Informe um celular com DDD.",
        tone: "error",
      });
      return;
    }

    setSending(true);
    try {
      const { error } = await verifier.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;

      setVerifiedPhone(phone);
      setCode("");
      setStep("code");
      setCooldown(60);
      showToast({
        title: "Código enviado",
        description: "Digite o código de 6 dígitos recebido por SMS.",
        tone: "success",
      });
    } catch (cause) {
      showToast({
        title: "Não foi possível enviar o código",
        description: friendlyPhoneError(cause instanceof Error ? cause.message : ""),
        tone: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const confirmCode = async (event: FormEvent) => {
    event.preventDefault();
    if (verifying || !/^\d{6}$/.test(code) || !verifiedPhone) return;

    setVerifying(true);
    try {
      const { data, error } = await verifier.auth.verifyOtp({
        phone: verifiedPhone,
        token: code,
        type: "sms",
      });
      if (error || !data.session?.access_token) throw error || new Error("Código inválido.");

      const linkResponse = await fetch("/api/customer/phone/link", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationAccessToken: data.session.access_token }),
      });
      const linkPayload = await linkResponse.json().catch(() => ({}));
      if (!linkResponse.ok) throw new Error(linkPayload.error || "Não foi possível vincular o telefone.");

      await supabase.auth.refreshSession();
      showToast({
        title: "Telefone confirmado",
        description: "Seus pontos, prêmios e giros já podem ser atualizados com segurança.",
        tone: "success",
      });
      router.replace(returnUrl);
      router.refresh();
    } catch (cause) {
      showToast({
        title: "Não foi possível confirmar",
        description: friendlyPhoneError(cause instanceof Error ? cause.message : ""),
        tone: "error",
      });
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f6f5]">
        <Loader2 className="animate-spin text-orange-500" size={28} />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f6f5] p-4 font-sans">
      <section className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-[0_18px_60px_rgba(17,24,39,0.08)] sm:p-8">
        <button
          type="button"
          onClick={() => router.replace(returnUrl)}
          className="mb-6 flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
        >
          <ArrowLeft size={17} /> Voltar
        </button>

        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
          {step === "phone" ? <ShieldCheck size={24} /> : <MessageSquareText size={24} />}
        </span>
        <h1 className="mt-4 text-2xl font-black text-gray-950">
          {step === "phone" ? "Confirme seu telefone" : "Digite o código"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          {step === "phone"
            ? "Seu telefone conecta pedidos, pontos, prêmios e a Roleta à mesma conta. Enviaremos um código por SMS."
            : `Enviamos um código para ${formatPhoneInput(verifiedPhone)}. Ele confirma que este número realmente pertence a você.`}
        </p>

        {step === "phone" ? (
          <form onSubmit={requestCode} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-gray-500">Celular com DDD</span>
              <div className="relative">
                <Phone className="absolute left-3 top-3.5 text-gray-400" size={19} />
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  placeholder="(11) 99999-9999"
                  value={phoneInput}
                  onChange={(event) => setPhoneInput(formatPhoneInput(event.target.value))}
                  className="w-full rounded-2xl border border-gray-200 bg-white p-3.5 pl-10 text-base font-bold text-gray-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-50"
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={sending}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 font-black text-white transition hover:bg-gray-800 disabled:opacity-60"
            >
              {sending ? <><Loader2 className="animate-spin" size={18} /> Enviando...</> : "Enviar código por SMS"}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmCode} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-gray-500">Código de 6 dígitos</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-center text-2xl font-black tracking-[0.32em] text-gray-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-50"
              />
            </label>
            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 font-black text-white transition hover:bg-orange-600 disabled:opacity-60"
            >
              {verifying ? <><Loader2 className="animate-spin" size={18} /> Confirmando...</> : <><CheckCircle2 size={18} /> Confirmar telefone</>}
            </button>
            <div className="flex items-center justify-between gap-3 text-sm">
              <button
                type="button"
                onClick={() => { setStep("phone"); setCode(""); }}
                className="min-h-10 rounded-xl px-2 font-bold text-gray-500 hover:bg-gray-50"
              >
                Alterar número
              </button>
              <button
                type="button"
                disabled={cooldown > 0 || sending}
                onClick={() => requestCode()}
                className="min-h-10 rounded-xl px-2 font-black text-orange-600 hover:bg-orange-50 disabled:text-gray-400"
              >
                {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 flex items-start gap-2 rounded-2xl bg-gray-50 p-3 text-xs font-medium leading-5 text-gray-500">
          <ShieldCheck className="mt-0.5 shrink-0 text-gray-400" size={15} />
          O código serve apenas para provar a posse do número. A Roleta e os benefícios continuam validados no servidor.
        </p>
      </section>
    </main>
  );
}

export default function CustomerPhoneVerificationPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#f6f6f5]"><Loader2 className="animate-spin text-orange-500" /></div>}>
      <PhoneVerificationContent />
    </Suspense>
  );
}
