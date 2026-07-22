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
  const spacing = size === "medium" ? "gap-2 px-3 py-2 text-sm" : "gap-1.5 px-3 py-1.5 text-xs";

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border font-bold ${spacing} ${meta.badge} ${className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
