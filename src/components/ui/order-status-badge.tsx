import { LiveStatusDot } from "@/components/ui/live-status-dot";
import { ORDER_STATUS_META, type OrderStatus } from "@/lib/order-status";

const STATUS_DOT_CLASSES: Record<OrderStatus, string> = {
  pending: "text-orange-500",
  preparing: "text-blue-500",
  delivering: "text-violet-500",
  done: "text-emerald-500",
  canceled: "text-red-500",
};

function StaticStatusDot({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-3 w-3 shrink-0 overflow-visible ${className}`}
      focusable="false"
    >
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
    </svg>
  );
}

export function OrderStatusBadge({
  status,
  className = "",
  size = "small",
}: {
  status: OrderStatus;
  className?: string;
  size?: "small" | "medium";
}) {
  const meta = ORDER_STATUS_META[status];
  const dimensions = size === "medium"
    ? "h-9 min-w-[120px] gap-2 px-3.5 text-sm"
    : "h-8 min-w-[108px] gap-1.5 px-3 text-xs";
  const isActive = status === "pending" || status === "preparing" || status === "delivering";
  const dotClassName = STATUS_DOT_CLASSES[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border font-bold leading-none ${dimensions} ${meta.badge} ${className}`}
    >
      {isActive ? (
        <LiveStatusDot className={dotClassName} />
      ) : (
        <StaticStatusDot className={dotClassName} />
      )}
      <span>{meta.label}</span>
    </span>
  );
}
