import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MODULES, ROLE_LABEL, canUse } from "@/lib/modules";
import { signOut } from "../(auth)/actions";
import { NavLink } from "@/components/nav-link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/dang-nhap");
  if (!user.active || user.roles.length === 0) redirect("/chua-cap-quyen");

  const visible = MODULES.filter((m) => m.roles.some((r) => user.roles.includes(r)));
  const groups = [...new Set(visible.map((m) => m.group))];
  const canAddDemand = canUse(user.roles, "demands");

  const nav = (
    <nav aria-label="Menu chính" className="space-y-5">
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1.5 px-3 text-xs font-medium text-ink-soft">{g}</p>
          <ul className="space-y-0.5">
            {visible.filter((m) => m.group === g).map((m) => (
              <li key={m.key}>
                {m.status === "planned" || !m.href ? (
                  <span className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm text-sig-off" aria-disabled title="Chưa triển khai">
                    {m.label}<span className="text-[11px]">chặng {m.phase}</span>
                  </span>
                ) : (
                  <NavLink href={m.href}>{m.label}</NavLink>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const userBox = (
    <div className="border-t border-line pt-3 text-sm">
      <p className="font-medium">{user.name}</p>
      <p className="text-xs text-ink-soft">{user.roles.map((r) => ROLE_LABEL[r]).join(", ")}</p>
      <form action={signOut} className="mt-2"><button className="text-xs font-medium text-petrol underline-offset-2 hover:underline">Đăng xuất</button></form>
    </div>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between overflow-y-auto border-r border-line bg-surface px-3 py-5 md:flex">
        <div>
          <Link href="/tong-quan" className="mb-6 block px-3 text-lg font-bold tracking-tight">Minh Kỳ Auto</Link>
          {nav}
        </div>
        {userBox}
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 md:hidden">
        <details className="group">
          <summary className="cursor-pointer list-none rounded-md border border-line px-3 py-1.5 text-sm font-medium">Menu</summary>
          <div className="absolute left-0 right-0 top-full max-h-[80dvh] overflow-y-auto border-b border-line bg-surface px-3 py-4 shadow-lg">
            {nav}
            <div className="mt-4">{userBox}</div>
          </div>
        </details>
        <Link href="/tong-quan" className="font-bold">Minh Kỳ Auto</Link>
        <span className="w-14" />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pt-8">{children}</main>

      {canAddDemand && (
        <Link href="/nhu-cau/moi" className="btn btn-primary fixed bottom-5 right-5 z-30 rounded-full px-5 py-3 shadow-lg md:hidden">
          + Thêm nhu cầu
        </Link>
      )}
    </div>
  );
}
