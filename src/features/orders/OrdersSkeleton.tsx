import { AdminPageSkeleton } from "@/components/ui/admin-page-states";
import { AdminSkeleton } from "@/components/ui/admin-primitives";

export function OrdersSkeleton() {
  return (
    <AdminPageSkeleton ariaLabel="Carregando pedidos" metrics={0}>
      <section className="space-y-4">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, index) => (
            <AdminSkeleton key={index} className="h-11 w-28 shrink-0" />
          ))}
        </div>
        <div className="flex flex-col gap-3 xl:flex-row">
          <AdminSkeleton className="h-11 flex-1" />
          <AdminSkeleton className="h-11 xl:w-32" />
        </div>
        <AdminSkeleton className="h-[310px] w-full" />
      </section>
      <section className="fixed bottom-2 left-2 right-2 z-40 rounded-2xl border border-[var(--line)] bg-white/95 px-3 py-2 shadow-[0_14px_40px_rgba(17,16,15,0.12)] backdrop-blur md:left-[calc(var(--admin-sidebar-width)+1.5rem)] md:right-6 md:mx-auto md:max-w-[1460px]">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <AdminSkeleton className="h-4 w-20" />
            <AdminSkeleton className="h-4 w-24" />
            <AdminSkeleton className="hidden h-4 w-28 sm:block" />
          </div>
          <AdminSkeleton className="h-8 w-8" />
        </div>
      </section>
    </AdminPageSkeleton>
  );
}
