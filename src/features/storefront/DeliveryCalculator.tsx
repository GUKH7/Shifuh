"use client";

import { Check, Info, Loader2, MapPin, Search } from "lucide-react";
import { formatMoney } from "./format";
import type { CheckoutAddress, DeliveryInfo } from "./types";
import { formatCep, isCompleteCheckoutAddress } from "./checkout-format";

type DeliveryCalculatorProps = {
  primaryColor: string;
  savedAddresses: any[];
  usingSavedAddress: boolean;
  address: CheckoutAddress;
  deliveryInfo: DeliveryInfo | null;
  calculatingFee: boolean;
  hasAddressMinimum: boolean;
  deliveryError: string;
  fieldErrors?: Partial<Record<keyof CheckoutAddress | "delivery", string>>;
  onAddressChange: (address: CheckoutAddress) => void;
  onBlurCep: () => void;
  onCalculateDelivery: (address: CheckoutAddress) => void;
  onSelectSavedAddress: (address: any) => void;
  onUseAnotherAddress: () => void;
  onRetryDelivery: () => void;
};

export function DeliveryCalculator({
  primaryColor,
  savedAddresses,
  usingSavedAddress,
  address,
  deliveryInfo,
  calculatingFee,
  hasAddressMinimum,
  deliveryError,
  fieldErrors,
  onAddressChange,
  onBlurCep,
  onCalculateDelivery,
  onSelectSavedAddress,
  onUseAnotherAddress,
  onRetryDelivery,
}: DeliveryCalculatorProps) {
  const canCalculate = isCompleteCheckoutAddress(address);

  return (
    <div className="surface-card rounded-[24px] p-5">
      <div className="flex items-center gap-2">
        <MapPin size={18} style={{ color: primaryColor }} />
        <h3 className="text-lg font-black text-gray-950">Endereço de entrega</h3>
      </div>
      <p className="mt-2 text-sm leading-6 text-gray-500">
        Informe o endereço completo para consultar a taxa e o prazo antes do pagamento.
      </p>
      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-blue-50 px-3.5 py-3 text-xs leading-5 text-blue-800">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>A distância é aproximada e calculada em linha reta entre a loja e o endereço informado.</p>
      </div>

      {savedAddresses.length > 0 && (
        <div className="mt-4 space-y-2">
          {savedAddresses.map((savedAddr) => {
            const isSelected = usingSavedAddress && address.street === savedAddr.street;
            return (
              <button
                key={savedAddr.id}
                onClick={() => onSelectSavedAddress(savedAddr)}
                className="flex w-full items-center justify-between rounded-2xl border bg-white px-3 py-3.5 text-left sm:px-4 sm:py-4"
                style={
                  isSelected
                    ? {
                        borderColor: primaryColor,
                        backgroundColor: `${primaryColor}10`,
                      }
                    : { borderColor: "var(--line)" }
                }
              >
                <div>
                  <p className="font-bold text-gray-900">
                    {savedAddr.street}, {savedAddr.number}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {savedAddr.neighborhood} - {savedAddr.city}
                  </p>
                </div>
                {isSelected && <Check size={18} style={{ color: primaryColor }} />}
              </button>
            );
          })}

          <button onClick={onUseAnotherAddress} className="text-sm font-bold" style={{ color: primaryColor }}>
            Usar outro endereço
          </button>
        </div>
      )}

      {(!usingSavedAddress || savedAddresses.length === 0) && (
        <div className="mt-4 space-y-3">
          <div className="grid items-end gap-2.5 sm:grid-cols-[1fr_64px]">
            <label className="block text-xs font-bold text-gray-600">
              CEP
              <input
                value={address.cep}
                onChange={(event) => onAddressChange({ ...address, cep: formatCep(event.target.value) })}
                onBlur={onBlurCep}
                placeholder="00000-000"
                inputMode="numeric"
                autoComplete="postal-code"
                className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none"
              />
              {fieldErrors?.cep && <span className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.cep}</span>}
            </label>
            <div className="flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white">
              {calculatingFee ? (
                <Loader2 className="animate-spin text-[var(--brand)]" size={18} />
              ) : (
                <Search className="text-gray-400" size={18} />
              )}
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-[1fr_140px]">
            <label className="block text-xs font-bold text-gray-600">Rua
              <input value={address.street} onChange={(event) => onAddressChange({ ...address, street: event.target.value })} autoComplete="address-line1" className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none" />
              {fieldErrors?.street && <span className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.street}</span>}
            </label>
            <label className="block text-xs font-bold text-gray-600">Número
              <input value={address.number} onChange={(event) => onAddressChange({ ...address, number: event.target.value })} inputMode="text" className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none" />
              {fieldErrors?.number && <span className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.number}</span>}
            </label>
          </div>

          <label className="block text-xs font-bold text-gray-600">Bairro
            <input value={address.neighborhood} onChange={(event) => onAddressChange({ ...address, neighborhood: event.target.value })} autoComplete="address-level3" className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none" />
            {fieldErrors?.neighborhood && <span className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.neighborhood}</span>}
          </label>

          <div className="grid grid-cols-[1fr_88px] gap-2.5">
            <label className="block text-xs font-bold text-gray-600">Cidade
              <input value={address.city} onChange={(event) => onAddressChange({ ...address, city: event.target.value })} autoComplete="address-level2" className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none" />
              {fieldErrors?.city && <span className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.city}</span>}
            </label>
            <label className="block text-xs font-bold text-gray-600">UF
              <input value={address.state} onChange={(event) => onAddressChange({ ...address, state: event.target.value.toUpperCase().slice(0, 2) })} maxLength={2} autoComplete="address-level1" className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal uppercase text-gray-950 outline-none" />
              {fieldErrors?.state && <span className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.state}</span>}
            </label>
          </div>

          <label className="block text-xs font-bold text-gray-600">Complemento <span className="font-normal text-gray-400">(opcional)</span>
            <input value={address.complement} onChange={(event) => onAddressChange({ ...address, complement: event.target.value })} placeholder="Apartamento, bloco ou referência" autoComplete="address-line2" className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none" />
          </label>

          <button
            type="button"
            onClick={() => onCalculateDelivery(address)}
            disabled={calculatingFee || !canCalculate}
            className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
            style={{ backgroundColor: primaryColor }}
          >
            {calculatingFee ? <Loader2 className="animate-spin" size={17} /> : <Search size={17} />}
            {calculatingFee ? "Calculando entrega..." : canCalculate ? "Calcular taxa e prazo" : "Complete o endereço"}
          </button>
        </div>
      )}

      {fieldErrors?.delivery && !calculatingFee && (
        <p className="mt-3 text-xs font-bold text-rose-600">{fieldErrors.delivery}</p>
      )}

      {deliveryInfo && deliveryInfo.valid && deliveryInfo.addressValidated && (
        <div className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-black text-emerald-800">Taxa e prazo estimados</p>
              <p className="mt-1 text-sm text-emerald-700">{deliveryInfo.distance} km aproximadamente, em linha reta</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-emerald-800">
                {deliveryInfo.price === 0 ? "Grátis" : formatMoney(deliveryInfo.price)}
              </p>
              <p className="text-sm text-emerald-700">Previsão: {deliveryInfo.time} min</p>
            </div>
          </div>
        </div>
      )}

      {deliveryInfo && deliveryInfo.valid && !deliveryInfo.addressValidated && !calculatingFee && (
        <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-black text-amber-900">Estimativa pelo CEP</p>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                Aproximadamente {deliveryInfo.distance} km em linha reta. Complete o endereço para validar a entrega.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-black text-amber-900">
                {deliveryInfo.price === 0 ? "Grátis" : formatMoney(deliveryInfo.price)}
              </p>
              <p className="mt-1 text-sm text-amber-800">{deliveryInfo.time} min</p>
            </div>
          </div>
        </div>
      )}

      {deliveryInfo && !deliveryInfo.valid && !calculatingFee && (
        <div className="mt-4 rounded-[18px] border border-red-200 bg-red-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
          <p className="font-black text-red-800">
            {deliveryInfo.addressValidated ? "Endereço fora da área de entrega" : "CEP fora da área estimada"}
          </p>
          <p className="mt-1 text-sm leading-6 text-red-700">
            A distância aproximada em linha reta é de {deliveryInfo.distance} km, além do limite atendido pela loja.
            Confira os campos. Se estiverem corretos, este endereço realmente não é atendido.
          </p>
        </div>
      )}

      {hasAddressMinimum && !deliveryInfo && !calculatingFee && (
        <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
          <p className="font-black text-amber-800">Não localizamos este endereço</p>
          <p className="mt-1 text-sm leading-6 text-amber-700">
            {deliveryError || "Confira CEP, rua, número, cidade e UF. Seus dados foram mantidos para uma nova tentativa."}
          </p>
          <button onClick={onRetryDelivery} className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-black text-amber-900">
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
