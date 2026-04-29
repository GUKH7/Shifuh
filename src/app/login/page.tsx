"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      showToast({
        title: "Nao foi possivel entrar",
        description: error.message,
        tone: "error",
      });
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-800">Area Administrativa</h1>
          <p className="text-sm text-gray-500">Faca login para gerenciar seu cardapio</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-red-500"
              placeholder="seu@email.com"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-700">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-red-500"
              placeholder="******"
              required
            />
          </div>

          <button
            disabled={loading}
            className="flex w-full items-center justify-center rounded-lg bg-red-600 py-3 font-bold text-white transition-all hover:bg-red-700"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Entrar no Painel"}
          </button>
        </form>
      </div>
    </div>
  );
}
