"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || path.startsWith(href + "/");
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`block rounded-md px-3 py-1.5 text-sm ${active ? "bg-petrol-wash font-semibold text-petrol-deep" : "text-ink hover:bg-floor"}`}>
      {children}
    </Link>
  );
}
