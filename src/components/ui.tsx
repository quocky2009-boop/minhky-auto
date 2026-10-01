import Link from "next/link";
import { FOLLOWUP_LABEL, type FollowupState } from "@/lib/followup";
import { statusLabel } from "@/lib/labels";

export function Signal({ state, withLabel = false }: { state: FollowupState; withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" title={FOLLOWUP_LABEL[state]}>
      <span className={`signal signal-${state}`} aria-hidden />
      {withLabel ? <span className="text-sm">{FOLLOWUP_LABEL[state]}</span> : <span className="sr-only">{FOLLOWUP_LABEL[state]}</span>}
    </span>
  );
}

export function StatusText({ kind, status }: { kind: string; status: string }) {
  const muted = ["closed", "paused"].includes(status);
  const done = ["won", "acquired"].includes(status);
  return (
    <span className={`text-sm ${muted ? "text-ink-soft" : done ? "font-semibold text-sig-green" : "text-ink"}`}>
      {statusLabel(kind, status)}
    </span>
  );
}

export function KindTag({ kind, tradeIn }: { kind: string; tradeIn?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold">
      <span className={kind === "buy" ? "text-petrol" : "text-ink"}>{kind === "buy" ? "Cần mua" : "Cần bán"}</span>
      {tradeIn && <span className="rounded bg-petrol-wash px-1.5 py-0.5 font-medium text-petrol-deep">đổi xe</span>}
    </span>
  );
}

export function PageHeader({ title, children, sub }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {sub && <div className="mt-1 text-sm text-ink-soft">{sub}</div>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Empty({ title, action }: { title: string; action?: { href: string; label: string } }) {
  return (
    <div className="panel px-5 py-10 text-center">
      <p className="text-ink-soft">{title}</p>
      {action && <Link href={action.href} className="btn btn-primary mt-4">{action.label}</Link>}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="panel border-[#e5b4ae] bg-[#fdf3f2] px-4 py-3 text-sm text-sig-red">{message}</div>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </div>
  );
}

export function Pager({ total, page, pageSize, makeHref }: { total: number; page: number; pageSize: number; makeHref: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Phân trang">
      <span className="text-ink-soft">Trang {page}/{pages} · {total} nhu cầu</span>
      <span className="flex gap-2">
        {page > 1 && <Link className="btn btn-ghost" href={makeHref(page - 1)}>Trang trước</Link>}
        {page < pages && <Link className="btn btn-ghost" href={makeHref(page + 1)}>Trang sau</Link>}
      </span>
    </nav>
  );
}
