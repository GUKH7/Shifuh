"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Gift, Loader2, LogIn, Phone, Sparkles, Trophy, X } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";

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

type WheelIdentityIssue =
  | "unauthenticated"
  | "phone_unverified"
  | "phone_account_missing"
  | "phone_mismatch";

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

function getWheelLabelLayout(label: string) {
  const text = label.trim();

  const percentDiscount = text.match(/^(\d+(?:[.,]\d+)?)%\s+de\s+desconto$/i);
  if (percentDiscount) {
    return {
      kicker: "DESCONTO",
      lines: [`${percentDiscount[1]}%`],
      emphasis: true,
    };
  }

  const fixedDiscount = text.match(/^R\$\s*([\d.,]+)\s+de\s+desconto$/i);
  if (fixedDiscount) {
    return {
      kicker: "DESCONTO",
      lines: [`R$ ${fixedDiscount[1]}`],
      emphasis: true,
    };
  }

  if (/frete\s+gr[aá]tis/i.test(text)) {
    return {
      kicker: "",
      lines: ["FRETE", "GRÁTIS"],
      emphasis: false,
    };
  }

  if (/n[aã]o\s+foi\s+dessa\s+vez/i.test(text)) {
    return {
      kicker: "",
      lines: ["NÃO FOI", "DESSA VEZ"],
      emphasis: false,
    };
  }

  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    return {
      kicker: "",
      lines: [words.join(" ")],
      emphasis: false,
    };
  }

  const middle = Math.ceil(words.length / 2);
  return {
    kicker: "",
    lines: [words.slice(0, middle).join(" "), words.slice(middle).join(" ")],
    emphasis: false,
  };
}

function isIdentityIssue(value: unknown): value is WheelIdentityIssue {
  return value === "unauthenticated"
    || value === "phone_unverified"
    || value === "phone_account_missing"
    || value === "phone_mismatch";
}

export default function LuckyWheelStorefrontBridge() {
  const params = useParams<{ slug: string | string[] }>();
  const pathname = usePathname();
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
  const [identityIssue, setIdentityIssue] = useState<WheelIdentityIssue | null>(null);
  const [identityNoticeDismissed, setIdentityNoticeDismissed] = useState(false);
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
      if (payload.spin) {
        setIdentityIssue(null);
        setIdentityNoticeDismissed(false);
      }
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
        setIdentityIssue(null);
        setIdentityNoticeDismissed(false);
        if (payload.primaryColor) setPrimaryColor(payload.primaryColor);
        return;
      }

      if (isIdentityIssue(payload.identityStatus)) {
        setIdentityIssue(payload.identityStatus);
        setIdentityNoticeDismissed(false);
      } else {
        setIdentityIssue(null);
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

  const handleIdentityAction = () => {
    if (identityIssue === "unauthenticated") {
      router.push(`/auth?returnUrl=${encodeURIComponent(pathname)}`);
      return;
    }
    router.push(`/auth/phone?returnUrl=${encodeURIComponent(pathname)}`);
  };

  const showIdentityNotice = Boolean(identityIssue && !identityNoticeDismissed && !spin && !open);
  if (!spin && !open && !showIdentityNotice) return null;

  const needsLogin = identityIssue === "unauthenticated";

  return (
    <>
      {showIdentityNotice && identityIssue && (
        <aside
          role="status"
          aria-live="polite"
          aria-label="Ação necessária para participar da Roleta"
          className="fixed bottom-24 left-1/2 z-[58] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_18px_50px_rgba(17,24,39,0.14)] sm:bottom-6"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
              {needsLogin ? <LogIn size={19} /> : <Phone size={19} />}
            </span>
            <div className="min-w-0 flex-1 pr-7">
              <strong className="block text-sm font-black text-gray-950">
                {needsLogin
                  ? "Entre para validar sua chance na Roleta"
                  : "Confirme seu telefone para validar a Roleta"}
              </strong>
              <p className="mt-1 text-xs font-medium leading-5 text-gray-500">
                {needsLogin
                  ? "A Roleta usa sua conta para confirmar com segurança se o pedido liberou um giro."
                  : "Promoções exigem uma conta com telefone confirmado e corretamente vinculado."}
              </p>
              <button
                type="button"
                onClick={handleIdentityAction}
                className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-black text-orange-600 transition hover:bg-orange-50"
              >
                {needsLogin ? "Entrar" : "Confirmar telefone"} <ArrowRight size={14} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIdentityNoticeDismissed(true)}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              aria-label="Dispensar aviso da Roleta"
            >
              <X size={16} />
            </button>
          </div>
        </aside>
      )}

      {spin && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-[24px] border border-orange-200/80 bg-white text-left shadow-[0_20px_60px_rgba(17,24,39,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(17,24,39,0.22)] sm:bottom-6"
        >
          <span
            className="absolute inset-y-0 left-0 w-1.5"
            style={{ backgroundColor: primaryColor }}
            aria-hidden="true"
          />
          <span className="flex items-center gap-3 px-4 py-3.5">
            <span
              className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_8px_20px_rgba(255,110,31,0.28)]"
              style={{ backgroundColor: primaryColor }}
            >
              <Sparkles size={22} />
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-300" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-black uppercase tracking-[0.15em] text-orange-500">
                Giro liberado
              </span>
              <strong className="mt-0.5 block text-[15px] font-black text-gray-950">
                Você ganhou um giro!
              </strong>
              <span className="mt-0.5 block truncate text-xs font-medium text-gray-500">
                {spin.campaignName} · toque para descobrir seu prêmio
              </span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-500">
              <ArrowRight size={17} />
            </span>
          </span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-gray-950/65 p-0 backdrop-blur-md sm:items-center sm:p-5">
          <section className="relative max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-[30px] border border-white/70 bg-[#fffdfa] shadow-[0_32px_100px_rgba(17,24,39,0.35)] sm:max-h-[92dvh] sm:rounded-[30px]">
            <div className="relative overflow-hidden border-b border-orange-100 bg-[linear-gradient(145deg,#fff7f1_0%,#fffdfa_55%,#fff4ea_100%)] px-5 pb-5 pt-5 sm:px-7 sm:pt-6">
              <div
                className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full opacity-10 blur-2xl"
                style={{ backgroundColor: primaryColor }}
              />
              <div className="pointer-events-none absolute -left-14 bottom-[-90px] h-40 w-40 rounded-full bg-amber-300/10 blur-2xl" />

              <button
                type="button"
                onClick={closeModal}
                disabled={spinning}
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200/80 bg-white/90 text-gray-500 shadow-sm backdrop-blur transition hover:bg-white hover:text-gray-800 disabled:opacity-40"
                aria-label="Fechar roleta"
              >
                <X size={18} />
              </button>

              <div className="relative pr-12">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-orange-600 shadow-sm">
                  <Sparkles size={12} />
                  Giro liberado
                </span>
                <h2 className="mt-3 text-[27px] font-black leading-tight tracking-[-0.03em] text-gray-950">
                  {result ? "Confira seu resultado" : "Gire e descubra seu prêmio"}
                </h2>
                <p className="mt-2 max-w-md text-sm font-medium leading-6 text-gray-500">
                  {result
                    ? "Seu resultado foi registrado com segurança."
                    : `${spin?.campaignName || "Roleta da Sorte"} · seu prêmio será revelado ao final do giro.`}
                </p>
              </div>
            </div>

            {!result && (
              <div className="px-5 pb-7 pt-6 sm:px-7 sm:pb-8">
                <div className="relative mx-auto aspect-square w-full max-w-[344px]">
                  <div
                    className="absolute inset-[-10px] rounded-full opacity-20 blur-xl"
                    style={{ backgroundColor: primaryColor }}
                    aria-hidden="true"
                  />
                  <div className="absolute inset-0 rounded-full border border-orange-100 bg-white shadow-[0_20px_55px_rgba(17,24,39,0.12)]" />

                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((dot) => {
                    const angle = dot * 30;
                    return (
                      <span
                        key={dot}
                        className="absolute left-1/2 top-1/2 z-[8] h-2.5 w-2.5 rounded-full border border-white bg-amber-300 shadow-sm"
                        style={{
                          transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-162px)`,
                        }}
                        aria-hidden="true"
                      />
                    );
                  })}

                  <div
                    className="absolute inset-[13px] rounded-full border-[9px] border-white shadow-[inset_0_0_0_1px_rgba(255,110,31,0.08),0_18px_45px_rgba(17,24,39,0.16)] transition-transform duration-[4000ms] ease-[cubic-bezier(.12,.72,.18,1)] motion-reduce:duration-0"
                    style={{ background, transform: `rotate(${rotation}deg)` }}
                  >
                    {segments.map((segment, index) => {
                      const angle = ((index + 0.5) * 360) / segments.length;
                      const flipForReading = angle > 90 && angle < 270 ? 180 : 0;
                      const label = getWheelLabelLayout(segment.label);
                      const textColor =
                        index % 6 === 0 || index % 6 === 1 || index % 6 === 5
                          ? "#ffffff"
                          : "#4b2b1b";

                      return (
                        <span
                          key={segment.id}
                          className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2"
                          style={{
                            transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-112px) rotate(${flipForReading}deg)`,
                          }}
                        >
                          <span
                            className="flex w-[102px] flex-col items-center justify-center text-center uppercase"
                            style={{
                              color: textColor,
                              textShadow:
                                textColor === "#ffffff"
                                  ? "0 1px 2px rgba(0,0,0,0.32)"
                                  : "0 1px 0 rgba(255,255,255,0.72)",
                            }}
                          >
                            {label.kicker ? (
                              <span className="text-[8px] font-black leading-none tracking-[0.12em] opacity-90">
                                {label.kicker}
                              </span>
                            ) : null}

                            {label.lines.map((line, lineIndex) => (
                              <span
                                key={`${segment.id}-${lineIndex}`}
                                className={
                                  label.emphasis
                                    ? "mt-1 text-[17px] font-black leading-none tracking-[-0.03em]"
                                    : "text-[10px] font-black leading-[1.08] tracking-[-0.01em]"
                                }
                              >
                                {line}
                              </span>
                            ))}
                          </span>
                        </span>
                      );
                    })}
                  </div>

                  <div className="absolute left-1/2 top-[-8px] z-20 -translate-x-1/2">
                    <div
                      className="h-0 w-0 border-x-[16px] border-t-[30px] border-x-transparent drop-shadow-md"
                      style={{ borderTopColor: primaryColor }}
                    />
                    <span className="absolute left-1/2 top-[-4px] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-gray-950" />
                  </div>

                  <div
                    className="absolute left-1/2 top-1/2 z-10 flex h-[86px] w-[86px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[7px] border-white text-white shadow-[0_10px_30px_rgba(17,24,39,0.28)]"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <div className="text-center">
                      <Gift size={25} className="mx-auto" />
                      <span className="mt-0.5 block text-[8px] font-black uppercase tracking-[0.1em]">Prêmio</span>
                    </div>
                  </div>
                </div>

                <div className="mx-auto mt-5 flex max-w-[344px] items-center justify-center gap-2 rounded-full bg-gray-100/80 px-3 py-2 text-[11px] font-bold text-gray-500">
                  <Trophy size={14} className="text-amber-500" />
                  O resultado é definido com segurança pelo servidor
                </div>

                {error && (
                  <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSpin}
                  disabled={spinning || segments.length === 0}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-black text-white shadow-[0_12px_30px_rgba(255,110,31,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(255,110,31,0.34)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  style={{ backgroundColor: primaryColor }}
                >
                  {spinning ? (
                    <>
                      <Loader2 size={19} className="animate-spin" />
                      Girando...
                    </>
                  ) : (
                    <>
                      <Sparkles size={19} />
                      Girar a roleta
                    </>
                  )}
                </button>
                <p className="mt-2 text-center text-[11px] font-medium text-gray-400">
                  O giro não pode ser repetido depois que o resultado for revelado.
                </p>
              </div>
            )}

            {result && (
              <div className="px-5 pb-8 pt-7 text-center sm:px-7" role="status" aria-live="polite">
                <div
                  className={`mx-auto max-w-sm overflow-hidden rounded-[26px] border p-6 ${
                    result.type === "no_prize"
                      ? "border-gray-200 bg-gray-50"
                      : "border-orange-200 bg-[linear-gradient(145deg,#fff7f0,#fffdf9)] shadow-[0_18px_50px_rgba(255,110,31,0.10)]"
                  }`}
                >
                  <span
                    className={`mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] shadow-sm ${
                      result.type === "no_prize"
                        ? "bg-white text-gray-500"
                        : "bg-white text-orange-600 ring-1 ring-orange-100"
                    }`}
                  >
                    {result.type === "no_prize" ? <Gift size={32} /> : <Trophy size={36} />}
                  </span>

                  <p className={`mt-5 text-[10px] font-black uppercase tracking-[0.18em] ${
                    result.type === "no_prize" ? "text-gray-400" : "text-orange-500"
                  }`}>
                    {result.type === "no_prize" ? "Resultado do giro" : "Parabéns! Você ganhou"}
                  </p>
                  <h3 className="mt-2 text-[30px] font-black leading-tight tracking-[-0.03em] text-gray-950">
                    {result.label}
                  </h3>
                  {result.productName && (
                    <p className="mt-2 inline-flex rounded-full bg-orange-100 px-3 py-1.5 text-xs font-black text-orange-700">
                      {result.productName}
                    </p>
                  )}
                  <p className="mx-auto mt-4 max-w-sm text-sm font-medium leading-6 text-gray-500">
                    {result.rewardId
                      ? "Seu prêmio já está salvo na sua conta e pronto para ser usado dentro da validade."
                      : "Dessa vez não saiu um benefício. Continue participando das próximas campanhas da loja."}
                  </p>
                </div>

                {result.rewardId && (
                  <button
                    type="button"
                    onClick={() => router.push("/minha-conta/premios")}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-black text-white shadow-[0_12px_30px_rgba(255,110,31,0.24)] transition hover:-translate-y-0.5"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Ver meu prêmio <ArrowRight size={18} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeModal}
                  className="mt-2 w-full rounded-2xl py-3 text-sm font-bold text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                >
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
