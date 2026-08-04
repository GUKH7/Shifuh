import type { ReactNode } from "react";
import "./history-separation.css";

export default function HistoryLayout({ children }: { children: ReactNode }) {
  return <div className="history-page-scope">{children}</div>;
}
