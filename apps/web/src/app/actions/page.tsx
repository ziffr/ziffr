// The Actions page moved into the Schedule (GLOSSARY: Schedule, Action): its address keeps working.
import { redirect } from "next/navigation";

export default function ActionsPage() {
  redirect("/schedule?view=asked");
}
