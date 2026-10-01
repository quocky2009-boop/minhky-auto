import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { getCatalog, getSavedFilters, getSellers, getSources, getStaleDays, searchDemands, type DemandRow } from "@/lib/demands/data";
import { hasActiveFilter, readFilters, toQueryString, toRpcFilter, type RawParams } from "@/lib/demands/filters";
import { followupState } from "@/lib/followup";
import { formatDate, formatDateTime, relativeDays } from "@/lib/dates";
import { formatRange } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { BUY_STATUSES, SELL_STATUSES, STATUS_LABEL } from "@/lib/labels";
import { Empty, ErrorBox, KindTag, PageHeader, Pager, Signal, StatusText } from "@/components/ui";
import { deleteFilter, saveFilter } from "./actions";

export const metadata = { title: "Nhu cầu mua/bán" };
const PAGE_SIZE = 25;

const QUICK: { label: string; params: Record<string, string> }[] = [
  { label: "Đang mở", params: {} },
  { label: "Cần mua", params: { kind: "buy" } },
  { label: "Cần bán", params: { kind: "sell" } },
  { label: "Đổi xe", params: { kind: "trade_in" } },
  { label: "Quá hạn", params: { fu: "overdue" } },
  { label: "Hôm nay", params: { fu: "today" } },
  { label: "Lâu chưa cập nhật", params: { fu: "stale" } },
  { label: "Chưa có lịch", params: { fu: "no_next" } },
];

function priceYear(r: DemandRow) {
  const parts = [] as string[];
  if (r.year_low || r.year_high) parts.push(r.year_low === r.year_high || !r.year_high ? `đời ${r.year_low ?? ""}${!r.year_high ? "+" : ""}` : `đời ${r.year_low ?? "?"}–${r.year_high}`);
  parts.push(r.kind === "buy" ? `NS ${formatRange(r.price_low, r.price_high)}` : `giá ${formatRange(r.price_low, r.price_high)}`);
  if (r.colors?.length) parts.push(r.colors.join(", "));
  return parts.join(" · ");
}

export default async function DemandsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const user = await requireModule("demands");
  const sp = await searchParams;
  const f = readFilters(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const { rpc, warnings } = toRpcFilter(f);
  const [catalog, sellers, sources, saved, staleDays, res] = await Promise.all([
    getCatalog(), getSellers(), getSources(), getSavedFilters(), getStaleDays(),
    searchDemands(rpc, PAGE_SIZE, (page - 1) * PAGE_SIZE),
  ]);
  const qs = toQueryString(f);
  const manager = isManager(user.roles);
  const now = new Date();
  const makeName = (id: string) => catalog.makes.find((m) => m.id === id)?.name ?? "";
  const modelLabel = (id: string, makeId: string, name: string) => `${makeName(makeId)} ${name}`;

  return (
    <>
      <PageHeader title="Nhu cầu mua/bán" sub={`${res.total} nhu cầu khớp bộ lọc`}>
        <Link href="/nhu-cau/moi" className="btn btn-primary">+ Thêm nhu cầu</Link>
      </PageHeader>

      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {QUICK.map((q) => {
          const href = `/nhu-cau?${toQueryString(q.params)}`;
          const active = toQueryString(q.params) === toQueryString(f);
          return (
            <Link key={q.label} href={href}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${active ? "border-petrol bg-petrol text-white" : "border-line bg-surface hover:border-ink-soft"}`}>
              {q.label}
            </Link>
          );
        })}
      </div>

      <form method="get" className="panel mb-4 p-3 md:p-4">
        <div className="flex gap-2">
          <input name="q" defaultValue={f.q} placeholder="Tìm tên, SĐT, model, ghi chú…" className="field" aria-label="Tìm nhanh" />
          <button className="btn btn-primary shrink-0">Lọc</button>
        </div>
        <details className="mt-3" open={hasActiveFilter(f) && !f.q}>
          <summary className="cursor-pointer text-sm font-medium text-petrol">Bộ lọc kết hợp</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <label><span className="label">Loại</span>
              <select name="kind" defaultValue={f.kind} className="field">
                <option value="">Tất cả</option><option value="buy">Cần mua</option><option value="sell">Cần bán</option><option value="trade_in">Đổi xe</option>
              </select>
            </label>
            <label><span className="label">Trạng thái</span>
              <select name="state" defaultValue={f.state} className="field">
                <option value="">Đang mở</option><option value="all">Tất cả</option><option value="done">Đã chốt</option><option value="closed">Đã đóng</option>
                <optgroup label="Cần mua">{BUY_STATUSES.map((s) => <option key={`b${s}`} value={s}>{STATUS_LABEL.buy[s]}</option>)}</optgroup>
                <optgroup label="Cần bán">{SELL_STATUSES.filter((s) => !(BUY_STATUSES as readonly string[]).includes(s)).map((s) => <option key={`s${s}`} value={s}>{STATUS_LABEL.sell[s]}</option>)}</optgroup>
                <option value="paused">Tạm dừng</option>
              </select>
            </label>
            <label><span className="label">Hãng</span>
              <select name="make" defaultValue={f.make} className="field">
                <option value="">Tất cả</option>{catalog.makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label><span className="label">Model</span>
              <select name="model" defaultValue={f.model} className="field">
                <option value="">Tất cả</option>
                {catalog.models.filter((m) => !f.make || m.make_id === f.make).map((m) => <option key={m.id} value={m.id}>{modelLabel(m.id, m.make_id, m.name)}</option>)}
              </select>
            </label>
            <label><span className="label">Phiên bản</span>
              <select name="variant" defaultValue={f.variant} className="field">
                <option value="">Tất cả</option>
                {catalog.variants.filter((v) => !f.model || v.model_id === f.model).map((v) => {
                  const md = catalog.models.find((m) => m.id === v.model_id);
                  return <option key={v.id} value={v.id}>{md ? modelLabel(md.id, md.make_id, md.name) : ""} {v.name}</option>;
                })}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="label">Đời từ</span><input name="yf" defaultValue={f.yf} inputMode="numeric" placeholder="2019" className="field" /></label>
              <label><span className="label">đến</span><input name="yt" defaultValue={f.yt} inputMode="numeric" placeholder="2023" className="field" /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="label">Giá từ</span><input name="pf" defaultValue={f.pf} placeholder="600tr" className="field" /></label>
              <label><span className="label">đến</span><input name="pt" defaultValue={f.pt} placeholder="700tr" className="field" /></label>
            </div>
            <label><span className="label">Màu</span>
              <input name="color" defaultValue={f.color} list="colors" placeholder="trắng" className="field" />
              <datalist id="colors">{catalog.colors.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label><span className="label">Khu vực</span><input name="area" defaultValue={f.area} placeholder="Yên Sơn" className="field" /></label>
            <label><span className="label">Phụ trách</span>
              <select name="owner" defaultValue={f.owner} className="field">
                <option value="">Tất cả</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.id === user.id ? `${s.name} (tôi)` : s.name}</option>)}
              </select>
            </label>
            <label><span className="label">Nguồn khách</span>
              <select name="source" defaultValue={f.source} className="field">
                <option value="">Tất cả</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label><span className="label">Chăm sóc</span>
              <select name="fu" defaultValue={f.fu} className="field">
                <option value="">Tất cả</option><option value="overdue">Quá hạn</option><option value="today">Đến hạn hôm nay</option>
                <option value="stale">Lâu chưa cập nhật</option><option value="no_next">Chưa có lịch</option>
              </select>
            </label>
            <label><span className="label">Cập nhật từ ngày</span><input type="date" name="since" defaultValue={f.since} className="field" /></label>
            <label><span className="label">Ưu tiên</span>
              <select name="prio" defaultValue={f.prio} className="field">
                <option value="">Tất cả</option><option value="high">Cao</option><option value="normal">Bình thường</option><option value="low">Thấp</option>
              </select>
            </label>
            <label><span className="label">Sắp xếp</span>
              <select name="sort" defaultValue={f.sort} className="field">
                <option value="">Theo hạn chăm sóc</option><option value="updated">Mới cập nhật</option><option value="created">Mới tạo</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary">Áp dụng</button>
            <Link href="/nhu-cau" className="btn btn-ghost">Xóa lọc</Link>
          </div>
        </details>
      </form>

      {(saved.length > 0 || hasActiveFilter(f)) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {saved.length > 0 && <span className="text-ink-soft">Bộ lọc đã lưu:</span>}
          {saved.map((s) => (
            <span key={s.id} className="inline-flex items-center rounded-full border border-line bg-surface">
              <Link href={`/nhu-cau?${s.query}`} className="py-1 pl-3 pr-1 hover:text-petrol">{s.name}</Link>
              <form action={deleteFilter}><input type="hidden" name="id" value={s.id} />
                <button className="px-2 py-1 text-ink-soft hover:text-sig-red" aria-label={`Xóa bộ lọc ${s.name}`}>×</button>
              </form>
            </span>
          ))}
          {hasActiveFilter(f) && (
            <form action={saveFilter} className="flex gap-1.5">
              <input type="hidden" name="query" value={qs} />
              <input name="name" required maxLength={60} placeholder="Tên bộ lọc" className="field !w-36 !py-1 text-sm" />
              <button className="btn btn-ghost !py-1 text-sm">Lưu bộ lọc</button>
            </form>
          )}
        </div>
      )}

      {warnings.map((w) => <div key={w} className="mb-3"><ErrorBox message={w} /></div>)}
      {res.error && <ErrorBox message="Không tải được danh sách. Thử tải lại trang." />}

      {!res.error && res.rows.length === 0 && (
        <Empty title={hasActiveFilter(f) ? "Không có nhu cầu nào khớp bộ lọc." : "Chưa có nhu cầu nào. Nhập nhu cầu đầu tiên từ tin nhắn khách."}
          action={{ href: "/nhu-cau/moi", label: "+ Thêm nhu cầu" }} />
      )}

      {res.rows.length > 0 && (
        <>
          {/* Desktop: bảng */}
          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-soft">
                <tr>
                  <th className="w-8 px-3 py-2"><span className="sr-only">Chăm sóc</span></th>
                  <th className="px-3 py-2 font-medium">Nhu cầu</th>
                  <th className="px-3 py-2 font-medium">Khách</th>
                  <th className="px-3 py-2 font-medium">Xe / tiêu chí</th>
                  <th className="px-3 py-2 font-medium">Trạng thái</th>
                  <th className="px-3 py-2 font-medium">Việc tiếp theo</th>
                  {manager && <th className="px-3 py-2 font-medium">Phụ trách</th>}
                </tr>
              </thead>
              <tbody>
                {res.rows.map((r) => {
                  const st = followupState(r, staleDays, now);
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-floor/60">
                      <td className="px-3 py-2.5"><Signal state={st} /></td>
                      <td className="px-3 py-2.5">
                        <Link href={`/nhu-cau/${r.id}`} className="font-semibold text-petrol hover:underline">{r.code}</Link>
                        <div><KindTag kind={r.kind} tradeIn={r.is_trade_in} /></div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{r.customer_name}</div>
                        {r.customer_phone && <a href={`tel:${r.customer_phone}`} className="num text-xs text-ink-soft hover:text-petrol">{formatPhone(r.customer_phone)}</a>}
                        {r.customer_area && <span className="text-xs text-ink-soft"> · {r.customer_area}</span>}
                      </td>
                      <td className="max-w-64 px-3 py-2.5">
                        <div>{r.vehicle_summary || <span className="text-ink-soft">Chưa rõ xe</span>}</div>
                        <div className="num text-xs text-ink-soft">{priceYear(r)}</div>
                      </td>
                      <td className="px-3 py-2.5"><StatusText kind={r.kind} status={r.status} /></td>
                      <td className="max-w-56 px-3 py-2.5">
                        {r.next_action ? (
                          <>
                            <div className="line-clamp-2">{r.next_action}</div>
                            <div className={`num text-xs ${st === "overdue" ? "font-semibold text-sig-red" : "text-ink-soft"}`}>
                              {formatDateTime(r.next_action_due)} · {relativeDays(r.next_action_due, now)}
                            </div>
                          </>
                        ) : <span className="text-xs text-ink-soft">Chưa có lịch · cập nhật {formatDate(r.last_activity_at)}</span>}
                      </td>
                      {manager && <td className="px-3 py-2.5 text-sm">{r.owner_name ?? "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Điện thoại: thẻ */}
          <ul className="space-y-2 md:hidden">
            {res.rows.map((r) => {
              const st = followupState(r, staleDays, now);
              return (
                <li key={r.id} className="panel p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/nhu-cau/${r.id}`} className="min-w-0">
                      <div className="flex items-center gap-2"><Signal state={st} /><KindTag kind={r.kind} tradeIn={r.is_trade_in} /><span className="text-xs text-ink-soft">{r.code}</span></div>
                      <div className="mt-1 font-semibold">{r.customer_name}</div>
                      <div className="text-sm">{r.vehicle_summary || "Chưa rõ xe"}</div>
                      <div className="num text-xs text-ink-soft">{priceYear(r)}</div>
                    </Link>
                    {r.customer_phone && <a href={`tel:${r.customer_phone}`} className="btn btn-ghost shrink-0 !px-3">Gọi</a>}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-xs">
                    <StatusText kind={r.kind} status={r.status} />
                    <span className={st === "overdue" ? "font-semibold text-sig-red" : "text-ink-soft"}>
                      {r.next_action ? `${r.next_action.slice(0, 40)} · ${relativeDays(r.next_action_due, now)}` : "Chưa có lịch"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pager total={res.total} page={page} pageSize={PAGE_SIZE} makeHref={(p) => `/nhu-cau?${toQueryString(f, { page: String(p) })}`} />
        </>
      )}
    </>
  );
}
