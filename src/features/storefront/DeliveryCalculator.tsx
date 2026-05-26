"use client";

import { Check, Loader2, MapPin, Search } from "lucide-react";
import { formatMoney } from "./format";
import type { CheckoutAddress, DeliveryInfo } from "./types";

type DeliveryCalculatorProps = {
  primaryColor: string;
  savedAddresses: any[];
  usingSavedAddress: boolean;
  address: CheckoutAddress;
  deliveryInfo: DeliveryInfo | null;
  calculatingFee: boolean;
  hasAddressMinimum: boolean;
  onAddressChange: (address: CheckoutAddress) => void;
  onBlurCep: () => void;
  onCalculateDelivery: (address: CheckoutAddress) => void;
  onSelectSavedAddress: (address: any) => void;
  onUseAnotherAddress: () => void;
};

export function DeliveryCalculator({
  primaryColor,
  savedAddresses,
  usingSavedAddress,
  address,
  deliveryInfo,
  calculatingFee,
  hasAddressMinimum,
  onAddressChange,
  onBlurCep,
  onCalculateDelivery,
  onSelectSavedAddress,
  onUseAnotherAddress,
}: DeliveryCalculatorProps) {
  return (
    <div className="surface-card rounded-[24px] p-5">
      <div className="flex items-center gap-2">
        <MapPin size={18} style={{ color: primaryColor }} />
        <h3 className="text-lg font-black text-gray-950">Endereço de entrega</h3>
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
          <div className="grid gap-2.5 sm:grid-cols-[1fr_64px]">
            <input
              value={address.cep}
              onChange={(event) => onAddressChange({ ...address, cep: event.target.value })}
              onBlur={onBlurCep}
              placeholder="CEP"
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
            />
            <div className="flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white">
              {calculatingFee ? (
                <Loader2 className="animate-spin text-[var(--brand)]" size={18} />
              ) : (
                <Search className="text-gray-400" size={18} />
              )}
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-[1fr_140px]">
            <input
              value={address.street}
              onChange={(event) => onAddressChange({ ...address, street: event.target.value })}
              onBlur={() => onCalculateDelivery(address)}
              placeholder="Rua"
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
            />
            <input
              value={address.number}
              onChange={(event) => onAddressChange({ ...address, number: event.target.value })}
              onBlur={() => onCalculateDelivery(address)}
              placeholder="Número"
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
            />
          </div>

          <input
            value={address.neighborhood}
            onChange={(event) => onAddressChange({ ...address, neighborhood: event.target.value })}
            onBlur={() => onCalculateDelivery(address)}
            placeholder="Bairro"
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
          />

          <input
            value={address.complement}
            onChange={(event) => onAddressChange({ ...address, complement: event.target.value })}
            placeholder="Complemento"
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
          />
        </div>
      )}

      {deliveryInfo && deliveryInfo.valid && (
        <div className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-black text-emerald-800">Entrega confirmada</p>
              <p className="mt-1 text-sm text-emerald-700">Distância: {deliveryInfo.distance} km</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-emerald-800">
                {deliveryInfo.price === 0 ? "Grátis" : formatMoney(deliveryInfo.price)}
              </p>
              <p className="text-sm text-emerald-700">{deliveryInfo.time} min</p>
            </div>
          </div>
        </div>
      )}

      {deliveryInfo && !deliveryInfo.valid && !calculatingFee && (
        <div className="mt-4 rounded-[18px] border border-red-200 bg-red-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
          <p className="font-black text-red-800">Endereço fora da área de entrega</p>
          <p className="mt-1 text-sm leading-6 text-red-700">
            A distancia calculada foi de {deliveryInfo.distance} km, acima da ultima faixa configurada pela loja.
          </p>
        </div>
      )}

      {hasAddressMinimum && !deliveryInfo && !calculatingFee && (
        <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 p-3.5 sm:mt-5 sm:rounded-[22px] sm:p-4">
          <p className="font-black text-amber-800">Entrega sem cálculo automático</p>
          <p className="mt-1 text-sm leading-6 text-amber-700">
            Não conseguimos calcular a distância agora. O pedido pode seguir e a loja confirma a taxa no atendimento.
          </p>
        </div>
      )}
    </div>
  );
}
