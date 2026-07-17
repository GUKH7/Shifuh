"use client";

import { ChevronLeft, Loader2, Ticket, X } from "lucide-react";
import { formatMoney } from "./format";
import { DeliveryCalculator } from "./DeliveryCalculator";
import type { CartItem, CheckoutAddress, CheckoutStep, DeliveryInfo } from "./types";

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
  couponCode: string;
  appliedCoupon: { code: string; value: number; type: string } | null;
  verifyingCoupon: boolean;
  discountAmount: number;
  feeValue: number;
  finalTotal: number;
  paymentMethod: string;
  changeFor: string;
  isSubmitting: boolean;
  onClose: () => void;
  onBackToCart: () => void;
  onBackToAddress: () => void;
  onStepChange: (step: CheckoutStep) => void;
  onRemoveFromCart: (id: string) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onAddressChange: (address: CheckoutAddress) => void;
  onBlurCep: () => void;
  onCalculateDelivery: (address: CheckoutAddress) => void;
  onSelectSavedAddress: (address: any) => void;
  onUseAnotherAddress: () => void;
  onCouponCodeChange: (value: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  onPaymentMethodChange: (value: string) => void;
  onChangeForChange: (value: string) => void;
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
  couponCode,
  appliedCoupon,
  verifyingCoupon,
  discountAmount,
  feeValue,
  finalTotal,
  paymentMethod,
  changeFor,
  isSubmitting,
  onClose,
  onBackToCart,
  onBackToAddress,
  onStepChange,
  onRemoveFromCart,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onAddressChange,
  onBlurCep,
  onCalculateDelivery,
  onSelectSavedAddress,
  onUseAnotherAddress,
  onCouponCodeChange,
  onApplyCoupon,
  onRemoveCoupon,
  onPaymentMethodChange,
  onChangeForChange,
  onPlaceOrder,
}: CheckoutDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#f6f1ea]">
      <div className="mx-auto flex h-full max-w-3xl flex-col">
        <div className="sticky top-0 z-10 border-b border-[var(--line)] bg-[#faf5ef]/95 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (step === "cart") onClose();
                else if (step === "payment") onBackToAddress();
                else onBackToCart();
              }}
              className="rounded-full bg-white p-2 text-gray-700"
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">Checkout</p>
              <h2 className="text-lg font-black text-gray-950 sm:text-xl">
                {step === "cart" ? "Sua sacola" : step === "address" ? "Entrega" : "Pagamento"}
              </h2>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
          {step === "cart" && (
            <div className="space-y-4">
              {cart.map((item) => (
                <div key={item.internalId} className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-400">{item.quantity}x item</p>
                      <p className="mt-1 text-base font-black text-gray-950 sm:text-lg">{item.product.name}</p>
                      {item.selectedAddons.length > 0 && (
                        <p className="mt-2 text-sm text-gray-500">
                          {item.selectedAddons.map((addon) => addon.name).join(", ")}
                        </p>
                      )}
                      {item.observation && <p className="mt-1 text-sm text-amber-700">Obs: {item.observation}</p>}
                      <p className="mt-2.5 text-base font-black sm:text-lg" style={{ color: primaryColor }}>
                        {formatMoney(item.totalPrice)}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemoveFromCart(item.internalId)}
                      className="rounded-xl bg-[#faf5ef] p-2 text-gray-400"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ))}

              <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold uppercase tracking-[0.14em] text-gray-400">Subtotal</span>
                  <span className="text-2xl font-black text-gray-950">{formatMoney(cartSubtotal)}</span>
                </div>
                <p className="mt-3 border-t border-[var(--line)] pt-3 text-sm leading-6 text-gray-500">
                  A taxa de entrega será calculada pelo endereço na próxima etapa.
                </p>
              </div>
            </div>
          )}

          {step === "address" && (
            <div className="space-y-4">
              <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <h3 className="text-lg font-black text-gray-950">Seus dados</h3>
                <div className="mt-4 space-y-3">
                  <input
                    value={customerName}
                    onChange={(event) => onCustomerNameChange(event.target.value)}
                    placeholder="Nome completo"
                    className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                  />
                  <input
                    value={customerPhone}
                    onChange={(event) => onCustomerPhoneChange(event.target.value)}
                    placeholder="WhatsApp"
                    className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
                  />
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
                onAddressChange={onAddressChange}
                onBlurCep={onBlurCep}
                onCalculateDelivery={onCalculateDelivery}
                onSelectSavedAddress={onSelectSavedAddress}
                onUseAnotherAddress={onUseAnotherAddress}
              />
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-4">
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

        <div className="border-t border-[var(--line)] bg-white px-3 py-3 sm:px-6 sm:py-4">
          {step === "cart" && (
            <button
              onClick={() => onStepChange("address")}
              className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white sm:py-4 sm:text-base"
              style={{ backgroundColor: primaryColor }}
            >
              Continuar
            </button>
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
              className="w-full rounded-2xl px-5 py-3.5 text-sm font-black text-white disabled:opacity-50 sm:py-4 sm:text-base"
              style={{ backgroundColor: primaryColor }}
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
              className="w-full rounded-2xl bg-[#25D366] px-5 py-3.5 text-sm font-black text-white disabled:opacity-60 sm:py-4 sm:text-base"
            >
              {isSubmitting ? "Enviando pedido..." : `Finalizar pedido (${formatMoney(finalTotal)})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
