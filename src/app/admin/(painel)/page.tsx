import DashboardPeriodWorkspace from "./DashboardPeriodWorkspace";
import DashboardTopProductsEnhancer from "./DashboardTopProductsEnhancer";
import styles from "./dashboard-period.module.css";

export default function AdminHomePage() {
  return (
    <div className={styles.page}>
      <DashboardPeriodWorkspace />
      <DashboardTopProductsEnhancer />
    </div>
  );
}
