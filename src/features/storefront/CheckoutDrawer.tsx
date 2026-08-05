"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, Banknote, Check, CheckCircle2, ChevronDown, ChevronLeft, CreditCard, Loader2, MapPin, Minus, Pencil, Plus, QrCode, ShoppingBag, Ticket, Trash2 } from "lucide-react";
import { formatMoney, getContrastTextColor } from "./format";
import { DeliveryCalculator } from "./DeliveryCalculator";
import type { CartItem, CheckoutAddress, CheckoutStep, DeliveryInfo, FulfillmentType, OrderResponse } from "./types";
import type { StoreStatus } from "./store-summary";
import {
  formatCurrencyInput,
  formatPhone,
  getCheckoutAddressErrors,
  getChangeForError,
  isValidPhone,
  paymentMethodDetails,
  type StorefrontPaymentMethod,
} from "./checkout-format";
import { useAccessibleDialog } from "./use-accessible-dialog";
import { useStorefrontPaymentMethods } from "./use-payment-methods";

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
  paymentMethod: StorefrontPaymentMethod | "";
  changeFor: string;
  cashNeedsChange: boolean;
  checkoutError: string;
  completedOrder: OrderResponse | null;
  couponError: string;
  isSubmitting: boolean;
  storeStatus: StoreStatus;
  minimumOrderAmount: number;
  scheduledOrdersEnabled: boolean;
  pickupEnabled: boolean;
  fulfillmentType: FulfillmentType;
  pickupAddress: string;
  minimumScheduleValue: string;
  scheduledFor: string;
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
  onPaymentMethodChange: (value: StorefrontPaymentMethod | "") => void;
  onChangeForChange: (value: string) => void;
  onCashNeedsChange: (value: boolean) => void;
  onScheduledForChange: (value: string) => void;
  onFulfillmentTypeChange: (value: FulfillmentType) => void;
  onPlaceOrder: () => void;
  onTrackOrder: () => void;
  onFinishOrder: () => void;
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
  cashNeedsChange,
  checkoutError,
  completedOrder,
  couponError,
  isSubmitting,
  storeStatus,
  minimumOrderAmount,
  scheduledOrdersEnabled,
  pickupEnabled,
  fulfillmentType,
  pickupAddress,
  minimumScheduleValue,
  scheduledFor,
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
  onCashNeedsChange,
  onScheduledForChange,
  onFulfillmentTypeChange,
  onPlaceOrder,
  onTrackOrder,
  onFinishOrder,
}: CheckoutDrawerProps) {
  const [addressAttempted, setAddressAttempted] = useState(false);
  const [paymentAttempted, setPaymentAttempted] = useState(false);
  const [isCouponOpen, setIsCouponOpen] = useState(false);
  const { dialogRef, initialFocusRef } = useAccessibleDialog(isOpen, onClose);
  const { paymentMethods: availablePaymentMethods, loading: paymentMethodsLoading } =
    useStorefrontPaymentMethods();

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => initialFocusRef.current?.focus());
  }, [initialFocusRef, isOpen, step]);

  useEffect(() => {
    if (
      paymentMethod &&
      !paymentMethodsLoading &&
      !availablePaymentMethods.includes(paymentMethod)
    ) {
      onPaymentMethodChange("");
      onCashNeedsChange(false);
      onChangeForChange("");
    }
  }, [
    availablePaymentMethods,
    onCashNeedsChange,
    onChangeForChange,
    onPaymentMethodChange,
    paymentMethod,
    paymentMethodsLoading,
  ]);

  if (!isOpen) return null;
  const brandTextColor = getContrastTextColor(primaryColor);
  const cartQuantity = cart.reduce((total, item) => total + item.quantity, 0);
  const currentIndex = step === "cart" ? 0 : step === "address" ? 1 : step === "payment" ? 2 : 3;
  const isSuccess = step === "success" && Boolean(completedOrder);
  const missingMinimum = Math.max(0, minimumOrderAmount - cartSubtotal);
  const minimumReached = missingMinimum <= 0;
  const storeClosedWithoutScheduling = storeStatus.tone === "closed" && !scheduledOrdersEnabled;
  const scheduleRequired = storeStatus.tone === "closed" && scheduledOrdersEnabled;
  const scheduleMissing = scheduleRequired && !scheduledFor;
  const addressFieldErrors = getCheckoutAddressErrors(address);
  const isPickup = fulfillmentType === "pickup";
  const completedIsPickup = completedOrder?.fulfillmentType === "pickup";
  const deliveryReady = isPickup || Boolean(deliveryInfo?.valid && deliveryInfo.addressValidated);
  const addressErrors = {
    customerName: customerName.trim().length >= 2 ? "" : "Informe seu nome.",
    customerPhone: isValidPhone(customerPhone) ? "" : "Informe um celular válido com DDD.",
    ...(isPickup ? {} : addressFieldErrors),
    delivery: deliveryReady || deliveryInfo || deliveryError
      ? ""
      : "Calcule a taxa e o prazo da entrega antes de continuar.",
  };
  const hasAddressErrors = Object.values(addressErrors).some(Boolean) || !deliveryReady;
  const changeForError = paymentMethod === "cash" && cashNeedsChange
    ? getChangeForError(changeFor, finalTotal)
    : "";
  const paymentError = paymentMethodsLoading
    ? "Aguarde o carregamento das formas de pagamento."
    : !paymentMethod || !availablePaymentMethods.includes(paymentMethod)
      ? "Escolha uma forma de pagamento disponível."
      : "";
  const scheduleError = scheduleMissing ? "Escolha a data e o horário do pedido." : "";
  const hasPaymentErrors = Boolean(paymentError || changeForError || scheduleError);

  const continueToPayment = () => {
    setAddressAttempted(true);
    if (!hasAddressErrors) onStepChange("payment");
  };

  const submitOrder = () => {
    setPaymentAttempted(true);
    if (!hasPaymentErrors) onPlaceOrder();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f5f6f7]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-step-title"
        tabIndex={-1}
        className="mx-auto flex h-[100dvh] min-h-0 w-full max-w-2xl flex-col overflow-hidden overscroll-none"
      >
        <div className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]" role="status" aria-live="polite">
          Etapa atual: {step === "cart" ? "sacola" : step === "address" ? "entrega" : step === "payment" ? "pagamento" : "confirmação"}.
        </div>
        <header className="safe-area-top sticky top-0 z-10 border-b border-gray-200 bg-[#f5f6f7]/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="flex items-center gap-4">
            {isSuccess ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check size={20} strokeWidth={3} />
              </span>
            ) : (
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
            )}
            <div>
              <p className="text-[11px] font-bold uppercase text-gray-400">{isSuccess ? "Pedido recebido" : "Finalizar pedido"}</p>
              <h2 id="checkout-step-title" ref={initialFocusRef as React.RefObject<HTMLHeadingElement>} tabIndex={-1} className="text-xl font-black text-gray-950 outline-none sm:text-2xl">
                {step === "cart" ? "Sua sacola" : step === "address" ? "Entrega" : step === "payment" ? "Pagamento" : "Pedido confirmado"}
              </h2>
            </div>
          </div>
          <nav aria-label="Etapas do pedido" className="mt-3 flex w-full gap-1.5 sm:gap-2">
            {[
              { label: "Sacola", icon: ShoppingBag },
              { label: "Entrega", icon: MapPin },
              { label: "Pagamento", icon: CreditCard },
            ].map(({ label, icon: StepIcon }, index) => {
              const isComplete = index < currentIndex;
              const isCurrent = index === currentIndex;

              return (
                <div
                  key={label}
                  className={`min-w-0 flex-1 rounded-xl border px-2 py-2 transition-colors sm:px-3 ${
                    isCurrent
                      ? "bg-white shadow-[0_4px_14px_rgba(17,16,15,0.06)]"
                      : isComplete
                        ? "border-gray-200 bg-white/70"
                        : "border-transparent bg-black/[0.025]"
                  }`}
                  style={isCurrent ? { borderColor: primaryColor } : undefined}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        isCurrent ? "" : isComplete ? "bg-emerald-50 text-emerald-700" : "bg-white text-gray-400"
                      }`}
                      style={isCurrent ? { backgroundColor: `${primaryColor}18`, color: primaryColor } : undefined}
                    >
                      {isComplete ? <Check size={15} strokeWidth={3} /> : <StepIcon size={15} />}
                    </span>
                    <span className="min-w-0 text-left">
                      <strong className={`block truncate text-[11px] leading-tight sm:text-xs ${isCurrent ? "text-gray-950" : "text-gray-600"}`}>
                        {label}
                      </strong>
                      <small className={`mt-0.5 block truncate text-[9px] font-bold leading-tight sm:text-[10px] ${isCurrent ? "" : "text-gray-400"}`} style={isCurrent ? { color: primaryColor } : undefined}>
                        {isCurrent ? "Agora" : isComplete ? "Concluída" : "Próxima"}
                      </small>
                    </span>
                  </div>
                </div>
              );
            })}
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-6">
          {storeStatus.tone === "closing" && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-black">A loja fecha em breve</p>
              <p className="mt-1">Finalize o pedido agora para não perder o horário de atendimento.</p>
            </div>
          )}
          {storeClosedWithoutScheduling && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              <p className="font-black">Loja fechada no momento</p>
              <p className="mt-1">Sua sacola ficará salva para você concluir quando a loja abrir.</p>
            </div>
          )}
          {scheduleRequired && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-black">A loja está fechada agora</p>
              <p className="mt-1">Você pode continuar e escolher um horário de atendimento.</p>
            </div>
          )}
          {step === "cart" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-black text-gray-950">{cartQuantity} {cartQuantity === 1 ? "item" : "itens"} na sacola</p>
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
                      <Image src={item.product.image_url} alt="" width={80} height={80} sizes="80px" className="h-16 w-16 shrink-0 rounded-xl bg-[#f3ede5] object-contain p-1 sm:h-20 sm:w-20" />
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
                        <div className="mt-2 rounded-xl bg-[#faf8f5] px-3 py-2 text-xs text-gray-600 sm:text-sm">
                          <p className="mb-1 font-black text-gray-700">Complementos</p>
                          {item.selectedAddons.map((addon, addonIndex) => (
                            <p key={`${addon.groupId || "addon"}-${addon.name}-${addonIndex}`} className="flex justify-between gap-3 py-0.5">
                              <span>+ {addon.name}</span>
                              {Number(addon.price || 0) > 0 && <span>{formatMoney(Number(addon.price))}</span>}
                            </p>
                          ))}
                        </div>
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
              {pickupEnabled && (
                <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                  <h3 className="text-lg font-black text-gray-950">Como você quer receber?</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de recebimento">
                    {(["delivery", "pickup"] as FulfillmentType[]).map((value) => {
                      const selected = fulfillmentType === value;
                      const Icon = value === "delivery" ? MapPin : ShoppingBag;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => onFulfillmentTypeChange(value)}
                          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border bg-white px-3 text-sm font-black"
                          style={selected ? { borderColor: primaryColor, color: primaryColor, backgroundColor: `${primaryColor}0D` } : undefined}
                        >
                          <Icon size={17} /> {value === "delivery" ? "Entrega" : "Retirada"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <h3 className="text-lg font-black text-gray-950">Seus dados</h3>
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-bold text-gray-600">
                    Nome completo
                    <input
                      id="checkout-customer-name"
                      value={customerName}
                      onChange={(event) => onCustomerNameChange(event.target.value)}
                      placeholder="Como podemos chamar você?"
                      autoComplete="name"
                      aria-invalid={addressAttempted && Boolean(addressErrors.customerName)}
                      aria-describedby={addressAttempted && addressErrors.customerName ? "checkout-customer-name-error" : undefined}
                      className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none"
                    />
                    {addressAttempted && addressErrors.customerName && (
                      <span id="checkout-customer-name-error" role="alert" className="mt-1.5 block text-xs font-bold text-rose-600">{addressErrors.customerName}</span>
                    )}
                  </label>
                  <label className="block text-xs font-bold text-gray-600">
                    Celular com DDD
                    <input
                      id="checkout-customer-phone"
                      value={customerPhone}
                      onChange={(event) => onCustomerPhoneChange(formatPhone(event.target.value))}
                      placeholder="(11) 99999-9999"
                      inputMode="tel"
                      autoComplete="tel"
                      aria-invalid={addressAttempted && Boolean(addressErrors.customerPhone)}
                      aria-describedby={addressAttempted && addressErrors.customerPhone ? "checkout-customer-phone-error" : undefined}
                      className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none"
                    />
                    {addressAttempted && addressErrors.customerPhone && (
                      <span id="checkout-customer-phone-error" role="alert" className="mt-1.5 block text-xs font-bold text-rose-600">{addressErrors.customerPhone}</span>
                    )}
                  </label>
                </div>
              </div>

              {!isPickup ? <DeliveryCalculator
                primaryColor={primaryColor}
                savedAddresses={savedAddresses}
                usingSavedAddress={usingSavedAddress}
                address={address}
                deliveryInfo={deliveryInfo}
                calculatingFee={calculatingFee}
                hasAddressMinimum={hasAddressMinimum}
                deliveryError={deliveryError}
                fieldErrors={addressAttempted ? addressErrors : undefined}
                onAddressChange={onAddressChange}
                onBlurCep={onBlurCep}
                onCalculateDelivery={onCalculateDelivery}
                onRetryDelivery={onRetryDelivery}
                onSelectSavedAddress={onSelectSavedAddress}
                onUseAnotherAddress={onUseAnotherAddress}
              /> : (
                <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShoppingBag size={18} /></span>
                    <div>
                      <h3 className="font-black text-gray-950">Retirada na loja</h3>
                      <p className="mt-1 text-sm leading-5 text-gray-600">{pickupAddress || "O endereço será confirmado pela loja."}</p>
                      <p className="mt-2 text-xs font-bold text-emerald-700">Sem taxa de entrega</p>
                    </div>
                  </div>
                </div>
              )}
              {!isPickup && !usingSavedAddress && (
                <p className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm leading-6 text-gray-600">
                  <strong className="block text-gray-900">Seus dados serão lembrados</strong>
                  Nas próximas compras neste aparelho, nome, telefone e endereço serão preenchidos automaticamente.
                </p>
              )}
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-4">
              {scheduledOrdersEnabled && (
                <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                  <h3 className="text-lg font-black text-gray-950">
                    {scheduleRequired ? "Agendamento obrigatório" : "Agendar pedido"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {scheduleRequired
                      ? "Escolha uma data e um horário dentro do funcionamento da loja."
                      : "Opcional. Deixe em branco para pedir assim que possível."}
                  </p>
                  <label className="mt-4 block text-xs font-bold text-gray-600">
                    Data e horário
                    <input
                      type="datetime-local"
                      min={minimumScheduleValue}
                      value={scheduledFor}
                      onChange={(event) => onScheduledForChange(event.target.value)}
                      className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none"
                    />
                    {paymentAttempted && scheduleError && (
                      <span className="mt-1.5 block text-xs font-bold text-rose-600">{scheduleError}</span>
                    )}
                  </label>
                  {scheduledFor && (
                    <button
                      type="button"
                      onClick={() => onScheduledForChange("")}
                      className="mt-3 text-sm font-bold text-gray-500"
                    >
                      Remover agendamento
                    </button>
                  )}
                </div>
              )}
              <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-gray-950">Revisão final</h3>
                  <button type="button" onClick={() => onStepChange("cart")} className="text-xs font-black" style={{ color: primaryColor }}>
                    Editar itens
                  </button>
                </div>
                <div className="mt-4 space-y-3 text-sm text-gray-600">
                  <div className="rounded-2xl bg-[#faf8f5] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-black text-gray-900">{isPickup ? "Retirada na loja" : "Entrega"}</p>
                      <button type="button" onClick={() => onStepChange("address")} className="text-xs font-black" style={{ color: primaryColor }}>
                        Editar
                      </button>
                    </div>
                    <p className="mt-2 font-bold text-gray-900">{customerName} · {customerPhone}</p>
                    {isPickup ? (
                      <p className="mt-1">{pickupAddress}</p>
                    ) : (
                      <>
                        <p className="mt-1">{address.street}, {address.number}{address.complement ? `, ${address.complement}` : ""}</p>
                        <p>{address.neighborhood} · {address.city}/{address.state}</p>
                      </>
                    )}
                    {!isPickup && deliveryInfo?.valid && (
                      <p className="mt-2 text-xs font-bold text-emerald-700">
                        {deliveryInfo.distance} km aproximadamente · previsão de {deliveryInfo.time} min
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl bg-[#faf8f5] p-3.5">
                    <p className="mb-2 font-black text-gray-900">Itens</p>
                    {cart.map((item) => (
                      <div key={item.internalId} className="flex justify-between gap-3 py-1">
                        <span>{item.quantity}x {item.product.name}</span>
                        <strong className="text-gray-900">{formatMoney(item.totalPrice)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl bg-[#faf8f5] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-gray-900">
                          {paymentMethod ? paymentMethodDetails[paymentMethod].label : "Forma de pagamento pendente"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {paymentMethod ? paymentMethodDetails[paymentMethod].timing : "Escolha uma forma abaixo para continuar."}
                        </p>
                        {paymentMethod === "cash" && cashNeedsChange && changeFor && (
                          <p className="mt-1 text-xs font-bold text-gray-700">Troco para {changeFor}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => document.getElementById("checkout-payment")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        className="text-xs font-black"
                        style={{ color: primaryColor }}
                      >
                        Alterar
                      </button>
                    </div>
                  </div>
                  <div className="border-t border-[var(--line)] pt-3">
                    <div className="flex justify-between py-1"><span>Subtotal</span><span>{formatMoney(cartSubtotal)}</span></div>
                    <div className="flex justify-between py-1"><span>{isPickup ? "Retirada" : "Entrega"}</span><span>{isPickup ? "Grátis" : formatMoney(feeValue)}</span></div>
                    {discountAmount > 0 && <div className="flex justify-between py-1 font-bold text-emerald-600"><span>Desconto</span><span>- {formatMoney(discountAmount)}</span></div>}
                    <div className="mt-2 flex justify-between border-t border-[var(--line)] pt-3 text-lg font-black text-gray-950">
                      <span>Total</span><span>{formatMoney(finalTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <button
                  type="button"
                  onClick={() => setIsCouponOpen((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={isCouponOpen}
                  aria-controls="checkout-coupon-content"
                >
                  <span className="flex items-center gap-2">
                    <Ticket size={18} className="text-[var(--brand)]" />
                    <span className="text-base font-black text-gray-950">
                      {appliedCoupon ? `Cupom ${appliedCoupon.code} aplicado` : "Tenho um cupom"}
                    </span>
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-gray-400 transition-transform ${isCouponOpen ? "rotate-180" : ""}`} />
                </button>

                {(isCouponOpen || appliedCoupon) && <div id="checkout-coupon-content" className="mt-4 flex gap-2">
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
                </div>}

                {appliedCoupon && <p className="mt-3 text-sm font-bold text-emerald-600">Cupom aplicado com sucesso.</p>}
                {(isCouponOpen || appliedCoupon) && couponError && <p role="alert" className="mt-3 text-xs font-bold text-rose-600">{couponError}</p>}
              </div>

              <div id="checkout-payment" className="surface-card scroll-mt-4 rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <h3 className="text-lg font-black text-gray-950">Pagamento</h3>
                <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <p className="text-sm font-black text-blue-950">Pagamento {isPickup ? "na retirada" : "na entrega"}</p>
                  <p className="mt-1 text-xs leading-5 text-blue-800">As formas disponíveis são definidas pela loja e pagas diretamente no recebimento.</p>
                </div>
                <p className="mt-4 text-sm text-gray-500">Escolha como prefere pagar.</p>
                <div className="mt-4 space-y-3">
                  {paymentMethodsLoading ? (
                    <p role="status" className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-sm font-bold text-gray-600">
                      <Loader2 className="animate-spin" size={17} /> Carregando formas de pagamento...
                    </p>
                  ) : (
                    availablePaymentMethods.map((value) => {
                      const method = paymentMethodDetails[value];
                      const MethodIcon = value === "pix" ? QrCode : value === "cash" ? Banknote : CreditCard;
                      return (
                        <label
                          key={value}
                          className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-white px-4 py-4"
                          style={
                            paymentMethod === value
                              ? {
                                  borderColor: primaryColor,
                                  backgroundColor: `${primaryColor}10`,
                                }
                              : { borderColor: "var(--line)" }
                          }
                        >
                          <input
                            type="radio"
                            checked={paymentMethod === value}
                            onChange={() => onPaymentMethodChange(value)}
                            style={{ accentColor: primaryColor }}
                            className="mt-1"
                          />
                          <MethodIcon size={19} className="mt-0.5 shrink-0 text-gray-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-black text-gray-900">{method.label}</span>
                            <span className="mt-0.5 block text-xs leading-5 text-gray-500">{method.description}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-[#f4f0eb] px-2 py-1 text-[10px] font-black uppercase text-gray-600">
                            {isPickup ? "Na retirada" : "Na entrega"}
                          </span>
                        </label>
                      );
                    })
                  )}
                  {paymentAttempted && paymentError && (
                    <p role="alert" className="text-xs font-bold text-rose-600">{paymentError}</p>
                  )}

                  {paymentMethod === "cash" && availablePaymentMethods.includes("cash") && (
                    <div className="rounded-2xl border border-[var(--line)] bg-[#faf8f5] p-3.5">
                      <p className="text-sm font-black text-gray-900">Você precisa de troco?</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onCashNeedsChange(false)}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${!cashNeedsChange ? "border-gray-950 bg-gray-950 text-white" : "border-[var(--line)] bg-white text-gray-700"}`}
                        >
                          Não preciso
                        </button>
                        <button
                          type="button"
                          onClick={() => onCashNeedsChange(true)}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${cashNeedsChange ? "border-gray-950 bg-gray-950 text-white" : "border-[var(--line)] bg-white text-gray-700"}`}
                        >
                          Preciso de troco
                        </button>
                      </div>
                      {cashNeedsChange && (
                        <label className="mt-3 block text-xs font-bold text-gray-600">
                          Troco para quanto?
                          <input
                            value={changeFor}
                            onChange={(event) => onChangeForChange(formatCurrencyInput(event.target.value))}
                            placeholder="R$ 50,00"
                            inputMode="numeric"
                            aria-invalid={paymentAttempted && Boolean(changeForError)}
                            className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none"
                          />
                          {paymentAttempted && changeForError && (
                            <span role="alert" className="mt-1.5 block text-xs font-bold text-rose-600">{changeForError}</span>
                          )}
                        </label>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {checkoutError && (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                  {checkoutError}
                </div>
              )}
            </div>
          )}

          {isSuccess && completedOrder && (
            <div className="space-y-4" role="status" aria-live="polite">
              <section className="surface-card rounded-[24px] px-5 py-7 text-center sm:px-8 sm:py-9">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={34} strokeWidth={2.5} />
                </span>
                <p className="mt-5 text-sm font-bold text-emerald-700">Recebemos seu pedido</p>
                <h3 className="mt-1 text-3xl font-black text-gray-950">
                  Pedido #{completedOrder.displayNumber || completedOrder.orderId.slice(0, 8)}
                </h3>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-gray-500">
                  A loja já recebeu a solicitação. Você poderá acompanhar cada mudança de status mesmo sem depender do WhatsApp.
                </p>
              </section>

              <section className="surface-card rounded-[20px] p-4 sm:rounded-[24px] sm:p-5">
                <h3 className="text-lg font-black text-gray-950">Resumo do pedido</h3>
                <div className="mt-4 space-y-3 text-sm text-gray-600">
                  <div className="flex justify-between gap-4">
                    <span>Total</span>
                    <strong className="text-base text-gray-950">{formatMoney(completedOrder.total)}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Pagamento</span>
                    <strong className="text-right text-gray-950">
                      {paymentMethodDetails[completedOrder.paymentMethod as StorefrontPaymentMethod]?.label || completedOrder.paymentMethod}
                    </strong>
                  </div>
                  <div className="border-t border-[var(--line)] pt-3">
                    <p className="font-black text-gray-950">{completedIsPickup ? "Retirada na loja" : "Entrega"}</p>
                    <p className="mt-1">{completedOrder.address.street}, {completedOrder.address.number}{completedOrder.address.complement ? `, ${completedOrder.address.complement}` : ""}</p>
                    <p>{completedOrder.address.neighborhood} · {completedOrder.address.city}/{completedOrder.address.state}</p>
                    {completedIsPickup ? (
                      <p className="mt-2 text-xs font-bold text-emerald-700">Retire o pedido neste endereço. Não há taxa de entrega.</p>
                    ) : (
                      <p className="mt-2 text-xs font-bold text-emerald-700">Previsão aproximada: {completedOrder.deliveryTime} min</p>
                    )}
                  </div>
                </div>
              </section>

              <p className="px-3 text-center text-xs leading-5 text-gray-500">
                O acesso a este pedido foi salvo neste dispositivo para sua segurança.
              </p>
            </div>
          )}
        </div>

        <footer className="border-t border-[var(--line)] bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(17,16,15,0.06)] sm:px-6 sm:py-4">
          {step === "cart" && (
            <div>
              <div className="mb-3 flex items-end justify-between gap-4 px-1">
                <div>
                  <p className="text-[11px] font-bold uppercase text-gray-400">Subtotal</p>
                  <p className="text-xs text-gray-500">{pickupEnabled ? "Escolha entrega ou retirada na próxima etapa" : "Entrega calculada na próxima etapa"}</p>
                </div>
                <strong className="text-xl text-gray-950">{formatMoney(cartSubtotal)}</strong>
              </div>
              <button
                onClick={() => onStepChange("address")}
                disabled={cart.length === 0 || !minimumReached || storeClosedWithoutScheduling}
                className="w-full rounded-2xl px-5 py-3.5 text-sm font-black disabled:opacity-50 sm:py-4 sm:text-base"
                style={{ backgroundColor: primaryColor, color: brandTextColor }}
              >
                {storeClosedWithoutScheduling
                  ? "Loja fechada no momento"
                  : !minimumReached
                    ? `Adicione mais ${formatMoney(missingMinimum)}`
                    : pickupEnabled ? "Escolher recebimento" : "Continuar para entrega"}
              </button>
            </div>
          )}

          {step === "address" && (
            <div>
              {deliveryReady && (
                <div className="mb-3 px-1">
                  <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-1 text-xs">
                    <span className="text-gray-500">Valor dos produtos</span>
                    <strong className="text-right text-gray-950">{formatMoney(cartSubtotal)}</strong>
                    <span className="text-gray-500">{isPickup ? "Retirada" : "Frete"}</span>
                    <strong className="text-right text-gray-950">{isPickup ? "Grátis" : formatMoney(feeValue)}</strong>
                    {discountAmount > 0 && (
                      <>
                        <span className="text-emerald-700">Desconto</span>
                        <strong className="text-right text-emerald-700">- {formatMoney(discountAmount)}</strong>
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-4 border-t border-[var(--line)] pt-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase text-gray-400">Total do pedido</p>
                      <p className="truncate text-[11px] text-gray-500">{isPickup ? "Retirada no endereço da loja" : `Previsão de ${deliveryInfo?.time} min · ${deliveryInfo?.distance} km aprox.`}</p>
                    </div>
                    <strong className="shrink-0 text-xl text-gray-950">{formatMoney(finalTotal)}</strong>
                  </div>
                </div>
              )}
              {isPickup ? (
                <button
                  onClick={continueToPayment}
                  className="w-full rounded-2xl px-5 py-3.5 text-sm font-black sm:py-4 sm:text-base"
                  style={{ backgroundColor: primaryColor, color: brandTextColor }}
                >
                  Ir para pagamento
                </button>
              ) : calculatingFee ? (
                <p role="status" className="py-2 text-center text-sm font-bold text-gray-600">Calculando entrega...</p>
              ) : deliveryInfo?.valid === false ? (
                <p role="alert" className="py-2 text-center text-sm font-bold text-rose-700">Endereço fora da área de entrega</p>
              ) : !deliveryInfo?.addressValidated ? (
                <p className="py-2 text-center text-xs font-semibold text-gray-500">
                  Preencha o endereço e use “Calcular taxa e prazo” acima.
                </p>
              ) : (
                <button
                  onClick={continueToPayment}
                  className="w-full rounded-2xl px-5 py-3.5 text-sm font-black sm:py-4 sm:text-base"
                  style={{ backgroundColor: primaryColor, color: brandTextColor }}
                >
                  Ir para pagamento
                </button>
              )}
            </div>
          )}

          {step === "payment" && (
            <div>
              <div className="mb-3 flex items-end justify-between gap-4 px-1">
                <div>
                  <p className="text-[11px] font-bold uppercase text-gray-400">Total do pedido</p>
                  <p className="text-xs text-gray-500">{isPickup ? "Retirada sem taxa" : "Itens e entrega incluídos"}</p>
                </div>
                <strong className="text-xl text-gray-950">{formatMoney(finalTotal)}</strong>
              </div>
              <button
                onClick={submitOrder}
                disabled={isSubmitting || paymentMethodsLoading || !minimumReached || storeClosedWithoutScheduling}
                className="w-full rounded-2xl px-5 py-3.5 text-sm font-black disabled:opacity-60 sm:py-4 sm:text-base"
                style={{ backgroundColor: primaryColor, color: brandTextColor }}
              >
                {isSubmitting
                  ? "Enviando pedido..."
                  : paymentMethodsLoading
                    ? "Carregando pagamentos..."
                    : scheduleMissing
                      ? "Escolha o horário do pedido"
                      : "Confirmar pedido"}
              </button>
            </div>
          )}

          {isSuccess && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={onTrackOrder}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-black sm:py-4 sm:text-base"
                style={{ backgroundColor: primaryColor, color: brandTextColor }}
              >
                Acompanhar pedido <ArrowRight size={18} />
              </button>
              <button type="button" onClick={onFinishOrder} className="w-full py-2 text-sm font-bold text-gray-500">
                Voltar ao cardápio
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
