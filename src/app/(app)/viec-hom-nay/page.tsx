import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { getStaleDays, searchDemands, type DemandRow } from "@/lib/demands/data";
import { formatDate, formatDateTime, relativeDays } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { KindTag, PageHeader, Signal, StatusText } from "@/components/ui";
import type { FollowupState } from "@/lib/followup";

export const metadata = { title: "Việc hôm nay" };
const LIMIT = 50;

function Section({ title, state, rows, total, more, empty, showOwner }: {
  title: string; state: FollowupState; rows: DemandRow[]; total: number; more: string; empty: string; showOwner: boolean;
}) {
  const now = new Date();
  return (
    <section className="panel p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><Signal state={state} />{title} <span className="text-ink-soft">({total})</span></h2>
      {rows.length === 0 ? <p className="text-sm text-ink-soft">{empty}</p> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
              <Link href={`/nhu-cau/${r.id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs"><KindTag kind={r.kind} tradeIn={r.is_trade_in} /><span className="text-ink-soft">{r.code}</span><StatusText kind={r.kind} status={r.status} /></div>
                <div className="font-medium">{r.customer_name} <span className="font-normal text-ink-soft">· {r.vehicle_summary || "chưa rõ xe"}</span></div>
                <div className="text-sm">
                  {r.next_action
                    ? <>{r.next_action} <span className={`num text-xs ${state === "overdue" ? "font-semibold text-sig-red" : "text-ink-soft"}`}>— {formatDateTime(r.next_action_due)} ({relativeDays(r.next_action_due, now)})</span></>
                    : <span className="text-xs text-ink-soft">Cập nhật lần cuối {formatDate(r.last_activity_at)}</span>}
                </div>
                {showOwner && <div className="text-xs text-ink-soft">Phụ trách: {r.owner_name ?? "—"}</div>}
              </Link>
              {r.customer_phone && <a href={`tel:${r.customer_phone}`} className="btn btn-ghost shrink-0 !px-3 text-sm" aria-label={`Gọi ${formatPhone(r.customer_phone)}`}>Gọi</a>}
            </li>
          ))}
        </ul>
      )}
      {total > rows.length && <Link href={more} className="mt-2 inline-block text-sm font-medium text-petrol">Xem tất cả {total} →</Link>}
    </section>
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ "cua-toi"?: string }> }) {
  const user = await requireModule("today");
  const sp = await searchParams;
  const manager = isManager(user.roles);
  const mineOnly = !manager || sp["cua-toi"] === "1";
  const base: Record<string, string> = mineOnly && manager ? { owner_id: user.id } : {};
  const ownerQs = mineOnly && manager ? `&owner=${user.id}` : "";
  const [staleDays, overdue, today, stale, noNext] = await Promise.all([
    getStaleDays(),
    searchDemands({ ...base, followup: "overdue" }, LIMIT, 0),
    searchDemands({ ...base, followup: "today" }, LIMIT, 0),
    searchDemands({ ...base, followup: "stale", sort: "updated" }, LIMIT, 0),
    searchDemands({ ...base, followup: "no_next", sort: "created" }, LIMIT, 0),
  ]);
  return (
    <>
      <PageHeader title="Việc hôm nay" sub={manager ? (mineOnly ? "Chỉ việc của tôi" : "Toàn bộ nhu cầu của showroom") : "Nhu cầu anh/chị phụ trách hoặc được chia sẻ"}>
        {manager && <Link href={mineOnly ? "/viec-hom-nay" : "/viec-hom-nay?cua-toi=1"} className="btn btn-ghost">{mineOnly ? "Xem toàn showroom" : "Chỉ việc của tôi"}</Link>}
        <Link href="/nhu-cau/moi" className="btn btn-primary">+ Thêm nhu cầu</Link>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Quá hạn" state="overdue" rows={overdue.rows} total={overdue.total} more={`/nhu-cau?fu=overdue${ownerQs}`} empty="Không có việc quá hạn." showOwner={!mineOnly} />
        <Section title="Đến hạn hôm nay" state="today" rows={today.rows} total={today.total} more={`/nhu-cau?fu=today${ownerQs}`} empty="Hôm nay chưa có lịch hẹn." showOwner={!mineOnly} />
        <Section title={`Lâu chưa cập nhật (> ${staleDays} ngày) — cần xác minh lại`} state="stale" rows={stale.rows} total={stale.total} more={`/nhu-cau?fu=stale${ownerQs}`} empty="Không có nhu cầu bị bỏ lâu." showOwner={!mineOnly} />
        <Section title="Chưa có lịch chăm sóc" state="none" rows={noNext.rows} total={noNext.total} more={`/nhu-cau?fu=no_next${ownerQs}`} empty="Mọi nhu cầu đều đã có việc tiếp theo." showOwner={!mineOnly} />
      </div>
    </>
  );
}
