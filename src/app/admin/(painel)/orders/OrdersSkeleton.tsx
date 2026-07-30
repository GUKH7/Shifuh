import { AdminPageSkeleton } from "@/components/ui/admin-page-states";
import { AdminSkeleton } from "@/components/ui/admin-primitives";

export function OrdersSkeleton() {
  return (
    <AdminPageSkeleton ariaLabel="Carregando pedidos" metrics={0}>
      <section className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <AdminSkeleton className="h-[70px] w-full" />
        <AdminSkeleton className="h-[70px] w-full lg:w-44" />
      </section>
      <section className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <AdminSkeleton className="h-11 flex-1" />
          <AdminSkeleton className="h-11 xl:w-32" />
        </div>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <AdminSkeleton key={index} className="h-11 w-28" />
          ))}
        </div>
        <AdminSkeleton className="h-[310px] w-full" />
      </section>
      <section className="sticky bottom-3 z-20 rounded-[18px] border border-[var(--line)] bg-white/95 p-4 shadow-[0_18px_55px_rgba(17,16,15,0.14)] backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <AdminSkeleton className="h-5 w-32" />
            <AdminSkeleton className="h-3 w-40" />
          </div>
          <div className="flex gap-2">
            <AdminSkeleton className="h-9 w-20" />
            <AdminSkeleton className="h-9 w-24" />
            <AdminSkeleton className="h-9 w-28" />
          </div>
        </div>
      </section>
    </AdminPageSkeleton>
  );
}
