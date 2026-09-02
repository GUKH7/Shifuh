"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Gift, Loader2, Sparkles, Trophy, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

type WheelSpin = {
  id: string;
  campaignId: string;
  campaignName: string;
};

type WheelSegment = {
  id: string;
  label: string;
  type: string;
};

type WheelResult = {
  spinId: string;
  resultId: string;
  prizeId: string;
  type: string;
  label: string;
  percentageValue: number | null;
  fixedAmount: number | null;
  productId: string | null;
  productName: string | null;
  rewardId: string | null;
  rewardExpiresAt: string | null;
};

const SEGMENT_COLORS = ["#ff6e1f", "#111827", "#fff1e8", "#f59e0b", "#f3f4f6", "#fb923c"];

function wheelBackground(segments: WheelSegment[]) {
  if (!segments.length) return "#f3f4f6";
  const slice = 360 / segments.length;
  return `conic-gradient(${segments.map((_, index) => {
    const start = index * slice;
    const end = (index + 1) * slice;
    return `${SEGMENT_COLORS[index % SEGMENT_COLORS.length]} ${start}deg ${end}deg`;
  }).join(", ")})`;
}

function shortLabel(label: string) {
  return label.length > 18 ? `${label.slice(0, 16)}…` : label;
}

export default function LuckyWheelStorefrontBridge() {
  const params = useParams<{ slug: string | string[] }>();
  const router = useRouter();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [spin, setSpin] = useState<WheelSpin | null>(null);
  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [primaryColor, setPrimaryColor] = useState("#ff6e1f");
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<WheelResult | null>(null);
  const [error, setError] = useState("");
  const checkedOrdersRef = useRef(new Set<string>());

  const refreshState = useCallback(async () => {
    if (!slug) return;
    try {
      const response = await fetch(`/api/storefront/promotions/wheel?slug=${encodeURIComponent(slug)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;
      setSpin(payload.spin || null);
      setSegments(Array.isArray(payload.segments) ? payload.segments : []);
      if (payload.primaryColor) setPrimaryColor(payload.primaryColor);
    } catch {
      // Promotions never block the storefront.
    }
  }, [slug]);

  const checkCompletedOrder = useCallback(async (orderId: string) => {
    if (!slug || !orderId || checkedOrdersRef.current.has(orderId)) return;
    checkedOrdersRef.current.add(orderId);

    try {
      const response = await fetch("/api/storefront/promotions/wheel/eligibility", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, orderId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        checkedOrdersRef.current.delete(orderId);
        return;
      }
      if (payload.spin) {
        setSpin(payload.spin);
        setSegments(Array.isArray(payload.segments) ? payload.segments : []);
        if (payload.primaryColor) setPrimaryColor(payload.primaryColor);
      }
    } catch {
      checkedOrdersRef.current.delete(orderId);
    }
  }, [slug]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  useEffect(() => {
    if (!slug) return;
    const inspectLastOrder = () => {
      try {
        const raw = window.localStorage.getItem(`gestor-delivery:last-order:${slug}`);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.orderId === "string") checkCompletedOrder(parsed.orderId);
      } catch {
        // Ignore malformed legacy localStorage data.
      }
    };

    inspectLastOrder();
    const timer = window.setInterval(inspectLastOrder, 900);
    return () => window.clearInterval(timer);
  }, [checkCompletedOrder, slug]);

  const background = useMemo(() => wheelBackground(segments), [segments]);

  const handleSpin = async () => {
    if (!spin || spinning || segments.length === 0) return;
    setSpinning(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/storefront/promotions/wheel", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spinId: spin.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.result) throw new Error(payload.error || "Não foi possível concluir o giro.");

      const serverResult = payload.result as WheelResult;
      const targetIndex = Math.max(0, segments.findIndex((segment) => segment.id === serverResult.prizeId));
      const slice = 360 / segments.length;
      const targetCenter = targetIndex * slice + slice / 2;
      const nextRotation = rotation + 6 * 360 + (360 - targetCenter);
      setRotation(nextRotation);

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(() => {
        setResult(serverResult);
        setSpinning(false);
        setSpin(null);
      }, reducedMotion ? 100 : 4100);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir o giro agora.");
      setSpinning(false);
    }
  };

  const closeModal = () => {
    if (spinning) return;
    setOpen(false);
    setResult(null);
    setError("");
    refreshState();
  };

  if (!spin && !open) return null;

  return (
    <>
      {spin && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-orange-200 bg-white px-4 py-3 text-left shadow-[0_18px_50px_rgba(17,24,39,0.18)] sm:bottom-6"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
            <Sparkles size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-sm font-black text-gray-950">Você ganhou um giro!</strong>
            <span className="mt-0.5 block truncate text-xs text-gray-500">{spin.campaignName} · toque para girar</span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-orange-500" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <section className="relative max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-[30px] bg-[#fafafa] px-5 pb-7 pt-5 shadow-2xl sm:max-h-[92dvh] sm:rounded-[30px] sm:px-7 sm:pb-8">
            <button
              type="button"
              onClick={closeModal}
              disabled={spinning}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 disabled:opacity-40"
              aria-label="Fechar roleta"
            >
              <X size={18} />
            </button>

            <div className="pr-12">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Roleta da Sorte</p>
              <h2 className="mt-1 text-2xl font-black text-gray-950">{spin?.campaignName || "Seu resultado"}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                O prêmio é definido com segurança no servidor. A roleta abaixo apenas revela o resultado.
              </p>
            </div>

            {!result && (
              <div className="mt-7">
                <div className="relative mx-auto aspect-square w-full max-w-[330px]">
                  <div className="absolute left-1/2 top-[-5px] z-20 h-0 w-0 -translate-x-1/2 border-x-[14px] border-t-[24px] border-x-transparent border-t-gray-950 drop-shadow" />
                  <div
                    className="absolute inset-2 rounded-full border-[8px] border-white shadow-[0_18px_55px_rgba(17,24,39,0.18)] transition-transform duration-[4000ms] ease-[cubic-bezier(.12,.72,.18,1)] motion-reduce:duration-0"
                    style={{ background, transform: `rotate(${rotation}deg)` }}
                  >
                    {segments.map((segment, index) => {
                      const angle = ((index + 0.5) * 360) / segments.length;
                      return (
                        <span
                          key={segment.id}
                          className="absolute left-1/2 top-1/2 w-[92px] -translate-x-1/2 -translate-y-1/2 text-center text-[10px] font-black leading-tight text-gray-950 drop-shadow-[0_1px_0_rgba(255,255,255,0.75)]"
                          style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-112px) rotate(${-angle}deg)` }}
                        >
                          {shortLabel(segment.label)}
                        </span>
                      );
                    })}
                  </div>
                  <div className="absolute left-1/2 top-1/2 z-10 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[7px] border-white bg-gray-950 text-white shadow-lg">
                    <Gift size={28} />
                  </div>
                </div>

                {error && <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

                <button
                  type="button"
                  onClick={handleSpin}
                  disabled={spinning || segments.length === 0}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: primaryColor }}
                >
                  {spinning ? <><Loader2 size={19} className="animate-spin" /> Revelando resultado...</> : <><Sparkles size={19} /> Girar agora</>}
                </button>
              </div>
            )}

            {result && (
              <div className="mt-8 text-center" role="status" aria-live="polite">
                <span className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${result.type === "no_prize" ? "bg-gray-100 text-gray-500" : "bg-orange-100 text-orange-600"}`}>
                  {result.type === "no_prize" ? <Gift size={34} /> : <Trophy size={36} />}
                </span>
                <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-gray-400">Resultado do giro</p>
                <h3 className="mt-2 text-3xl font-black text-gray-950">{result.label}</h3>
                {result.productName && <p className="mt-2 text-sm font-bold text-orange-600">Produto: {result.productName}</p>}
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-gray-500">
                  {result.rewardId
                    ? "Seu prêmio já foi registrado na sua conta e está disponível em Meus prêmios."
                    : "Dessa vez não saiu um benefício, mas o resultado ficou registrado com segurança."}
                </p>

                {result.rewardId && (
                  <button
                    type="button"
                    onClick={() => router.push("/minha-conta/premios")}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-black text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Ver Meus prêmios <ArrowRight size={18} />
                  </button>
                )}
                <button type="button" onClick={closeModal} className="mt-2 w-full py-3 text-sm font-bold text-gray-500">
                  Voltar ao cardápio
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
