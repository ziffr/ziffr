"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || path.startsWith(href + "/");
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-1.5 text-sm sm:px-2 transition-colors", active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
      {children}
    </Link>
  );
}
