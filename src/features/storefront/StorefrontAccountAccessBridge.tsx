"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createBrowserClient } from "@supabase/ssr";
import { ChevronDown, Gift, Star, UserRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

type BenefitsSummaryState =
  | { status: "idle" | "loading"; pointsBalance: 0; availableRewards: 0 }
  | { status: "ready"; pointsBalance: number; availableRewards: number }
  | { status: "error"; pointsBalance: 0; availableRewards: 0 };

function findStorefrontHeaderAccountRow() {
  const mobileAccountControl = document.querySelector(
    'button[aria-label="Minha conta"], button[aria-label="Entrar na conta"]',
  );

  return mobileAccountControl?.parentElement?.parentElement ?? null;
}

function getStoreSlug(pathname: string) {
  const segment = pathname.split("/").filter(Boolean)[0] || "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function benefitLabel(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export default function StorefrontAccountAccessBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const storeSlug = useMemo(() => getStoreSlug(pathname), [pathname]);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(undefined);
  const [benefits, setBenefits] = useState<BenefitsSummaryState>({
    status: "idle",
    pointsBalance: 0,
    availableRewards: 0,
  });

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

  useEffect(() => {
    if (!currentUser || !storeSlug) {
      setBenefits({ status: "idle", pointsBalance: 0, availableRewards: 0 });
      return;
    }

    const controller = new AbortController();
    setBenefits({ status: "loading", pointsBalance: 0, availableRewards: 0 });

    fetch(`/api/customer/benefits-summary?slug=${encodeURIComponent(storeSlug)}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`benefits-summary:${response.status}`);
        return response.json();
      })
      .then((payload) => {
        const pointsBalance = Number(payload?.pointsBalance);
        const availableRewards = Number(payload?.availableRewards);
        setBenefits({
          status: "ready",
          pointsBalance: Number.isFinite(pointsBalance) ? Math.max(0, pointsBalance) : 0,
          availableRewards: Number.isFinite(availableRewards)
            ? Math.max(0, Math.trunc(availableRewards))
            : 0,
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setBenefits({ status: "error", pointsBalance: 0, availableRewards: 0 });
      });

    return () => controller.abort();
  }, [currentUser, storeSlug]);

  if (!portalTarget || currentUser === undefined) return null;

  const benefitsSummary = (() => {
    if (benefits.status === "loading" || benefits.status === "idle") {
      return (
        <div
          className="flex h-[46px] min-w-[152px] items-center gap-2 rounded-full border border-gray-200 bg-white px-3 shadow-sm"
          aria-label="Carregando benefícios"
        >
          <span className="h-3 w-12 animate-pulse rounded-full bg-gray-200" />
          <span className="h-3 w-16 animate-pulse rounded-full bg-gray-100" />
        </div>
      );
    }

    if (benefits.status === "error") {
      return (
        <div
          className="flex h-[46px] items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-bold text-gray-400 shadow-sm"
          title="Não foi possível carregar seus benefícios agora."
        >
          Benefícios indisponíveis
        </div>
      );
    }

    const hasPoints = benefits.pointsBalance > 0;
    const hasRewards = benefits.availableRewards > 0;

    if (!hasPoints && !hasRewards) {
      return (
        <div className="flex h-[46px] items-center rounded-full border border-gray-200 bg-white px-3 text-xs font-bold text-gray-500 shadow-sm">
          Sem benefícios nesta loja
        </div>
      );
    }

    return (
      <div className="flex h-[46px] items-center overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm">
        {hasPoints ? (
          <button
            type="button"
            onClick={() => router.push("/minha-conta/fidelidade")}
            className="flex h-full items-center gap-1.5 px-3 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
            aria-label={`${benefitLabel(benefits.pointsBalance, "ponto", "pontos")}. Abrir fidelidade.`}
          >
            <span aria-hidden="true">⭐</span>
            <span>{benefitLabel(benefits.pointsBalance, "ponto", "pontos")}</span>
          </button>
        ) : null}

        {hasPoints && hasRewards ? <span className="text-gray-300">·</span> : null}

        {hasRewards ? (
          <button
            type="button"
            onClick={() => router.push("/minha-conta/premios")}
            className="flex h-full items-center gap-1.5 px-3 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
            aria-label={`${benefitLabel(benefits.availableRewards, "prêmio", "prêmios")}. Abrir meus prêmios.`}
          >
            <span aria-hidden="true">🎁</span>
            <span>{benefitLabel(benefits.availableRewards, "prêmio", "prêmios")}</span>
          </button>
        ) : null}
      </div>
    );
  })();

  const accountAccess = currentUser ? (
    <div className="hidden shrink-0 items-center gap-2 sm:flex">
      {benefitsSummary}

      <details className="group relative shrink-0">
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
    </div>
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
