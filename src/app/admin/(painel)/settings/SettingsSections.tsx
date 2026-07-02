"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";

export function FieldHint({ label }: { label: string }) {
  return (
    <span
      title={label}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line)] bg-white text-gray-400"
    >
      <CircleHelp size={12} />
    </span>
  );
}

export function CollapsibleSection({
  icon,
  title,
  description,
  children,
  className = "",
  defaultOpen = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`surface-card rounded-[28px] p-6 ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-[var(--brand-soft)] p-3 text-[var(--brand)]">{icon}</div>
          <div>
            <h2 className="text-xl font-black text-gray-950">{title}</h2>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-white text-gray-500">
          <ChevronDown
            size={18}
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {isOpen && children}
    </section>
  );
}

export function SettingsGroupHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="px-1 pt-3">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-black text-gray-950">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">{description}</p>
    </div>
  );
}
