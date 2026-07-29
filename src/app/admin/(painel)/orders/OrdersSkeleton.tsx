const skeletonBlock = "rounded-xl bg-[#eee6de]";

export function OrdersSkeleton() {
  return (
    <>
      <div
        className="mx-auto max-w-[1460px] space-y-4 pb-20 animate-pulse"
        role="status"
        aria-label="Carregando pedidos"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className={`${skeletonBlock} h-8 w-32`} />
            <div className={`${skeletonBlock} h-4 w-72 max-w-full`} />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className={`${skeletonBlock} h-11 w-40`} />
            <div className={`${skeletonBlock} h-11 w-32`} />
          </div>
        </div>

        <section className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="rounded-2xl border border-orange-100 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className={`${skeletonBlock} h-4 w-40`} />
                <div className={`${skeletonBlock} h-4 w-96 max-w-full`} />
              </div>
              <div className="flex flex-wrap gap-2">
                <div className={`${skeletonBlock} h-9 w-24`} />
                <div className={`${skeletonBlock} h-9 w-28`} />
                <div className={`${skeletonBlock} h-9 w-24`} />
              </div>
            </div>
          </div>
          <div className="h-[70px] rounded-2xl border border-emerald-100 bg-white shadow-sm lg:w-44" />
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="h-11 flex-1 rounded-xl border border-[var(--line)] bg-white shadow-sm" />
            <div className="h-11 rounded-xl border border-[var(--line)] bg-white shadow-sm xl:w-32" />
          </div>

          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={`${skeletonBlock} h-11 w-28`} />
            ))}
          </div>

          <div className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-white shadow-sm">
            <div className="hidden grid-cols-[96px_145px_100px_64px_78px_120px_104px_80px_145px] items-center gap-2 border-b border-[var(--line)] bg-[#fffdfa] px-4 py-3 xl:grid">
              {Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className={`${skeletonBlock} mx-auto h-3 w-16 max-w-full`} />
              ))}
            </div>

            <div className="divide-y divide-[var(--line)]">
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid gap-4 px-5 py-4 xl:grid-cols-[96px_145px_100px_64px_78px_120px_104px_80px_145px] xl:items-center xl:gap-2 xl:px-4"
                >
                  {Array.from({ length: 9 }).map((_, columnIndex) => (
                    <div
                      key={columnIndex}
                      className={`${skeletonBlock} h-9 ${columnIndex === 8 ? "w-24" : "w-full"}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex h-20 items-center rounded-[18px] border border-dashed border-orange-200 bg-white px-5 shadow-sm">
          <div className={`${skeletonBlock} h-12 w-12 shrink-0`} />
          <div className="ml-4 flex-1 space-y-2">
            <div className={`${skeletonBlock} h-4 w-72 max-w-full`} />
            <div className={`${skeletonBlock} h-3 w-96 max-w-full`} />
          </div>
          <div className={`${skeletonBlock} hidden h-11 w-36 sm:block`} />
        </div>
      </div>

      <section className="fixed bottom-3 left-3 right-3 z-40 overflow-hidden rounded-[18px] border border-[var(--line)] bg-white/95 shadow-[0_18px_55px_rgba(17,16,15,0.14)] backdrop-blur md:bottom-3 md:left-[calc(var(--admin-sidebar-width)+1.5rem)] md:right-6">
        <button
          type="button"
          aria-expanded={false}
          disabled
          tabIndex={-1}
          className="flex w-full flex-col gap-2 px-3 py-2.5 text-left sm:flex-row sm:items-center sm:justify-between md:px-4"
        >
          <span className="space-y-2">
            <span className={`${skeletonBlock} block h-5 w-32`} />
            <span className={`${skeletonBlock} block h-3 w-40`} />
          </span>
          <span className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className={`${skeletonBlock} h-9 w-20`} />
            <span className={`${skeletonBlock} h-9 w-24`} />
            <span className={`${skeletonBlock} h-9 w-28`} />
            <span className={`${skeletonBlock} h-9 w-9`} />
          </span>
        </button>
      </section>
    </>
  );
}
