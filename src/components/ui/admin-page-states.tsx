import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { AdminButton, AdminPageShell, AdminSkeleton } from "@/components/ui/admin-primitives";

export function AdminPageSkeleton({
  ariaLabel,
  metrics = 4,
  children,
}: {
  ariaLabel: string;
  metrics?: number;
  children?: ReactNode;
}) {
  return (
    <AdminPageShell className="space-y-6 pb-12" role="status" aria-label={ariaLabel}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <AdminSkeleton className="h-12 w-12 sm:h-14 sm:w-14" />
          <div className="space-y-2">
            <AdminSkeleton className="h-7 w-40" />
            <AdminSkeleton className="h-4 w-72 max-w-[68vw]" />
          </div>
        </div>
        <AdminSkeleton className="h-11 w-full sm:w-44" />
      </div>
      {metrics > 0 ? (
        <div className={metrics === 5 ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-5" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-4"}>
          {Array.from({ length: metrics }).map((_, index) => (
            <AdminSkeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : null}
      {children ?? <AdminSkeleton className="h-[460px] w-full" />}
    </AdminPageShell>
  );
}

export function AdminErrorState({
  title = "Não foi possível carregar esta página",
  description,
  onRetry,
  retryLabel = "Tentar novamente",
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <AdminPageShell>
      <div className="surface-card flex min-h-56 flex-col items-center justify-center rounded-[28px] border-red-200 bg-red-50/70 px-6 py-12 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <AlertTriangle size={22} />
        </span>
        <h2 className="mt-4 text-lg font-black text-gray-950">{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-red-700">{description}</p>
        {onRetry ? (
          <AdminButton variant="secondary" className="mt-5" onClick={onRetry}>
            <RefreshCw size={16} />
            {retryLabel}
          </AdminButton>
        ) : null}
      </div>
    </AdminPageShell>
  );
}

export function AdminEmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-8 text-center"
          : "flex min-h-64 flex-col items-center justify-center px-6 py-14 text-center"
      }
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[var(--brand)]">
        {icon ?? <Inbox size={21} />}
      </span>
      <h3 className="mt-4 font-black text-gray-950">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
