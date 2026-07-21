"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bike,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  MapPin,
  MessageCircle,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Store,
} from "lucide-react";
import {
  isOrderInProgress,
  ORDER_STATUS_DETAILS,
} from "@/features/storefront/order-tracking";
import { paymentMethodDetails, type StorefrontPaymentMethod } from "@/features/storefront/checkout-format";
import { formatMoney, getContrastTextColor } from "@/features/storefront/format";
import type { OrderTrackingResponse } from "@/features/storefront/types";

type Props = { orderId: string; token: string };

const TRACKING_STEPS = [
  { label: "Recebido", icon: ShoppingBag, status: "pending" },
  { label: "Aceito", icon: Store, status: "preparing" },
  { label: "Em rota", icon: Bike, status: "delivering" },
  { label: "Concluído", icon: Check, status: "done" },
] as const;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function OrderTrackingClient({ orderId, token }: Props) {
  const [order, setOrder] = useState<OrderTrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestInFlight = useRef(false);

  const loadOrder = useCallback(async (background = false) => {
    if (requestInFlight.current) return;
    if (!token) {
      setError("Este link de acompanhamento está incompleto.");
      setLoading(false);
      return;
    }

    requestInFlight.current = true;
    if (background) setRefreshing(true);
    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/tracking?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(response.status === 404 ? "not-found" : "unavailable");
      const result = (await response.json()) as OrderTrackingResponse;
      setOrder(result);
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message === "not-found"
          ? "Não encontramos esse pedido. Confira se o link está completo."
          : "A atualização demorou mais que o esperado. Tente novamente em instantes.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
      requestInFlight.current = false;
    }
  }, [orderId, token]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    if (!order || !isOrderInProgress(order.status)) return;
    const timer = window.setInterval(() => void loadOrder(true), 10_000);
    return () => window.clearInterval(timer);
  }, [loadOrder, order]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const statusDetails = order ? ORDER_STATUS_DETAILS[order.status] : null;
  const delayedConfirmation = Boolean(
    order?.status === "pending" && now - new Date(order.createdAt).getTime() >= 5 * 60_000,
  );
  const payment = order
    ? paymentMethodDetails[order.paymentMethod as StorefrontPaymentMethod]
    : null;
  const primaryColor = order?.restaurant.primaryColor || "#ff5a1f";
  const buttonTextColor = getContrastTextColor(primaryColor);
  const whatsappUrl = useMemo(() => {
    if (!order?.restaurant.phone) return "";
    const phone = order.restaurant.phone.replace(/\D/g, "");
    const message = `Olá! Gostaria de falar sobre o pedido #${order.displayNumber}.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }, [order]);
  const statusTimeByName = useMemo(() => {
    const entries = order?.statusHistory || [];
    return new Map(entries.map((entry) => [entry.status, entry.changedAt]));
  }, [order]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar o link neste navegador.");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen animate-pulse bg-[#f5f6f7] px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-gray-200 bg-white">
          <div className="h-44 bg-gray-100" />
          <div className="space-y-5 p-5 sm:p-8">
            <div className="h-20 rounded-2xl bg-gray-100" />
            <div className="h-40 rounded-2xl bg-gray-100" />
          </div>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f6f7] px-4 py-10">
        <section className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-7 text-center sm:p-10">
          <AlertCircle className="mx-auto text-rose-500" size={44} />
          <h1 className="mt-5 text-2xl font-black text-gray-950">Pedido não encontrado</h1>
          <p className="mt-3 leading-7 text-gray-600">{error}</p>
          <button
            type="button"
            onClick={() => void loadOrder()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-3 font-bold text-gray-800"
          >
            <RefreshCw size={18} /> Tentar novamente
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f6f7] px-3 py-4 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_20px_50px_rgba(17,24,39,0.07)]">
        <header className="px-5 py-7 text-center sm:px-8 sm:py-9" style={{ backgroundColor: `${primaryColor}12` }}>
          <p className="text-sm font-bold text-gray-600">{order.restaurant.name}</p>
          <p className="mt-5 text-xs font-black uppercase text-gray-500">Pedido</p>
          <h1 className="mt-1 text-5xl font-black text-gray-950">#{order.displayNumber}</h1>
          <div
            className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black"
            style={{ backgroundColor: primaryColor, color: buttonTextColor }}
          >
            {order.status === "canceled" ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
            {statusDetails?.label}
          </div>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-gray-600">{statusDetails?.message}</p>
        </header>

        <div className="space-y-7 p-5 sm:p-8">
          {error && (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 shrink-0" size={18} />
              <p>{error}</p>
            </div>
          )}

          {delayedConfirmation && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-black text-amber-950">A loja ainda está analisando seu pedido</p>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                Seu pedido está registrado com segurança. Você pode atualizar o status ou falar com a loja.
              </p>
            </div>
          )}

          {order.status === "canceled" && (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4" aria-label="Informações do cancelamento">
              <p className="font-black text-rose-950">Pedido cancelado</p>
              <p className="mt-2 text-sm leading-6 text-rose-900">
                <strong>Motivo:</strong> {order.cancellationReason || "A loja não informou um motivo específico."}
              </p>
              <p className="mt-2 text-sm leading-6 text-rose-800">
                Se precisar de ajuda ou quiser refazer o pedido, fale diretamente com a loja pelos canais abaixo.
              </p>
            </section>
          )}

          {order.status !== "canceled" && (
            <section aria-label="Etapas do pedido">
              <div className="grid grid-cols-4 gap-1">
                {TRACKING_STEPS.map((step, index) => {
                  const Icon = step.icon;
                  const currentStep = statusDetails?.step ?? 0;
                  const isComplete = index < currentStep;
                  const isCurrent = index === currentStep;
                  const changedAt = statusTimeByName.get(step.status);
                  return (
                    <div key={step.label} className="min-w-0 text-center">
                      <div
                        className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border ${isComplete ? "border-emerald-600 bg-emerald-600 text-white" : ""}`}
                        style={isCurrent
                          ? { backgroundColor: primaryColor, borderColor: primaryColor, color: buttonTextColor, boxShadow: `0 0 0 4px ${primaryColor}20` }
                          : !isComplete
                            ? { borderColor: "#d1d5db", color: "#9ca3af" }
                            : undefined}
                      >
                        {isComplete ? <Check size={18} strokeWidth={3} /> : <Icon size={18} />}
                      </div>
                      <p className={`mt-2 text-[11px] font-bold sm:text-xs ${isCurrent ? "text-gray-950" : isComplete ? "text-emerald-700" : "text-gray-400"}`}>
                        {step.label}
                      </p>
                      {changedAt && (
                        <time dateTime={changedAt} className="mt-1 block text-[9px] font-medium text-gray-500 sm:text-[10px]">
                          {formatDateTime(changedAt)}
                        </time>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="border-t border-gray-200 pt-6">
            <div className="flex items-center gap-2">
              <ReceiptText size={20} style={{ color: primaryColor }} />
              <h2 className="text-lg font-black text-gray-950">Resumo do pedido</h2>
            </div>
            <div className="mt-4 divide-y divide-gray-100">
              {order.items.map((item, index) => (
                <div key={`${item.productName}-${index}`} className="flex gap-4 py-3 first:pt-0">
                  <span className="font-black text-gray-900">{item.quantity}x</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900">{item.productName}</p>
                    {item.addons.length > 0 && (
                      <p className="mt-1 text-sm text-gray-500">{item.addons.map((addon) => addon.name).join(", ")}</p>
                    )}
                    {item.observation && <p className="mt-1 text-sm text-gray-500">Obs.: {item.observation}</p>}
                  </div>
                  <span className="shrink-0 font-bold text-gray-900">{formatMoney(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2 border-t border-gray-200 pt-4 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatMoney(order.subtotal)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Entrega</span><span>{formatMoney(order.deliveryFee)}</span></div>
              {order.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Desconto</span><span>-{formatMoney(order.discount)}</span></div>}
              <div className="flex justify-between pt-1 text-lg font-black text-gray-950"><span>Total</span><span>{formatMoney(order.total)}</span></div>
            </div>
          </section>

          <section className="grid gap-5 border-t border-gray-200 pt-6 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 text-gray-950"><MapPin size={19} style={{ color: primaryColor }} /><h2 className="font-black">Entrega</h2></div>
              <p className="mt-3 text-sm font-bold leading-6 text-gray-800">
                {order.address.street}, {order.address.number}{order.address.complement ? `, ${order.address.complement}` : ""}
              </p>
              <p className="text-sm text-gray-500">{order.address.neighborhood} - {order.address.city}/{order.address.state}</p>
              <p className="mt-2 text-sm font-bold" style={{ color: primaryColor }}>
                {order.scheduledFor
                  ? `Agendado para ${formatDateTime(order.scheduledFor)}`
                  : order.deliveryTime > 0
                    ? `Previsão aproximada: ${order.deliveryTime} min`
                    : "Previsão confirmada pela loja durante o preparo"}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-gray-950"><Clock3 size={19} style={{ color: primaryColor }} /><h2 className="font-black">Pagamento</h2></div>
              <p className="mt-3 text-sm font-bold text-gray-800">{payment?.label || order.paymentMethod}</p>
              <p className="mt-1 text-sm text-gray-500">{payment?.timing || "Forma de pagamento informada no pedido"}</p>
              {order.changeFor && <p className="mt-2 text-sm font-bold text-gray-700">Troco para {formatMoney(Number(order.changeFor))}</p>}
            </div>
          </section>

          <footer className="border-t border-gray-200 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void loadOrder(true)}
                disabled={refreshing}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-black disabled:opacity-60"
                style={{ backgroundColor: primaryColor, color: buttonTextColor }}
              >
                <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Atualizando..." : "Atualizar status"}
              </button>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 font-bold text-gray-800"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? "Link copiado" : "Copiar acompanhamento"}
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 font-bold text-gray-800"
                >
                  <MessageCircle size={18} /> Falar com a loja
                </a>
              )}
              <Link
                href={`/${order.restaurant.slug}`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 font-bold text-gray-800"
              >
                <Store size={18} /> Voltar ao cardápio
              </Link>
            </div>
            <p className="mt-5 text-center text-xs text-gray-400">
              Pedido criado em {formatDateTime(order.createdAt)} · Última mudança em {formatDateTime(order.updatedAt)}
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
