type LiveStatusDotProps = {
  className?: string;
};

export function LiveStatusDot({ className = "text-emerald-500" }: LiveStatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-3 w-3 shrink-0 ${className}`}
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex h-3 w-3 rounded-full bg-current" />
    </span>
  );
}
