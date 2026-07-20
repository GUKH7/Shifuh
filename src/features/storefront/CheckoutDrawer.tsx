"use client";

import { ChevronLeft, Loader2, Minus, Pencil, Plus, Ticket, Trash2 } from "lucide-react";
import { formatMoney, getContrastTextColor } from "./format";
import { DeliveryCalculator } from "./DeliveryCalculator";
import type { CartItem, CheckoutAddress, CheckoutStep, DeliveryInfo } from "./types";
import { formatPhone } from "./checkout-format";

type CheckoutDrawerProps = {
  isOpen: boolean;
  step: CheckoutStep;
  primaryColor: string;
  cart: CartItem[];
  cartSubtotal: number;
  customerName: string;
  customerPhone: string;
  savedAddresses: any[];
  usingSavedAddress: boolean;
  address: CheckoutAddress;
  calculatingFee: boolean;
  deliveryInfo: DeliveryInfo | null;
  hasAddressMinimum: boolean;
  deliveryError: string;
  couponCode: string;
  appliedCoupon: { code: string; value: number; type: string } | null;
  verifyingCoupon: boolean;
  discountAmount: number;
  feeValue: number;
  finalTotal: number;
  paymentMethod: string;
  changeFor: string;
  isSubmitting: boolean;
  saveAddress: boolean;
  canSaveAddress: boolean;
  onClose: () => void;
  onBackToCart: () => void;
  onBackToAddress: () => void;
  onStepChange: (step: CheckoutStep) => void;
  onRemoveFromCart: (id: string) => void;
  onCartItemQuantityChange: (id: string, quantity: number) => void;
  onEditCartItem: (item: CartItem) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onAddressChange: (address: CheckoutAddress) => void;
  onBlurCep: () => void;
  onCalculateDelivery: (address: CheckoutAddress) => void;
  onRetryDelivery: () => void;
  onSelectSavedAddress: (address: any) => void;
  onUseAnotherAddress: () => void;
  onCouponCodeChange: (value: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  onPaymentMethodChange: (value: string) => void;
  onChangeForChange: (value: string) => void;
  onSaveAddressChange: (value: boolean) => void;
  onPlaceOrder: () => void;
};

export function CheckoutDrawer({
  isOpen,
  step,
  primaryColor,
  cart,
  cartSubtotal,
  customerName,
  customerPhone,
  savedAddresses,
  usingSavedAddress,
  address,
  calculatingFee,
  deliveryInfo,
  hasAddressMinimum,
  deliveryError,
  couponCode,
  appliedCoupon,
  verifyingCoupon,
  discountAmount,
  feeValue,
  finalTotal,
  paymentMethod,
  changeFor,
  isSubmitting,
  saveAddress,
  canSaveAddress,
  onClose,
  onBackToCart,
  onBackToAddress,
  onStepChange,
  onRemoveFromCart,
  onCartItemQuantityChange,
  onEditCartItem,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onAddressChange,
  onBlurCep,
  onCalculateDelivery,
  onRetryDelivery,
  onSelectSavedAddress,
  onUseAnotherAddress,
  onCouponCodeChange,
  onApplyCoupon,
  onRemoveCoupon,
  onPaymentMethodChange,
  onChangeForChange,
  onSaveAddressChange,
  onPlaceOrder,
}: CheckoutDrawerProps) {
  if (!isOpen) return null;
  const brandTextColor = getContrastTextColor(primaryColor);
  const currentIndex = step === "cart" ? 0 : step === "address" ? 1 : 2;

  return (
    <div className="fixed inset-0 z-50 bg-[#f6f1ea]">
      <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col">
        <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[#faf5ef]/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (step === "cart") onClose();
                else if (step === "payment") onBackToAddress();
                else onBackToCart();
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white text-gray-700"
              aria-label={step === "cart" ? "Fechar sacola" : "Voltar para a etapa anterior"}
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <p className="text-[11px] font-bold uppercase text-gray-400">Finalizar pedido</p>
              <h2 className="text-xl font-black text-gray-950 sm:text-2xl">
                {step === "cart" ? "Sua sacola" : step === "address" ? "Entrega" : "Pagamento"}
              </h2>
            </div>
          </div>
          <nav aria-label="Etapas do pedido" className="mt-4 grid grid-cols-3 gap-2">
            {["Sacola", "Entrega", "Pagamento"].map((label, index) => {
              return (
                <div key={label} className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                      style={index <= currentIndex
                        ? { backgroundColor: primaryColor, color: brandTextColor }
                        : { backgroundColor: "#e5e7eb", color: "#6b7280" }}
                    >
                      {index + 1}
                    </span>
                    <span className={`truncate text-[11px] font-bold sm:text-xs ${index === currentIndex ? "text-gray-950" : "text-gray-500"}`}>
                      {label}
                    </span>
                  </div>
                  <div className={`mt-2 h-1 rounded-full ${index <= currentIndex ? "bg-[var(--brand)]" : "bg-gray-200"}`} />
                </div>
              );
            })}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
          {step === "cart" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-black text-gray-950">{cart.length} {cart.length === 1 ? "item" : "itens"} na sacola</p>
                <p className="text-sm font-black" style={{ color: primaryColor }}>{formatMoney(cartSubtotal)}</p>
              </div>
              {cart.length === 0 && (
                <div className="surface-card rounded-[16px] px-5 py-10 text-center">
                  <p className="text-base font-black text-gray-950">Sua sacola está vazia</p>
                  <p className="mt-1 text-sm text-gray-500">Volte ao cardápio para escolher seus itens.</p>
                </div>
              )}
              {cart.map((item) => (
                <article key={item.internalId} className="surface-card rounded-[16px] p-3.5 sm:rounded-[20px] sm:p-5">
                  <div className="flex items-start gap-3">
                    {item.product.image_url && (
                      <img src={item.product.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-[15px] font-black leading-5 text-gray-950 sm:text-lg">{item.product.name}</p>
                          <p className="mt-1 text-base font-black" style={{ color: primaryColor }}>{formatMoney(item.totalPrice)}</p>
                        </div>
                        <button
                          onClick={() => onRemoveFromCart(item.internalId)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#faf5ef] text-gray-500 hover:text-rose-600"
                          aria-label={`Remover ${item.product.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {item.selectedAddons.length > 0 && (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500 sm:text-sm">
                          {item.selectedAddons.map((addon) => addon.name).join(", ")}
                        </p>
                      )}
                      {item.observation && <p className="mt-1 line-clamp-2 text-xs text-amber-700 sm:text-sm">Obs: {item.observation}</p>}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="inline-flex h-10 items-center rounded-xl border border-[var(--line)] bg-white">
                          <button onClick={() => onCartItemQuantityChange(item.internalId, item.quantity - 1)} className="flex h-10 w-10 items-center justify-center text-gray-500" aria-label={`Diminuir ${item.product.name}`}><Minus size={15} /></button>
                          <span className="min-w-7 text-center text-sm font-black">{item.quantity}</span>
                          <button onClick={() => onCartItemQuantityChange(item.internalId, item.quantity + 1)} className="flex h-10 w-10 items-center justify-center" style={{ color: primaryColor }} aria-label={`Aumentar ${item.product.name}`}><Plus size={15} /></button>
                        </div>
                        <button onClick={() => onEditCartItem(item)} className="inline-flex h-10 items-center gap-1.5 px-2 text-sm font-bold" style={{ color: primaryColor }}>
                          <Pencil size={14} /> Editar
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {step === "address" && (
            <div className="space-y-4">
              <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <h3 className="text-lg font-black text-gray-950">Seus dados</h3>
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-bold text-gray-600">
                    Nome completo
                    <input
                      value={customerName}
                      onChange={(event) => onCustomerNameChange(event.target.value)}
                      placeholder="Como podemos chamar você?"
                      autoComplete="name"
                      className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none"
                    />
                  </label>
                  <label className="block text-xs font-bold text-gray-600">
                    Celular com DDD
                    <input
                      value={customerPhone}
                      onChange={(event) => onCustomerPhoneChange(formatPhone(event.target.value))}
                      placeholder="(11) 99999-9999"
                      inputMode="tel"
                      autoComplete="tel"
                      className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none"
                    />
                  </label>
                </div>
              </div>

              <DeliveryCalculator
                primaryColor={primaryColor}
                savedAddresses={savedAddresses}
                usingSavedAddress={usingSavedAddress}
                address={address}
                deliveryInfo={deliveryInfo}
                calculatingFee={calculatingFee}
                hasAddressMinimum={hasAddressMinimum}
                deliveryError={deliveryError}
                onAddressChange={onAddressChange}
                onBlurCep={onBlurCep}
                onCalculateDelivery={onCalculateDelivery}
                onRetryDelivery={onRetryDelivery}
                onSelectSavedAddress={onSelectSavedAddress}
                onUseAnotherAddress={onUseAnotherAddress}
              />
              {canSaveAddress && !usingSavedAddress && (
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={saveAddress}
                    onChange={(event) => onSaveAddressChange(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                  />
                  <span>
                    <strong className="block text-gray-900">Salvar este endereço</strong>
                    Use somente nos próximos pedidos desta conta.
                  </span>
                </label>
              )}
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-4">
              <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <h3 className="text-lg font-black text-gray-950">Revisão final</h3>
                <div className="mt-4 space-y-3 text-sm text-gray-600">
                  <div>
                    <p className="font-bold text-gray-900">{customerName} · {customerPhone}</p>
                    <p className="mt-1">{address.street}, {address.number}{address.complement ? `, ${address.complement}` : ""}</p>
                    <p>{address.neighborhood} · {address.city}/{address.state}</p>
                  </div>
                  <div className="border-t border-[var(--line)] pt-3">
                    {cart.map((item) => (
                      <div key={item.internalId} className="flex justify-between gap-3 py-1">
                        <span>{item.quantity}x {item.product.name}</span>
                        <strong className="text-gray-900">{formatMoney(item.totalPrice)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <div className="flex items-center gap-2">
                  <Ticket size={18} className="text-[var(--brand)]" />
                  <h3 className="text-lg font-black text-gray-950">Cupom</h3>
                </div>

                <div className="mt-4 flex gap-2">
                  <input
                    value={couponCode}
                    onChange={(event) => onCouponCodeChange(event.target.value)}
                    placeholder="Código"
                    disabled={!!appliedCoupon}
                    className="flex-1 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold uppercase outline-none disabled:bg-[#faf5ef]"
                  />
                  {appliedCoupon ? (
                    <button onClick={onRemoveCoupon} className="rounded-2xl bg-red-100 px-4 py-3 text-sm font-bold text-red-600">
                      Remover
                    </button>
                  ) : (
                    <button
                      onClick={onApplyCoupon}
                      disabled={verifyingCoupon}
                      className="rounded-2xl bg-[#171311] px-4 py-3 text-sm font-bold text-white"
                    >
                      {verifyingCoupon ? <Loader2 className="animate-spin" size={16} /> : "Aplicar"}
                    </button>
                  )}
                </div>

                {appliedCoupon && <p className="mt-3 text-sm font-bold text-emerald-600">Cupom aplicado com sucesso.</p>}
              </div>

              <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <h3 className="text-lg font-black text-gray-950">Resumo</h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{formatMoney(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Entrega</span>
                    <span>{formatMoney(feeValue)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between font-bold text-emerald-600">
                      <span>Desconto</span>
                      <span>- {formatMoney(discountAmount)}</span>
                    </div>
                  )}
                  <div className="border-t border-[var(--line)] pt-3">
                    <div className="flex justify-between text-xl font-black text-gray-950">
                      <span>Total</span>
                      <span>{formatMoney(finalTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <h3 className="text-lg font-black text-gray-950">Pagamento</h3>
                <div className="mt-4 space-y-3">
                  {[
                    { value: "pix", label: "PIX" },
                    { value: "card", label: "Cartão" },
                    { value: "cash", label: "Dinheiro" },
                  ].map((method) => (
                    <label
                      key={method.value}
                      className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-4"
                      style={
                        paymentMethod === method.value
                          ? {
                              borderColor: primaryColor,
                              backgroundColor: `${primaryColor}10`,
                            }
                          : { borderColor: "var(--line)" }
                      }
                    >
                      <input
                        type="radio"
                        checked={paymentMethod === method.value}
                        onChange={() => onPaymentMethodChange(method.value)}
                        style={{ accentColor: primaryColor }}
                      />
                      <span className="font-bold text-gray-900">{method.label}</span>
                    </label>
                  ))}

                  {paymentMethod === "cash" && (
                    <input
                      value={changeFor}
                      onChange={(event) => onChangeForChange(event.target.value)}
                      placeholder="Troco para quanto?"
                      className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="border-t border-[var(--line)] bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(17,16,15,0.06)] sm:px-6 sm:py-4">
          {step === "cart" && (
            <div>
              <div className="mb-3 flex items-end justify-between gap-4 px-1">
                <div>
                  <p className="text-[11px] font-bold uppercase text-gray-400">Subtotal</p>
                  <p className="text-xs text-gray-500">Entrega calculada na próxima etapa</p>
                </div>
                <strong className="text-xl text-gray-950">{formatMoney(cartSubtotal)}</strong>
              </div>
              <button
                onClick={() => onStepChange("address")}
                disabled={cart.length === 0}
                className="w-full rounded-2xl px-5 py-3.5 text-sm font-black disabled:opacity-50 sm:py-4 sm:text-base"
                style={{ backgroundColor: primaryColor, color: brandTextColor }}
              >
                Continuar para entrega
              </button>
            </div>
          )}

          {step === "address" && (
            <button
              onClick={() => onStepChange("payment")}
              disabled={
                !hasAddressMinimum ||
                calculatingFee ||
                !deliveryInfo?.valid ||
                !deliveryInfo.addressValidated
              }
              className="w-full rounded-2xl px-5 py-3.5 text-sm font-black disabled:opacity-50 sm:py-4 sm:text-base"
              style={{ backgroundColor: primaryColor, color: brandTextColor }}
            >
              {calculatingFee
                ? "Calculando entrega..."
                : !deliveryInfo?.addressValidated
                  ? "Valide o endereço para continuar"
                  : "Ir para pagamento"}
            </button>
          )}

          {step === "payment" && (
            <button
              onClick={onPlaceOrder}
              disabled={isSubmitting}
              className="w-full rounded-2xl px-5 py-3.5 text-sm font-black disabled:opacity-60 sm:py-4 sm:text-base"
              style={{ backgroundColor: primaryColor, color: brandTextColor }}
            >
              {isSubmitting ? "Enviando pedido..." : `Confirmar pedido (${formatMoney(finalTotal)})`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
