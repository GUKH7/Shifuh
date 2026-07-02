export function OrdersSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="space-y-3">
          <div className="h-8 w-32 rounded-full bg-white" />
          <div className="h-4 w-72 rounded-full bg-white" />
        </div>
        <div className="h-10 w-28 rounded-full bg-white" />
      </div>
      <div className="surface-card rounded-[28px] p-6">
        <div className="h-12 rounded-2xl bg-white" />
        <div className="mt-4 flex gap-3">
          <div className="h-10 w-24 rounded-full bg-white" />
          <div className="h-10 w-24 rounded-full bg-white" />
          <div className="h-10 w-24 rounded-full bg-white" />
        </div>
        <div className="mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 rounded-[24px] bg-white" />
          ))}
        </div>
      </div>
    </div>
  );
}
