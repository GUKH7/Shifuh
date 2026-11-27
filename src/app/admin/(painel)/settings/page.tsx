import SettingsWorkspace from "@/features/settings/SettingsWorkspace";
import { isIfoodOrdersOnly, isIfoodCutoverPaused } from "@/lib/ifood/capabilities";

export default function SettingsPage() {
  return <SettingsWorkspace ifoodOrdersOnly={isIfoodOrdersOnly()} ifoodCutoverPaused={isIfoodCutoverPaused()} />;
}
