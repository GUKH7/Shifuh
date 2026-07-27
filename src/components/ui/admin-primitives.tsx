import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { AdminDashboardPeriodSelect } from "@/components/ui/admin-dashboard-period-select";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AdminPageShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("admin-page-shell", className)} {...props} />;
}

export function AdminPageHeader({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex min-w-0 items-center gap-4">
        {icon ? (
          <div className="brand-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm sm:h-14 sm:w-14">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-gray-950 sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export const AdminInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function AdminInput({ className, ...props }, ref) {
    return <input ref={ref} className={cx("admin-control", className)} {...props} />;
  },
);

export const AdminSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function AdminSelect({ className, id, children, ...props }, ref) {
    if (id === "dashboard-period") {
      return (
        <AdminDashboardPeriodSelect ref={ref} id={id} className={className} {...props}>
          {children}
        </AdminDashboardPeriodSelect>
      );
    }

    return (
      <select ref={ref} id={id} className={cx("admin-control admin-select", className)} {...props}>
        {children}
      </select>
    );
  },
);

type AdminButtonVariant = "brand" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<AdminButtonVariant, string> = {
  brand:
    "border border-[#ffd8ca] bg-[var(--brand-soft)] text-[var(--brand)] hover:border-[#ffc4ae] hover:bg-[#ffe8dc]",
  secondary: "border border-[var(--line)] bg-white text-gray-700 hover:bg-[#faf5ef] hover:text-gray-950",
  ghost: "border border-transparent bg-transparent text-gray-600 hover:bg-[#faf5ef] hover:text-gray-950",
  danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
};

export const AdminButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: AdminButtonVariant }
>(function AdminButton({ className, variant = "brand", type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
});

export function AdminSkeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("animate-pulse rounded-2xl bg-white", className)} />;
}

export type SortDirection = "asc" | "desc" | null;

export function SortableTableHeader({
  label,
  active = false,
  direction = null,
  onClick,
  className,
}: {
  label: string;
  active?: boolean;
  direction?: SortDirection;
  onClick: () => void;
  className?: string;
}) {
  const Icon = !active || !direction ? ArrowUpDown : direction === "asc" ? ChevronUp : ChevronDown;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ordenar por ${label}${active && direction ? ` em ordem ${direction === "asc" ? "crescente" : "decrescente"}` : ""}`}
      className={cx(
        "group inline-flex items-center gap-1.5 text-left font-bold transition-colors hover:text-gray-950",
        active ? "text-[var(--brand)]" : "text-gray-400",
        className,
      )}
    >
      <span>{label}</span>
      <Icon size={14} className="shrink-0 transition-colors group-hover:text-gray-950" />
    </button>
  );
}
