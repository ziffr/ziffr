// My schedule moved out from under settings (ticket #529; GLOSSARY: Schedule): old links, bookmarks and the Calendar
// Link's events still land on it.
import { redirect } from "next/navigation";

export default function OldSchedulePage() {
  redirect("/schedule");
}
