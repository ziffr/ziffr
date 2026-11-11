"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || path.startsWith(href + "/");
  return (
    <Link href={href} className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors", active ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </Link>
  );
}
