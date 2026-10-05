"use client";

import Link from "next/link";
import { useActionState } from "react";
import { reservationAction } from "../reservation-actions";
import type { ActionState } from "../../nhu-cau/actions";
import { RESERVATION_KIND_LABEL, RESERVATION_STATUS_LABEL, isExpiredHold } from "@/lib/reservations";
import { formatVnd, toVnd } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import type { DemandOption, PublicInfo, ReservationRow } from "./reservation-load";

type Props = {
  vehicleId: string; saleStatus: string; canSell: boolean; manager: boolean; finance: boolean; userId: string;
  reservations: ReservationRow[]; publicInfo: PublicInfo | null; demandOptions: DemandOption[]; requestIds: { reserve: string; convert: string };
};

const STATUS_STYLE: Record<string, string> = {
  active: "bg-[#fdf7e6] text-[#8a6100]", converted: "bg-floor text-ink-soft", released: "bg-floor text-ink-soft", cancelled: "bg-floor text-ink-soft line-through", fulfilled: "bg-[#e6f2ea] text-sig-green",
};

export function ReservationPanel(p: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(reservationAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const confirm = (msg: string) => (e: React.MouseEvent) => { if (!window.confirm(msg)) e.preventDefault(); };
  const active = p.reservations.find((r) => r.status === "active") ?? null;
  const history = p.reservations.filter((r) => r.status !== "active");
  const expired = active ? isExpiredHold(active) : false;
  const mine = !!active && (active.owner_id === p.userId || p.manager);
  const Hid = ({ intent, r }: { intent: string; r?: ReservationRow }) => (
    <><input type="hidden" name="intent" value={intent} /><input type="hidden" name="vehicle_id" value={p.vehicleId} />
      {r && <><input type="hidden" name="id" value={r.id} /><input type="hidden" name="version" value={r.version} /></>}</>
  );
  const message = s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>;

  return (
    <div className="space-y-4">
      {message}

      {/* ---- Giữ/cọc đang hiệu lực ---- */}
      {active ? (
        <div className="rounded-md border border-line p-3">
          <p className="text-sm">
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE.active}`}>{RESERVATION_KIND_LABEL[active.kind]}</span>{" "}
            <b>{active.code}</b> · Người phụ trách: {active.owner?.full_name ?? "—"}
            {active.valid_until && <> · {active.kind === "hold" ? "Hạn giữ" : "Hiệu lực đến"} <b className={expired ? "text-sig-red" : ""}>{formatDateTime(active.valid_until)}</b>{expired ? " (ĐÃ HẾT HẠN)" : ""}</>}
          </p>
          <dl className="mt-1 grid gap-1 text-sm md:grid-cols-2">
            <div><dt className="inline text-ink-soft">Khách: </dt><dd className="inline">{active.customer?.full_name ?? "—"}{active.customer?.phone ? ` · ${active.customer.phone}` : ""}</dd></div>
            <div><dt className="inline text-ink-soft">Nhu cầu: </dt><dd className="inline">{active.demand ? <Link href={`/nhu-cau/${active.demand.id}`} className="text-petrol hover:underline">{active.demand.code}</Link> : "—"}</dd></div>
            {active.kind === "deposit" && <div><dt className="inline text-ink-soft">Tiền cọc thỏa thuận: </dt><dd className="num inline font-semibold">{formatVnd(active.deposit_amount)}</dd> <span className="text-xs text-ink-soft">(chưa ghi nhận thu tiền — làm ở phần thu chi)</span></div>}
            {toVnd(active.agreed_price) !== null && <div><dt className="inline text-ink-soft">Giá chốt dự kiến: </dt><dd className="num inline">{formatVnd(active.agreed_price)}</dd></div>}
            {active.note && <div className="md:col-span-2"><dt className="inline text-ink-soft">Ghi chú: </dt><dd className="inline">{active.note}</dd></div>}
          </dl>
          {expired && <p className="mt-1 text-xs text-[#8a6100]">Giữ xe đã quá hạn. Người khác giữ/cọc xe này sẽ tự nhả bản này; không gia hạn bản đã hết hạn.</p>}
          {mine && (
            <div className="mt-2 flex flex-wrap gap-2">
              {active.kind === "hold" && !expired && (
                <details>
                  <summary className="btn btn-ghost !py-1 cursor-pointer text-sm">Gia hạn</summary>
                  <form action={action} className="mt-2 flex flex-wrap items-end gap-2"><Hid intent="extend" r={active} />
                    <label><span className="label">Hạn mới *</span><input type="datetime-local" name="valid_until" className="field" /><Err k="valid_until" /></label>
                    <button className="btn btn-primary" disabled={pending}>Gia hạn</button></form>
                </details>
              )}
              {active.kind === "hold" && (
                <details>
                  <summary className="btn btn-primary !py-1 cursor-pointer text-sm">Chuyển thành đặt cọc</summary>
                  <form action={action} className="mt-2 grid gap-2 md:grid-cols-3"><Hid intent="convert" r={active} /><input type="hidden" name="request_id" value={p.requestIds.convert} />
                    <label><span className="label">Tiền cọc thỏa thuận *</span><input name="deposit_amount" className="field" placeholder="30tr" /><Err k="deposit_amount" /></label>
                    <label><span className="label">Giá chốt dự kiến</span><input name="agreed_price" defaultValue={toVnd(active.agreed_price)?.toString() ?? ""} className="field" /><Err k="agreed_price" /></label>
                    <label><span className="label">Hiệu lực đến (tùy chọn)</span><input type="datetime-local" name="valid_until" className="field" /><Err k="valid_until" /></label>
                    <button className="btn btn-primary md:w-fit" disabled={pending} onClick={confirm("Chuyển giữ xe thành đặt cọc? Xe chuyển sang trạng thái “đã cọc”.")}>Chuyển</button></form>
                </details>
              )}
              {active.kind === "hold" && (
                <details>
                  <summary className="btn btn-ghost !py-1 cursor-pointer text-sm text-sig-red">Nhả giữ xe</summary>
                  <form action={action} className="mt-2 flex gap-2"><Hid intent="release" r={active} />
                    <input name="reason" className="field" placeholder="Lý do nhả *" aria-label="Lý do nhả giữ xe" required />
                    <button className="btn btn-danger shrink-0" disabled={pending} onClick={confirm("Nhả giữ xe? Xe trở lại trạng thái đang bán và người khác có thể giữ/cọc.")}>Nhả</button></form>
                </details>
              )}
              {active.kind === "deposit" && p.manager && (
                <details>
                  <summary className="btn btn-ghost !py-1 cursor-pointer text-sm text-sig-red">Hủy cọc</summary>
                  <form action={action} className="mt-2 flex gap-2"><Hid intent="cancel_deposit" r={active} />
                    <input name="reason" className="field" placeholder="Lý do hủy cọc *" aria-label="Lý do hủy cọc" required />
                    <button className="btn btn-danger shrink-0" disabled={pending} onClick={confirm("Hủy cọc? Xe trở lại trạng thái đang bán. Việc hoàn/giữ tiền cọc xử lý ở phần thu chi.")}>Hủy cọc</button></form>
                </details>
              )}
            </div>
          )}
        </div>
      ) : p.publicInfo ? (
        <p className="rounded-md bg-floor p-3 text-sm">
          Xe {p.publicInfo.kind === "hold" ? "đang được giữ" : "đã có người đặt cọc"} — người phụ trách: <b>{p.publicInfo.owner_name}</b>
          {p.publicInfo.valid_until ? <> · hạn giữ {formatDateTime(p.publicInfo.valid_until)}</> : null}. Liên hệ người phụ trách nếu cần xe này.
        </p>
      ) : p.saleStatus === "held" || p.saleStatus === "deposited" ? (
        <p className="rounded-md bg-floor p-3 text-sm">Xe {p.saleStatus === "held" ? "đang được giữ" : "đã có người đặt cọc"}.</p>
      ) : null}

      {/* ---- Giữ xe / đặt cọc mới ---- */}
      {p.canSell && p.saleStatus === "available" && (
        <details className="rounded-md border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-petrol">+ Giữ xe / đặt cọc cho khách</summary>
          <form action={action} className="mt-3 grid gap-3 md:grid-cols-2">
            <Hid intent="reserve" /><input type="hidden" name="request_id" value={p.requestIds.reserve} />
            <label><span className="label">Nhu cầu mua của khách *</span>
              <select name="demand_id" defaultValue="" className="field"><option value="">— Chọn nhu cầu —</option>
                {p.demandOptions.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.customer_name}</option>)}</select><Err k="demand_id" /></label>
            <label><span className="label">Loại *</span>
              <select name="kind" defaultValue="hold" className="field"><option value="hold">Giữ xe (có hạn)</option><option value="deposit">Đặt cọc</option></select><Err k="kind" /></label>
            <label><span className="label">Hạn giữ xe (bắt buộc khi giữ; không có hạn mặc định)</span><input type="datetime-local" name="valid_until" className="field" /><Err k="valid_until" /></label>
            <label><span className="label">Tiền cọc thỏa thuận (bắt buộc khi đặt cọc)</span><input name="deposit_amount" className="field" placeholder="30tr" /><Err k="deposit_amount" /></label>
            <label><span className="label">Giá chốt dự kiến</span><input name="agreed_price" className="field" placeholder="640tr" /><Err k="agreed_price" /></label>
            <label><span className="label">Ghi chú</span><input name="note" className="field" /></label>
            <button className="btn btn-primary md:w-fit" disabled={pending}>Ghi giữ/cọc</button>
            <p className="text-xs text-ink-soft md:col-span-2">Một xe chỉ có một giữ/cọc hiệu lực: nếu người khác vừa giữ/cọc trước, hệ thống sẽ báo và không ghi đè. Khách lấy từ nhu cầu mua. Số tiền cọc là số thỏa thuận — tiền thực nhận ghi ở phần thu chi.</p>
          </form>
        </details>
      )}
      {p.canSell && p.saleStatus === "available" && p.demandOptions.length === 0 && <p className="text-xs text-ink-soft">Chưa có nhu cầu mua đang mở nào của anh/chị để giữ xe. Tạo nhu cầu mua trước.</p>}

      {p.manager && (
        <form action={action} className="flex items-center gap-2"><Hid intent="release_expired" />
          <button className="btn btn-ghost !py-1 text-sm" disabled={pending}>Nhả mọi giữ xe đã hết hạn</button>
          <span className="text-xs text-ink-soft">Giữ xe hết hạn cũng tự nhả khi có người giữ/cọc xe đó.</span></form>
      )}

      {history.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Lịch sử giữ/cọc của xe này</h3>
          <ul className="space-y-1 text-sm">
            {history.map((r) => (
              <li key={r.id} className="border-b border-line/60 pb-1">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>{RESERVATION_STATUS_LABEL[r.status]}</span>{" "}
                {r.code} · {RESERVATION_KIND_LABEL[r.kind]} · {r.customer?.full_name ?? "—"}{r.owner ? ` · ${r.owner.full_name}` : ""}
                {r.kind === "deposit" && toVnd(r.deposit_amount) !== null ? ` · cọc ${formatVnd(r.deposit_amount)}` : ""} · {formatDateTime(r.created_at)}
                {r.end_reason ? <span className="text-ink-soft"> — {r.end_reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.reservations.length === 0 && !p.publicInfo && !(p.canSell && p.saleStatus === "available") && <p className="text-sm text-ink-soft">Chưa có giữ/cọc nào.</p>}
      {p.finance && !p.canSell && <p className="text-xs text-ink-soft">Kế toán chỉ xem; việc giữ xe/đặt cọc do sales và quản lý thực hiện.</p>}
    </div>
  );
}
