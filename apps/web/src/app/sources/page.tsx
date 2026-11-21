import { redirect } from "next/navigation";

/** Sources is a tab of Connectors now (#532); the old address still works. */
export default function SourcesMoved(): never {
  redirect("/connectors/sources");
}
