"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createBrowserClient } from "@supabase/ssr";
import { ChevronDown, Gift, Star, UserRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

function findStorefrontHeaderAccountRow() {
  const mobileAccountControl = document.querySelector(
    'button[aria-label="Minha conta"], button[aria-label="Entrar na conta"]',
  );

  return mobileAccountControl?.parentElement?.parentElement ?? null;
}

export default function StorefrontAccountAccessBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(undefined);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  useEffect(() => {
    const resolveTarget = () => {
      const target = findStorefrontHeaderAccountRow();
      if (!target) return false;
      setPortalTarget(target);
      return true;
    };

    if (resolveTarget()) return;

    const observer = new MutationObserver(() => {
      if (resolveTarget()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setCurrentUser(data.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setCurrentUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (!portalTarget || currentUser === undefined) return null;

  const accountAccess = currentUser ? (
    <details className="group relative hidden shrink-0 sm:block">
      <summary
        className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-bold text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 [&::-webkit-details-marker]:hidden"
        aria-label="Abrir atalhos da minha conta"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600">
          <UserRound size={17} />
        </span>
        <span>Minha conta</span>
        <ChevronDown size={15} className="text-gray-400 transition-transform group-open:rotate-180" />
      </summary>

      <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(17,16,15,0.16)]">
        <button
          type="button"
          onClick={() => router.push("/minha-conta")}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-gray-700 transition hover:bg-gray-50"
        >
          <UserRound size={17} className="text-gray-400" />
          Minha conta
        </button>
        <button
          type="button"
          onClick={() => router.push("/minha-conta/fidelidade")}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-gray-700 transition hover:bg-gray-50"
        >
          <Star size={17} className="text-gray-400" />
          Fidelidade
        </button>
        <button
          type="button"
          onClick={() => router.push("/minha-conta/premios")}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-gray-700 transition hover:bg-gray-50"
        >
          <Gift size={17} className="text-gray-400" />
          Meus prêmios
        </button>
      </div>
    </details>
  ) : (
    <button
      type="button"
      onClick={() => router.push(`/auth?returnUrl=${encodeURIComponent(pathname)}`)}
      className="hidden max-w-[300px] shrink-0 items-center gap-2.5 rounded-full border border-gray-200 bg-white px-3 py-2 text-left text-xs font-bold leading-4 text-gray-600 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 sm:flex"
      aria-label="Entrar para acumular pontos e ganhar recompensas"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
        <UserRound size={17} />
      </span>
      <span>Entre para acumular pontos e ganhar recompensas</span>
    </button>
  );

  return createPortal(accountAccess, portalTarget);
}
