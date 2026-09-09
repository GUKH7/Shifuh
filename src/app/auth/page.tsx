"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Lock, Mail } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import {
  buildCustomerPhoneVerificationUrl,
  sanitizeCustomerReturnUrl,
} from "@/lib/customer-auth-routing";

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = sanitizeCustomerReturnUrl(searchParams.get("returnUrl"));
  const { showToast } = useToast();

  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ),
    [],
  );

  const [checkingSession, setCheckingSession] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user) {
        router.replace(buildCustomerPhoneVerificationUrl(returnUrl));
        return;
      }
      setCheckingSession(false);
    });
    return () => {
      active = false;
    };
  }, [returnUrl, router, supabase]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;
        if (!data.session || !data.user) throw new Error("Não foi possível iniciar sua sessão.");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;

        if (!data.session || !data.user) {
          showToast({
            title: "Confirme seu e-mail",
            description: "Abra a mensagem enviada para seu e-mail e depois entre na sua conta para continuar.",
            tone: "success",
          });
          setIsLogin(true);
          return;
        }
      }

      router.push(buildCustomerPhoneVerificationUrl(returnUrl));
      router.refresh();
    } catch (error: any) {
      showToast({
        title: "Não foi possível autenticar",
        description: error.message || "Verifique seus dados e tente novamente.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-28 items-center justify-center">
        <Loader2 className="animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
      <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600">
        <ArrowLeft size={16} />
        Voltar
      </button>

      <h1 className="mb-1 text-2xl font-bold text-gray-800">
        {isLogin ? "Acessar conta" : "Criar conta"}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        {isLogin ? "Faça login para continuar seu pedido." : "Crie sua conta em segundos."}
      </p>

      <form onSubmit={handleAuth} className="space-y-4">
        <div className="relative">
          <Mail className="absolute left-3 top-3.5 text-gray-400" size={20} />
          <input
            type="email"
            required
            placeholder="Seu melhor email"
            className="w-full rounded-xl border p-3 pl-10 outline-none focus:border-red-500"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-3.5 text-gray-400" size={20} />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Crie uma senha"
            className="w-full rounded-xl border p-3 pl-10 outline-none focus:border-red-500"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
        </div>
        <button
          disabled={loading}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3.5 font-bold text-white transition-colors hover:bg-red-700"
        >
          {loading ? <Loader2 className="animate-spin" /> : isLogin ? "Entrar e pedir" : "Cadastrar e pedir"}
        </button>
      </form>

      <div className="mt-6 text-center">
        <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-sm text-gray-600 hover:text-gray-900">
          {isLogin ? "Ainda não tem conta? " : "Já tem uma conta? "}
          <span className="font-bold text-red-600 hover:underline">
            {isLogin ? "Cadastre-se" : "Faça login"}
          </span>
        </button>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 font-sans">
      <Suspense fallback={<div className="flex justify-center"><Loader2 className="animate-spin text-red-600" /></div>}>
        <AuthContent />
      </Suspense>
    </div>
  );
}
