import DashboardPeriodWorkspace from "./DashboardPeriodWorkspace";
import DashboardTopProductsEnhancer from "./DashboardTopProductsEnhancer";
import styles from "./dashboard-period.module.css";
import mobileStyles from "./dashboard-top-products-mobile.module.css";

export default function AdminHomePage() {
  return (
    <div className={`${styles.page} ${mobileStyles.mobileTopProducts}`}>
      <DashboardPeriodWorkspace />
      <DashboardTopProductsEnhancer />
    </div>
  );
}
