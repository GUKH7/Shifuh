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
  const handleCepChange = (value: string) => {
    const cep = formatCep(value);
    const cepChanged = cep !== address.cep;

    onAddressChange({
      ...address,
      cep,
      ...(cepChanged
        ? {
            street: "",
            neighborhood: "",
            city: "",
            state: "",
          }
        : {}),
    });
  };

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
          {savedAddresses.map((savedAddr, index) => {
            const isSelected = usingSavedAddress && address.street === savedAddr.street && address.number === savedAddr.number;
            const savedLabel = savedAddr.label && savedAddr.label !== "Endereço"
              ? savedAddr.label
              : savedAddr.complement || `Endereço ${index + 1}`;
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
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase text-gray-500">{savedLabel}</p>
                  <p className="mt-1 truncate font-bold text-gray-900">
                    {savedAddr.street}, {savedAddr.number}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {savedAddr.neighborhood} - {savedAddr.city}/{savedAddr.state}
                  </p>
                  {savedAddr.complement && savedAddr.complement !== savedLabel && (
                    <p className="mt-1 text-xs font-medium text-gray-500">{savedAddr.complement}</p>
                  )}
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
          <div className="grid items-end gap-2.5 sm:grid-cols-[1fr_auto]">
            <label className="block text-xs font-bold text-gray-600">
              CEP
              <input
                id="delivery-cep"
                value={address.cep}
                onChange={(event) => handleCepChange(event.target.value)}
                placeholder="00000-000"
                inputMode="numeric"
                autoComplete="postal-code"
                aria-invalid={Boolean(fieldErrors?.cep)}
                aria-describedby={fieldErrors?.cep ? "delivery-cep-error" : undefined}
                className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none"
              />
              {fieldErrors?.cep && <span id="delivery-cep-error" role="alert" className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.cep}</span>}
            </label>
            <button
              type="button"
              onClick={onBlurCep}
              disabled={calculatingFee || address.cep.replace(/\D/g, "").length !== 8}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-black text-gray-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {calculatingFee ? (
                <Loader2 className="animate-spin text-[var(--brand)]" size={18} />
              ) : (
                <Search className="text-gray-400" size={18} />
              )}
              Buscar CEP
            </button>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-[1fr_140px]">
            <label className="block text-xs font-bold text-gray-600">Rua
              <input id="delivery-street" value={address.street} onChange={(event) => onAddressChange({ ...address, street: event.target.value })} autoComplete="address-line1" aria-invalid={Boolean(fieldErrors?.street)} aria-describedby={fieldErrors?.street ? "delivery-street-error" : undefined} className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none" />
              {fieldErrors?.street && <span id="delivery-street-error" role="alert" className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.street}</span>}
            </label>
            <label className="block text-xs font-bold text-gray-600">Número
              <input id="delivery-number" value={address.number === "S/N" ? "" : address.number} onChange={(event) => onAddressChange({ ...address, number: event.target.value })} disabled={address.number === "S/N"} inputMode="text" aria-invalid={Boolean(fieldErrors?.number)} aria-describedby={fieldErrors?.number ? "delivery-number-error" : undefined} placeholder={address.number === "S/N" ? "Sem número" : undefined} className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none disabled:bg-gray-50 disabled:text-gray-500" />
              <span className="mt-2 flex items-center gap-2 font-medium text-gray-500">
                <input
                  type="checkbox"
                  checked={address.number === "S/N"}
                  onChange={(event) => onAddressChange({ ...address, number: event.target.checked ? "S/N" : "" })}
                  className="h-4 w-4"
                  style={{ accentColor: primaryColor }}
                />
                Sem número
              </span>
              {fieldErrors?.number && <span id="delivery-number-error" role="alert" className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.number}</span>}
            </label>
          </div>

          <label className="block text-xs font-bold text-gray-600">Bairro
            <input id="delivery-neighborhood" value={address.neighborhood} onChange={(event) => onAddressChange({ ...address, neighborhood: event.target.value })} autoComplete="address-level3" aria-invalid={Boolean(fieldErrors?.neighborhood)} aria-describedby={fieldErrors?.neighborhood ? "delivery-neighborhood-error" : undefined} className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none" />
            {fieldErrors?.neighborhood && <span id="delivery-neighborhood-error" role="alert" className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.neighborhood}</span>}
          </label>

          <div className="grid grid-cols-[1fr_88px] gap-2.5">
            <label className="block text-xs font-bold text-gray-600">Cidade
              <input id="delivery-city" value={address.city} onChange={(event) => onAddressChange({ ...address, city: event.target.value })} autoComplete="address-level2" aria-invalid={Boolean(fieldErrors?.city)} aria-describedby={fieldErrors?.city ? "delivery-city-error" : undefined} className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal text-gray-950 outline-none" />
              {fieldErrors?.city && <span id="delivery-city-error" role="alert" className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.city}</span>}
            </label>
            <label className="block text-xs font-bold text-gray-600">UF
              <input id="delivery-state" value={address.state} onChange={(event) => onAddressChange({ ...address, state: event.target.value.toUpperCase().slice(0, 2) })} maxLength={2} autoComplete="address-level1" aria-invalid={Boolean(fieldErrors?.state)} aria-describedby={fieldErrors?.state ? "delivery-state-error" : undefined} className="mt-1.5 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-normal uppercase text-gray-950 outline-none" />
              {fieldErrors?.state && <span id="delivery-state-error" role="alert" className="mt-1.5 block text-xs font-bold text-rose-600">{fieldErrors.state}</span>}
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
        <p role="alert" className="mt-3 text-xs font-bold text-rose-600">{fieldErrors.delivery}</p>
      )}

      {deliveryInfo && deliveryInfo.valid && deliveryInfo.addressValidated && (
        <div role="status" aria-live="polite" className="mt-4 min-w-0 rounded-[18px] border border-emerald-200 bg-emerald-50 p-3 sm:mt-5 sm:rounded-[22px] sm:p-4">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-black leading-5 text-emerald-800 sm:text-base">Taxa e prazo estimados</p>
              <p className="mt-1 text-xs leading-4 text-emerald-700 sm:text-sm">
                <span className="sm:hidden">{deliveryInfo.distance} km em linha reta</span>
                <span className="hidden sm:inline">Distância aproximada: {deliveryInfo.distance} km</span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="whitespace-nowrap text-base font-black leading-5 text-emerald-800 sm:text-lg">
                {deliveryInfo.price === 0 ? "Grátis" : formatMoney(deliveryInfo.price)}
              </p>
              <p className="mt-1 whitespace-nowrap text-xs leading-4 text-emerald-700 sm:text-sm">
                <span className="sm:hidden">{deliveryInfo.time} min</span>
                <span className="hidden sm:inline">Previsão: {deliveryInfo.time} min</span>
              </p>
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
                Aproximadamente {deliveryInfo.distance} km. Complete o endereço para validar a entrega.
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
        <div role="alert" className="mt-4 rounded-[18px] border border-red-200 bg-red-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
          <p className="font-black text-red-800">
            {deliveryInfo.addressValidated ? "Endereço fora da área de entrega" : "CEP fora da área estimada"}
          </p>
          <p className="mt-1 text-sm leading-6 text-red-700">
            A distância aproximada é de {deliveryInfo.distance} km, além do limite atendido pela loja.
            Confira os campos. Se estiverem corretos, este endereço realmente não é atendido.
          </p>
        </div>
      )}

      {hasAddressMinimum && !deliveryInfo && !calculatingFee && (
        <div role="alert" className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
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
