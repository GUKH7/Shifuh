import { redirect } from "next/navigation";

export default function PaymentsRedirectPage() {
  redirect("/admin/settings/payments");
}
