"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

type DeliveryNumberFieldProps = {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
  error?: string;
};

const decimalPattern = /^\d*(?:[.,]\d*)?$/;

function parseNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundValue(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeValue(
  value: number,
  min: number,
  max: number | undefined,
  decimals: number,
) {
  const limited = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, value));
  return roundValue(limited, decimals);
}

function formatEditableValue(value: number, decimals: number) {
  const rounded = roundValue(value, decimals);
  return String(rounded).replace(".", ",");
}

export function DeliveryNumberField({
  label,
  value,
  onValueChange,
  min = 0,
  max,
  step = 1,
  decimals = 0,
  prefix,
  suffix,
  hint,
  error,
}: DeliveryNumberFieldProps) {
  const [draft, setDraft] = useState(() => formatEditableValue(value, decimals));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(formatEditableValue(value, decimals));
    }
  }, [decimals, value]);

  const commitDraft = (nextDraft = draft) => {
    const parsed = parseNumber(nextDraft);
    const normalized = normalizeValue(parsed ?? value, min, max, decimals);

    setDraft(formatEditableValue(normalized, decimals));
    onValueChange(normalized);
  };

  const changeByStep = (direction: -1 | 1) => {
    const current = parseNumber(draft) ?? value;
    const next = normalizeValue(current + step * direction, min, max, decimals);

    setDraft(formatEditableValue(next, decimals));
    onValueChange(next);
  };

  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">
        {label}
      </span>

      <div
        className={`grid min-h-11 min-w-0 grid-cols-[40px_minmax(0,1fr)_40px] overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 ${
          error
            ? "border-red-300 focus-within:border-red-400 focus-within:ring-red-100"
            : "border-[var(--line)] focus-within:border-[var(--brand)] focus-within:ring-orange-100"
        }`}
      >
        <button
          type="button"
          aria-label={`Diminuir ${label}`}
          onClick={() => changeByStep(-1)}
          className="inline-flex min-h-11 items-center justify-center text-gray-500 transition hover:bg-[#fcfaf7] active:bg-orange-50"
        >
          <Minus size={16} />
        </button>

        <div className="flex min-w-0 items-center border-x border-[var(--line)] px-2.5">
          {prefix && (
            <span className="mr-1.5 shrink-0 text-xs font-bold text-gray-400">{prefix}</span>
          )}
          <input
            type="text"
            inputMode={decimals > 0 ? "decimal" : "numeric"}
            autoComplete="off"
            enterKeyHint="next"
            value={draft}
            onFocus={(event) => {
              focusedRef.current = true;
              event.currentTarget.select();
            }}
            onBlur={() => {
              focusedRef.current = false;
              commitDraft();
            }}
            onChange={(event) => {
              const nextDraft = event.target.value;
              if (!decimalPattern.test(nextDraft)) return;

              setDraft(nextDraft);
              const parsed = parseNumber(nextDraft);
              if (parsed !== null) {
                onValueChange(roundValue(parsed, decimals));
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            aria-label={label}
            aria-invalid={Boolean(error)}
            className="min-w-0 flex-1 bg-transparent py-2 text-center text-sm font-semibold text-gray-950 outline-none"
          />
          {suffix && (
            <span className="ml-1.5 shrink-0 text-xs font-bold text-gray-400">{suffix}</span>
          )}
        </div>

        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          onClick={() => changeByStep(1)}
          className="inline-flex min-h-11 items-center justify-center text-gray-500 transition hover:bg-[#fcfaf7] active:bg-orange-50"
        >
          <Plus size={16} />
        </button>
      </div>

      {error ? (
        <span role="alert" className="block text-[11px] font-semibold leading-4 text-red-600">
          {error}
        </span>
      ) : (
        hint && (
          <span className="hidden text-[11px] leading-4 text-gray-500 sm:block">
            {hint}
          </span>
        )
      )}
    </label>
  );
}
