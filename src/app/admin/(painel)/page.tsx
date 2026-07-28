import DashboardPeriodWorkspace from "./DashboardPeriodWorkspace";
import styles from "./dashboard-period.module.css";
import headerStyles from "./dashboard-header-layout.module.css";
import "./dashboard-card-heights.module.css";

export default function AdminHomePage() {
  return (
    <div className={styles.page}>
      <div className={headerStyles.page}>
        <DashboardPeriodWorkspace />
      </div>
    </div>
  );
}
