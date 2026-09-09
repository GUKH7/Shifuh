"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Star } from "lucide-react";
import { useParams } from "next/navigation";

type PromotionSummaryItem = {
  kind: "loyalty" | "wheel";
  title: string;
  message: string;
  detail?: string | null;
};

function createPromotionPortalTarget() {
  const catalogNavigation = document.querySelector<HTMLElement>("[data-catalog-nav]");
  if (!catalogNavigation?.parentElement) return null;

  const existing = document.querySelector<HTMLElement>("[data-storefront-promotions-portal]");
  if (existing) return existing;

  const target = document.createElement("div");
  target.dataset.storefrontPromotionsPortal = "true";
  catalogNavigation.parentElement.insertBefore(target, catalogNavigation);
  return target;
}

export default function StorefrontPromotionDiscoveryBridge() {
  const params = useParams<{ slug: string | string[] }>();
  const slug = useMemo(
    () => (Array.isArray(params.slug) ? params.slug[0] : params.slug) || "",
    [params.slug],
  );
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [promotions, setPromotions] = useState<PromotionSummaryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let target: HTMLElement | null = null;
    let observer: MutationObserver | null = null;

    const resolveTarget = () => {
      target = createPromotionPortalTarget();
      if (!target) return false;
      setPortalTarget(target);
      return true;
    };

    if (!resolveTarget()) {
      observer = new MutationObserver(() => {
        if (resolveTarget()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      if (target?.isConnected && target.dataset.storefrontPromotionsPortal === "true") {
        target.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!slug) {
      setPromotions([]);
      setLoaded(true);
      return;
    }

    const controller = new AbortController();
    setLoaded(false);

    fetch(`/api/storefront/promotions/summary?slug=${encodeURIComponent(slug)}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`promotion-summary:${response.status}`);
        return response.json();
      })
      .then((payload) => {
        setPromotions(Array.isArray(payload?.promotions) ? payload.promotions : []);
        setLoaded(true);
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setPromotions([]);
        setLoaded(true);
      });

    return () => controller.abort();
  }, [slug]);

  if (!portalTarget || !loaded || promotions.length === 0) return null;

  return createPortal(
    <section aria-label="Promoções da loja" className="border-b border-orange-100 bg-[#fffdfb]">
      <div className="mx-auto w-full max-w-5xl px-2.5 py-3 sm:px-6 sm:py-3.5">
        <div className="overflow-hidden rounded-2xl border border-orange-100 bg-[#fff8f3] shadow-[0_8px_24px_rgba(17,16,15,0.035)]">
          {promotions.map((promotion, index) => {
            const Icon = promotion.kind === "loyalty" ? Star : Sparkles;
            return (
              <article
                key={`${promotion.kind}-${promotion.title}`}
                className={`flex items-start gap-3 px-3.5 py-3 sm:px-4 ${
                  index > 0 ? "border-t border-orange-100" : ""
                }`}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--brand)] shadow-sm ring-1 ring-orange-100">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[var(--brand)]">
                    {promotion.title}
                  </p>
                  <p className="mt-0.5 text-sm font-bold leading-5 text-gray-800">
                    {promotion.message}
                  </p>
                  {promotion.detail ? (
                    <p className="mt-0.5 text-xs font-medium leading-4 text-gray-500">
                      {promotion.detail}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>,
    portalTarget,
  );
}
