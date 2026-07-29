import styles from "./live-status-dot.module.css";

type LiveStatusDotProps = {
  className?: string;
};

export function LiveStatusDot({ className = "text-emerald-500" }: LiveStatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.dot} ${className}`}
    >
      <span className={styles.pulse} />
      <span className={styles.core} />
    </span>
  );
}
