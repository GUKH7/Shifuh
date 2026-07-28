import DashboardPeriodWorkspace from "./DashboardPeriodWorkspace";
import styles from "./dashboard-period.module.css";
import cardHeightStyles from "./dashboard-card-heights.module.css";

export default function AdminHomePage() {
  return (
    <div className={`${styles.page} ${cardHeightStyles.page}`}>
      <DashboardPeriodWorkspace />
    </div>
  );
}
