import { ORDER_STATUS_META, type OrderStatus } from "@/lib/order-status";

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

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border font-bold leading-none ${dimensions} ${meta.badge} ${className}`}
    >
      <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center" aria-hidden="true">
        {isActive && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-40 motion-reduce:animate-none ${meta.dot}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
      </span>
      <span>{meta.label}</span>
    </span>
  );
}
