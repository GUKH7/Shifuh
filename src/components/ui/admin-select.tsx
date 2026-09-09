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
  label?: string;
};

type AdminSelectOption = {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
};

function textFromNode(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement(child)) return textFromNode((child.props as { children?: ReactNode }).children);
      return "";
    })
    .join("")
    .trim();
}

function normalizeValue(value: SelectHTMLAttributes<HTMLSelectElement>["value"]) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return value == null ? "" : String(value);
}

function readOptions(children: ReactNode, group?: string, parentDisabled = false): AdminSelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];

    if (child.type === "option") {
      const option = child as ReactElement<OptionElementProps>;
      const optionValue = normalizeValue(option.props.value);
      return [{
        value: optionValue,
        label: textFromNode(option.props.children) || optionValue,
        disabled: parentDisabled || Boolean(option.props.disabled),
        group,
      }];
    }

    if (child.type === "optgroup") {
      const optionGroup = child as ReactElement<OptionElementProps>;
      return readOptions(
        optionGroup.props.children,
        optionGroup.props.label,
        parentDisabled || Boolean(optionGroup.props.disabled),
      );
    }

    return [];
  });
}

function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref) ref.current = value;
}

export const AdminCustomSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function AdminCustomSelect(
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
    required,
    form,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    ...selectProps
  },
  forwardedRef,
) {
  const options = useMemo(() => readOptions(children), [children]);
  const controlled = value !== undefined;
  const initialValue = defaultValue !== undefined
    ? normalizeValue(defaultValue)
    : options[0]?.value || "";
  const [internalValue, setInternalValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeSelectRef = useRef<HTMLSelectElement | null>(null);
  const listboxId = `${id || name || "admin-select"}-options`;
  const selectedValue = controlled ? normalizeValue(value) : internalValue;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selectedValue));
  const selectedOption = options.find((option) => option.value === selectedValue);

  useEffect(() => {
    if (!controlled && !options.some((option) => option.value === internalValue)) {
      setInternalValue(options[0]?.value || "");
    }
  }, [controlled, internalValue, options]);

  useEffect(() => {
    if (!open) return;

    setActiveIndex(selectedIndex);

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
  }, [open, selectedIndex]);

  const enabledIndexes = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const moveActive = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const currentPosition = enabledIndexes.indexOf(activeIndex);
    const fallbackPosition = direction === 1 ? -1 : 0;
    const nextPosition = (currentPosition === -1 ? fallbackPosition : currentPosition) + direction;
    const normalizedPosition = (nextPosition + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[normalizedPosition]);
  };

  const selectOption = (nextValue: string) => {
    const option = options.find((item) => item.value === nextValue);
    if (!option || option.disabled) return;

    if (!controlled) setInternalValue(nextValue);
    if (nativeSelectRef.current) nativeSelectRef.current.value = nextValue;

    const syntheticEvent = {
      target: nativeSelectRef.current || { value: nextValue, name },
      currentTarget: nativeSelectRef.current || { value: nextValue, name },
    } as unknown as ChangeEvent<HTMLSelectElement>;
    onChange?.(syntheticEvent);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full min-w-0">
      <select
        ref={(node) => {
          nativeSelectRef.current = node;
          assignRef(forwardedRef, node);
        }}
        name={name}
        value={selectedValue}
        onChange={() => undefined}
        disabled={disabled}
        required={required}
        form={form}
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
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={required || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              setActiveIndex(selectedIndex);
            } else {
              moveActive(event.key === "ArrowDown" ? 1 : -1);
            }
            return;
          }

          if (!open) return;

          if (event.key === "Home") {
            event.preventDefault();
            if (enabledIndexes.length > 0) setActiveIndex(enabledIndexes[0]);
          } else if (event.key === "End") {
            event.preventDefault();
            if (enabledIndexes.length > 0) setActiveIndex(enabledIndexes[enabledIndexes.length - 1]);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const option = options[activeIndex];
            if (option) selectOption(option.value);
          } else if (event.key === "Escape" || event.key === "Tab") {
            setOpen(false);
          }
        }}
        className={`admin-control admin-select flex w-full min-w-0 items-center justify-between gap-3 text-left ${className || ""}`}
        style={style}
      >
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label || "Selecionar"}</span>
        <ChevronDown
          size={17}
          aria-hidden="true"
          className={`shrink-0 text-[var(--brand)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel || "Opções"}
          className="absolute left-0 right-0 top-full z-[140] mt-2 max-h-80 overflow-y-auto radius-panel border border-[#ead8c9] bg-[#fffdfa] p-1.5 shadow-[0_18px_50px_rgba(72,45,29,0.16)]"
        >
          {options.map((option, index) => {
            const selected = option.value === selectedValue;
            const active = index === activeIndex;
            const showGroup = option.group && (index === 0 || options[index - 1]?.group !== option.group);

            return (
              <div key={`${option.value}-${index}`}>
                {showGroup ? (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#9c9188]">
                    {option.group}
                  </p>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option.value)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected
                      ? "bg-[#fff1e8] font-extrabold text-[var(--brand)]"
                      : active
                        ? "bg-[#fff8f3] font-semibold text-[#312a25]"
                        : "font-semibold text-[#4b423b] hover:bg-[#fff8f3]"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {selected ? <Check size={16} strokeWidth={3} className="shrink-0" /> : null}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});
