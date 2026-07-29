type LiveStatusDotProps = {
  className?: string;
};

export function LiveStatusDot({ className = "text-emerald-500" }: LiveStatusDotProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-3 w-3 shrink-0 overflow-visible ${className}`}
      focusable="false"
    >
      <circle cx="12" cy="12" r="4.5" fill="currentColor" opacity="0.55">
        <animate
          attributeName="r"
          values="4.5;11"
          dur="1.35s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.55;0"
          dur="1.35s"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
    </svg>
  );
}
