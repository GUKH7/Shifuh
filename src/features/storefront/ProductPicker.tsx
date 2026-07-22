"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, MessageSquareText, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { formatMoney } from "./format";
import { getAddonGroupLimits, getAddonSelectionInstruction } from "./product-options";
import type { Product } from "./types";
import { useAccessibleDialog } from "./use-accessible-dialog";

type ProductPickerProps = {
  product: Product | null;
  primaryColor: string;
  addonSelections: Record<string, any[]>;
  quantity: number;
  observation: string;
  isEditing: boolean;
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
  isEditing,
  onClose,
  onToggleAddon,
  onQuantityChange,
  onObservationChange,
  onAddToCart,
  calculateProductTotal,
}: ProductPickerProps) {
  const { dialogRef, initialFocusRef } = useAccessibleDialog(Boolean(product), onClose);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const observationRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setCollapsedGroups(new Set());
  }, [product?.id]);

  if (!product) return null;

  const missingRequiredGroups = product.addons?.filter((group: any) => {
    const minimum = Number(group.min_options ?? (group.required ? 1 : 0));
    return (addonSelections[group.id]?.length || 0) < minimum;
  }) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-picker-title"
        tabIndex={-1}
        className="flex max-h-[100dvh] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-t-[24px] bg-[#fffdfa] sm:max-h-[88vh] sm:rounded-[24px]"
        style={{ height: "min(92dvh, 820px)" }}
      >
        <div className="relative flex h-52 shrink-0 items-center justify-center bg-white px-4 py-3 sm:h-72 sm:px-6 sm:py-4">
          <button
            ref={initialFocusRef as React.RefObject<HTMLButtonElement>}
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-full bg-white/92 p-2 text-gray-700 shadow-sm"
            aria-label="Fechar detalhes do produto"
          >
            <X size={20} />
          </button>
          {product.image_url ? (
            <div className="relative size-44 shrink-0 overflow-hidden rounded-2xl sm:size-64">
              <Image src={product.image_url} alt={product.name} fill sizes="(max-width: 640px) 176px, 256px" className="object-cover" />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-300">
              <ShoppingBag size={42} />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:p-6">
          <h2 id="product-picker-title" className="text-2xl font-black text-gray-950 sm:text-3xl">{product.name}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{product.description}</p>
          <button
            type="button"
            onClick={() => {
              observationRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              observationRef.current?.focus({ preventScroll: true });
            }}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800"
          >
            <MessageSquareText size={14} />
            Adicionar observação
          </button>

          {product.addons?.map((group: any) => {
            const selectedOptions = addonSelections[group.id] || [];
            const { minimum, maximum } = getAddonGroupLimits(group);
            const isSingleChoice = maximum === 1;
            const isOptional = minimum === 0;
            const canCollapse = isOptional && group.options.length > 4;
            const isCollapsed = collapsedGroups.has(group.id);

            return (
              <div key={group.id} className="mt-5 border-t border-[var(--line)] pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-gray-950 sm:text-lg">{group.title}</h3>
                      <span className="rounded-full bg-[#f3ede6] px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
                        {minimum > 0 ? "Obrigatório" : "Opcional"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-gray-500">
                      {getAddonSelectionInstruction(group)}
                      {selectedOptions.length > 0 && (
                        <span className="ml-2 font-black" style={{ color: primaryColor }}>
                          {selectedOptions.length} {selectedOptions.length === 1 ? "escolhido" : "escolhidos"}
                        </span>
                      )}
                    </p>
                  </div>
                  {canCollapse && (
                    <button
                      type="button"
                      onClick={() => setCollapsedGroups((current) => {
                        const next = new Set(current);
                        if (next.has(group.id)) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      })}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed ? "Expandir" : "Recolher"} ${group.title}`}
                    >
                      <ChevronDown size={17} className={`transition-transform ${isCollapsed ? "" : "rotate-180"}`} />
                    </button>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="mt-3 space-y-2">
                    {group.options.map((option: any, index: number) => (
                      <label
                        key={index}
                        className="flex cursor-pointer items-center justify-between rounded-xl border bg-white px-3.5 py-3 transition-[border-color,background-color,box-shadow]"
                        style={
                          selectedOptions.some((item: any) => item.name === option.name)
                            ? {
                                borderColor: primaryColor,
                                backgroundColor: `${primaryColor}10`,
                                boxShadow: `inset 3px 0 0 ${primaryColor}`,
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
                          type={isSingleChoice ? "radio" : "checkbox"}
                          name={isSingleChoice ? `addon-group-${group.id}` : undefined}
                          checked={selectedOptions.some((item: any) => item.name === option.name)}
                          onChange={() => onToggleAddon(group.id, option, group)}
                          className="h-5 w-5 accent-[var(--brand)]"
                          style={{ accentColor: primaryColor }}
                        />
                      </label>
                    ))}
                    {isSingleChoice && isOptional && selectedOptions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onToggleAddon(group.id, selectedOptions[0], group)}
                        className="inline-flex items-center gap-1.5 px-1 pt-1 text-xs font-bold text-gray-500 hover:text-gray-800"
                      >
                        <Check size={13} /> Remover escolha
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="mt-5 border-t border-[var(--line)] pt-5">
            <label htmlFor="product-observation" className="mb-2 block text-sm font-black text-gray-950">Alguma observação?</label>
            <textarea
              ref={observationRef}
              id="product-observation"
              value={observation}
              onChange={(event) => onObservationChange(event.target.value)}
              rows={3}
              placeholder="Ex: sem cebola, bem passado, sem molho..."
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none"
            />
          </div>
        </div>

        <div className="border-t border-[var(--line)] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {missingRequiredGroups.length > 0 && (
            <p role="status" aria-live="polite" className="mb-3 text-center text-xs font-bold text-rose-600">
              Complete as escolhas obrigatórias para continuar.
            </p>
          )}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 rounded-2xl border border-[var(--line)] px-4 py-3">
              <button
                onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                style={{ color: primaryColor }}
                aria-label={`Diminuir quantidade de ${product.name}`}
              >
                <Minus size={18} />
              </button>
              <span className="text-lg font-black text-gray-950">{quantity}</span>
              <button
                onClick={() => onQuantityChange(quantity + 1)}
                style={{ color: primaryColor }}
                aria-label={`Aumentar quantidade de ${product.name}`}
              >
                <Plus size={18} />
              </button>
            </div>

            <button
              onClick={onAddToCart}
              disabled={missingRequiredGroups.length > 0}
              className="flex-1 rounded-2xl px-5 py-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              <span className="flex items-center justify-between gap-3">
                <span>{missingRequiredGroups.length > 0 ? "Escolha os itens obrigatórios" : isEditing ? "Salvar alterações" : "Adicionar"}</span>
                <span>{formatMoney(calculateProductTotal())}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
