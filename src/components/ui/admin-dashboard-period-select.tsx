"use client";

import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";

type OptionElementProps = {
  value?: string | number | readonly string[];
  disabled?: boolean;
  children?: ReactNode;
};

type PeriodOption = {
  value: string;
  label: string;
  disabled: boolean;
};

const PERIOD_HELPERS: Record<string, string> = {
  today: "Acompanhe os resultados de hoje.",
  "7d": "Compare a última semana com a anterior.",
  "30d": "Visualize a evolução do último mês.",
  year: "Analise o desempenho acumulado no ano.",
  all: "Consulte todo o histórico disponível.",
  custom: "Escolha as datas inicial e final.",
};

function readOptionLabel(children: ReactNode) {
  return Children.toArray(children)
    .map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : ""))
    .join("")
    .trim();
}

export const AdminDashboardPeriodSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function AdminDashboardPeriodSelect(
  {
    id,
    className,
    children,
    value,
    defaultValue,
    onChange,
    disabled,
    name,
    style,
    "aria-label": ariaLabel,
    ...selectProps
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const optionsId = `${id || "dashboard-period"}-options`;

  const options = useMemo<PeriodOption[]>(() => {
    return Children.toArray(children).flatMap((child) => {
      if (!isValidElement(child) || child.type !== "option") return [];
      const option = child as ReactElement<OptionElementProps>;
      const optionValue = Array.isArray(option.props.value)
        ? option.props.value.join(",")
        : String(option.props.value ?? "");
      return [{
        value: optionValue,
        label: readOptionLabel(option.props.children) || optionValue,
        disabled: Boolean(option.props.disabled),
      }];
    });
  }, [children]);

  const selectedValue = String(value ?? defaultValue ?? options[0]?.value ?? "");
  const selectedOption = options.find((option) => option.value === selectedValue) || options[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectOption = (nextValue: string) => {
    const syntheticEvent = {
      target: { value: nextValue, name },
      currentTarget: { value: nextValue, name },
    } as unknown as ChangeEvent<HTMLSelectElement>;
    onChange?.(syntheticEvent);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="w-full min-w-0">
      <select
        ref={ref}
        name={name}
        value={selectedValue}
        onChange={() => undefined}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        {...selectProps}
      >
        {children}
      </select>

      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel || "Período global do dashboard"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={optionsId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex min-h-[2.45rem] w-full items-center justify-between gap-3 rounded-xl border border-[#e1cfc0] bg-white/90 px-3 py-2 text-left text-sm font-extrabold text-[#312a25] shadow-[inset_0_0_0_1px_rgba(225,207,192,0.28)] outline-none transition hover:border-[#ffb78a] focus-visible:border-[var(--brand)] focus-visible:ring-4 focus-visible:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60 ${className || ""}`}
        style={{ ...style, width: "100%" }}
      >
        <span className="min-w-0 truncate">{selectedOption?.label || "Selecionar período"}</span>
        <ChevronDown
          size={17}
          className={`shrink-0 text-[var(--brand)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          id={optionsId}
          role="listbox"
          aria-label="Opções de período"
          className="dashboard-period-options absolute inset-x-0 top-[calc(100%+0.65rem)] z-[130] w-full min-w-0 overflow-hidden rounded-[20px] border border-[#ead8c9] bg-white p-2 shadow-[0_24px_60px_rgba(63,43,29,0.2)]"
        >
          <div className="border-b border-[#f0e4da] px-3 pb-3 pt-2">
            <p className="text-sm font-black text-gray-950">Selecionar período</p>
            <p className="mt-1 text-xs text-gray-500">O Dashboard inteiro será atualizado.</p>
          </div>

          <div className="max-h-[390px] overflow-y-auto py-2">
            {options.map((option) => {
              const active = option.value === selectedValue;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={option.disabled}
                  onClick={() => selectOption(option.value)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    active ? "bg-[#fff1e8]" : "hover:bg-[#fff8f3]"
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-[var(--brand)] text-white" : "bg-[#f8f2ec] text-gray-400"}`}>
                    {active ? <Check size={17} strokeWidth={3} /> : <span className="h-2 w-2 rounded-full bg-current" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-black ${active ? "text-[var(--brand)]" : "text-gray-800"}`}>{option.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{PERIOD_HELPERS[option.value] || "Atualize as métricas para este intervalo."}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
});
