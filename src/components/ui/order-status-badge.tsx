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
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 overflow-visible"
        viewBox="0 0 14 14"
      >
        {isActive && (
          <circle cx="7" cy="7" r="3" fill="none" stroke={dotColor} strokeWidth="1.5">
            <animate
              attributeName="r"
              values="3;6;3"
              keyTimes="0;0.72;1"
              dur="1.35s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.85;0;0.85"
              keyTimes="0;0.72;1"
              dur="1.35s"
              repeatCount="indefinite"
            />
          </circle>
        )}
        <circle cx="7" cy="7" r="3" fill={dotColor} />
      </svg>
      <span>{meta.label}</span>
    </span>
  );
}
