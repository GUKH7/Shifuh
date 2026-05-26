"use client";

import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { formatMoney } from "./format";
import type { Product } from "./types";

type ProductPickerProps = {
  product: Product | null;
  primaryColor: string;
  addonSelections: Record<string, any[]>;
  quantity: number;
  observation: string;
  onClose: () => void;
  onToggleAddon: (groupId: string, option: any, group: any) => void;
  onQuantityChange: (quantity: number) => void;
  onObservationChange: (value: string) => void;
  onAddToCart: () => void;
  calculateProductTotal: () => number;
};

export function ProductPicker({
  product,
  primaryColor,
  addonSelections,
  quantity,
  observation,
  onClose,
  onToggleAddon,
  onQuantityChange,
  onObservationChange,
  onAddToCart,
  calculateProductTotal,
}: ProductPickerProps) {
  if (!product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[32px] bg-[#fffdfa] sm:h-auto sm:max-h-[88vh] sm:rounded-[32px]">
        <div className="relative h-72 bg-[#efe7de]">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-full bg-white/92 p-2 text-gray-700 shadow-sm"
          >
            <X size={20} />
          </button>
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-300">
              <ShoppingBag size={42} />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-3xl font-black tracking-tight text-gray-950">{product.name}</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{product.description}</p>

          {product.addons?.map((group: any) => (
            <div key={group.id} className="mt-8">
              <div className="mb-3 flex items-center gap-3">
                <h3 className="text-lg font-black text-gray-950">{group.title}</h3>
                <span className="rounded-full bg-[#f3ede6] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">
                  {group.required ? "Obrigatório" : "Opcional"}
                </span>
              </div>

              <div className="space-y-3">
                {group.options.map((option: any, index: number) => (
                  <label
                    key={index}
                    className="flex cursor-pointer items-center justify-between rounded-2xl border bg-white px-4 py-4 transition-colors"
                    style={
                      addonSelections[group.id]?.some((item) => item.name === option.name)
                        ? {
                            borderColor: primaryColor,
                            backgroundColor: `${primaryColor}10`,
                          }
                        : { borderColor: "var(--line)" }
                    }
                  >
                    <div>
                      <p className="font-bold text-gray-900">{option.name}</p>
                      {option.price > 0 && (
                        <p className="mt-1 text-sm text-gray-500">+ {formatMoney(option.price)}</p>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={addonSelections[group.id]?.some((item) => item.name === option.name)}
                      onChange={() => onToggleAddon(group.id, option, group)}
                      className="h-5 w-5 accent-[var(--brand)]"
                      style={{ accentColor: primaryColor }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-8">
            <label className="mb-2 block text-sm font-black text-gray-950">Observação</label>
            <textarea
              value={observation}
              onChange={(event) => onObservationChange(event.target.value)}
              rows={3}
              placeholder="Ex: sem cebola, bem passado, sem molho..."
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
            />
          </div>
        </div>

        <div className="border-t border-[var(--line)] bg-white p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 rounded-2xl border border-[var(--line)] px-4 py-3">
              <button
                onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                style={{ color: primaryColor }}
              >
                <Minus size={18} />
              </button>
              <span className="text-lg font-black text-gray-950">{quantity}</span>
              <button onClick={() => onQuantityChange(quantity + 1)} style={{ color: primaryColor }}>
                <Plus size={18} />
              </button>
            </div>

            <button
              onClick={onAddToCart}
              className="flex-1 rounded-2xl px-5 py-4 font-black text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <span className="flex items-center justify-between gap-3">
                <span>Adicionar</span>
                <span>{formatMoney(calculateProductTotal())}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
