// The settings area opens on your profile (spec 0006).
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/profile");
}
