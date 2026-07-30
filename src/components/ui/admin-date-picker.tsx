"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function parseDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, Math.max(0, month - 1), day || 1, 12, 0, 0, 0);
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthGrid(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 12);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export type AdminDatePickerProps = {
  value: string;
  label?: string;
  onChange: (value: string) => void;
};

export function AdminDatePicker({ value, label, onChange }: AdminDatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12),
  );

  const today = useMemo(() => new Date(), []);
  const todayValue = formatDateValue(today);
  const monthDays = useMemo(() => getMonthGrid(visibleMonth), [visibleMonth]);
  const displayLabel = label || selectedDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const monthLabel = capitalize(
    visibleMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
  );

  useEffect(() => {
    if (!isOpen) {
      setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12));
    }
  }, [isOpen, selectedDate]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const moveMonth = (amount: number) => {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12),
    );
  };

  const selectDate = (date: Date) => {
    onChange(formatDateValue(date));
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50/30 focus-visible:border-[var(--brand)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
        aria-label={`Escolher data. Data selecionada: ${displayLabel}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <CalendarDays size={17} className="text-gray-500" />
        <span>{displayLabel}</span>
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Calendário"
          className="absolute right-0 top-full z-[80] mt-2 w-[324px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[22px] border border-orange-100 bg-white shadow-[0_24px_70px_rgba(49,34,23,0.18)]"
        >
          <div className="flex items-center justify-between border-b border-orange-50 bg-[#fffdfa] px-4 py-3.5">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[var(--brand)]"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-500">
                Selecionar data
              </p>
              <p className="mt-0.5 text-sm font-black text-gray-950">{monthLabel}</p>
            </div>

            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-gray-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[var(--brand)]"
              aria-label="Próximo mês"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEK_DAYS.map((weekDay) => (
                <span
                  key={weekDay}
                  className="pb-1 text-[10px] font-black uppercase tracking-[0.08em] text-gray-400"
                >
                  {weekDay}
                </span>
              ))}

              {monthDays.map((date) => {
                const dateValue = formatDateValue(date);
                const isSelected = dateValue === value;
                const isToday = dateValue === todayValue;
                const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();

                return (
                  <button
                    key={dateValue}
                    type="button"
                    onClick={() => selectDate(date)}
                    className={`relative inline-flex h-9 w-9 items-center justify-center justify-self-center rounded-xl text-sm font-bold transition ${
                      isSelected
                        ? "bg-[var(--brand)] text-white shadow-[0_7px_18px_rgba(255,90,31,0.3)]"
                        : isCurrentMonth
                          ? "text-gray-700 hover:bg-orange-50 hover:text-[var(--brand)]"
                          : "text-gray-300 hover:bg-gray-50 hover:text-gray-500"
                    } ${isToday && !isSelected ? "ring-1 ring-orange-300" : ""}`}
                    aria-label={date.toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                    aria-current={isToday ? "date" : undefined}
                    aria-pressed={isSelected}
                  >
                    {date.getDate()}
                    {isSelected && (
                      <Check
                        size={9}
                        strokeWidth={3.5}
                        className="absolute bottom-0.5 right-0.5"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-orange-50 bg-[#fffdfa] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-400">
                Data selecionada
              </p>
              <p className="truncate text-xs font-bold text-gray-700">
                {selectedDate.toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => selectDate(today)}
              className="shrink-0 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-black text-[var(--brand)] transition hover:bg-orange-100"
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
