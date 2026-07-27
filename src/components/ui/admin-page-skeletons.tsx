import { AdminPageShell, AdminSkeleton } from "@/components/ui/admin-primitives";

function SkeletonHeader({ actionCount = 1 }: { actionCount?: number }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <AdminSkeleton className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
        <div className="space-y-2">
          <AdminSkeleton className="h-7 w-44" />
          <AdminSkeleton className="h-4 w-64 max-w-[65vw]" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: actionCount }).map((_, index) => (
          <AdminSkeleton key={index} className="h-11 w-32" />
        ))}
      </div>
    </div>
  );
}

export function MenuPageSkeleton() {
  return (
    <AdminPageShell className="space-y-6 pb-20" role="status" aria-label="Carregando cardápios">
      <SkeletonHeader actionCount={2} />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-5">
          <div className="surface-card rounded-[26px] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <AdminSkeleton className="h-3 w-40" />
                <AdminSkeleton className="h-6 w-80 max-w-full" />
              </div>
              <div className="flex gap-2">
                <AdminSkeleton className="h-11 w-36" />
                <AdminSkeleton className="h-11 w-24" />
              </div>
            </div>
          </div>

          {Array.from({ length: 3 }).map((_, categoryIndex) => (
            <div key={categoryIndex} className="surface-card overflow-hidden rounded-[26px]">
              <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] bg-white px-5 py-4">
                <div className="flex items-center gap-3">
                  <AdminSkeleton className="h-10 w-10" />
                  <div className="space-y-2">
                    <AdminSkeleton className="h-5 w-40" />
                    <AdminSkeleton className="h-3 w-20" />
                  </div>
                </div>
                <AdminSkeleton className="h-9 w-28" />
              </div>
              <div className="divide-y divide-[var(--line)] bg-[#fffdfa]">
                {Array.from({ length: 3 }).map((_, productIndex) => (
                  <div key={productIndex} className="flex items-center gap-4 px-5 py-4">
                    <AdminSkeleton className="h-16 w-16 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <AdminSkeleton className="h-4 w-48 max-w-full" />
                      <AdminSkeleton className="h-3 w-72 max-w-full" />
                      <AdminSkeleton className="h-4 w-20" />
                    </div>
                    <AdminSkeleton className="hidden h-10 w-24 sm:block" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="surface-card hidden min-h-[420px] rounded-[26px] p-5 2xl:block">
          <AdminSkeleton className="h-5 w-36" />
          <AdminSkeleton className="mt-4 h-44 w-full rounded-[20px]" />
          <div className="mt-4 space-y-3">
            <AdminSkeleton className="h-4 w-3/4" />
            <AdminSkeleton className="h-4 w-full" />
            <AdminSkeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}

export function SettingsPageSkeleton() {
  return (
    <AdminPageShell className="space-y-6 pb-20" role="status" aria-label="Carregando configurações">
      <SkeletonHeader />
      {Array.from({ length: 4 }).map((_, groupIndex) => (
        <div key={groupIndex} className="space-y-4">
          <div className="space-y-2">
            <AdminSkeleton className="h-3 w-24" />
            <AdminSkeleton className="h-6 w-48" />
            <AdminSkeleton className="h-4 w-[32rem] max-w-full" />
          </div>
          <div className="surface-card rounded-[26px] p-5 sm:p-6">
            <div className="flex items-center gap-3 border-b border-[var(--line)] pb-4">
              <AdminSkeleton className="h-10 w-10" />
              <div className="space-y-2">
                <AdminSkeleton className="h-5 w-44" />
                <AdminSkeleton className="h-3 w-64 max-w-full" />
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {Array.from({ length: groupIndex === 1 ? 6 : 4 }).map((_, fieldIndex) => (
                <AdminSkeleton key={fieldIndex} className="h-11 w-full" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </AdminPageShell>
  );
}
