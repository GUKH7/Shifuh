import { HistoryWorkspace } from "./HistoryWorkspace";
import "./history-separation.css";

export default function HistoryLayout() {
  return (
    <div className="history-page-scope">
      <HistoryWorkspace />
    </div>
  );
}
