import { ORDER_STATUS_META, type OrderStatus } from "@/lib/order-status";

const STATUS_DOT_COLORS: Record<OrderStatus, string> = {
  pending: "#f97316",
  preparing: "#3b82f6",
  delivering: "#8b5cf6",
  done: "#10b981",
  canceled: "#ef4444",
};

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
  const dotColor = STATUS_DOT_COLORS[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border font-bold leading-none ${dimensions} ${meta.badge} ${className}`}
    >
      <span
        className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center overflow-visible"
        aria-hidden="true"
      >
        {isActive && (
          <span
            className="absolute h-2.5 w-2.5 animate-ping rounded-full opacity-45 motion-reduce:hidden"
            style={{ backgroundColor: dotColor }}
          />
        )}
        <span
          className={`relative z-[1] inline-flex h-2 w-2 rounded-full ${isActive ? "animate-pulse motion-reduce:animate-none" : ""}`}
          style={{ backgroundColor: dotColor }}
        />
      </span>
      <span>{meta.label}</span>
    </span>
  );
}
