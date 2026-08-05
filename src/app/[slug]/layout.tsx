import type { ReactNode } from "react";
import styles from "./layout.module.css";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return <div className={styles.scope}>{children}</div>;
}
