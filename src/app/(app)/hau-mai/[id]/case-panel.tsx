"use client";

import { useActionState } from "react";
import { aftersalesAction } from "../actions";
import type { ActionState } from "../../nhu-cau/actions";
import { formatDateTime } from "@/lib/dates";
import { formatVnd, toVnd } from "@/lib/money";
import { COST_STATUS_LABEL } from "@/lib/costs";
import { dueState } from "@/lib/aftersales";
import type { CaseCost, CaseRow, EventRow } from "../load";

type Props = { c: CaseRow; events: EventRow[]; costs: CaseCost[]; staff: { id: string; full_name: string }[]; manager: boolean; canEdit: boolean; finance: boolean; today: string; costRequestId: string };

export function CasePanel({ c, events, costs, staff, manager, canEdit, finance, today, costRequestId }: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(aftersalesAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const Hid = ({ intent }: { intent: string }) => <><input type="hidden" name="intent" value={intent} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="version" value={c.version} /></>;
  const open = c.status === "open" || c.status === "in_progress";
  const ds = dueState(c.status, c.next_due);
  return (
    <div className="space-y-4">
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}

      {open && (
        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Việc tiếp theo</h2>
          <p className={`text-sm ${ds === "overdue" ? "font-semibold text-sig-red" : ds === "today" ? "font-semibold text-[#8a6100]" : ""}`}>{c.next_action} · hạn {c.next_due ? c.next_due.split("-").reverse().join("/") : "—"}{ds === "overdue" ? " · quá hạn" : ds === "today" ? " · hôm nay" : ""}</p>
          {canEdit && (
            <form action={action} className="mt-3 grid gap-3 md:grid-cols-3">
              <Hid intent="next" />
              <label className="md:col-span-2"><span className="label">Việc tiếp theo *</span><input name="next_action" defaultValue={c.next_action ?? ""} className="field" /><Err k="next_action" /></label>
              <label><span className="label">Hạn *</span><input type="date" name="next_due" min={today} defaultValue={c.next_due ?? ""} className="field" /><Err k="next_due" /></label>
              {manager && (
                <label><span className="label">Người phụ trách</span>
                  <select name="assigned_to" defaultValue="" className="field"><option value="">Giữ nguyên ({c.assignee?.full_name ?? "—"})</option>{staff.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></label>
              )}
              <div className="md:col-span-3"><button className="btn btn-primary" disabled={pending}>{c.status === "open" ? "Bắt đầu xử lý / lưu" : "Lưu việc tiếp theo"}</button></div>
            </form>
          )}
        </section>
      )}

      {finance && (
        <section className="panel p-4">
          <h2 className="mb-1 font-semibold">Chi phí sau bán của phiếu</h2>
          <p className="mb-2 text-xs text-ink-soft">Chi phí quay về đúng xe. Dùng đúng quy trình: dự kiến → xác nhận số thực tế → thanh toán (ở trang xe). Chi phí phát sinh sau khi quyết toán đã duyệt làm quyết toán “lỗi thời” → quản lý lập điều chỉnh.</p>
          {costs.length === 0 ? <p className="text-sm text-ink-soft">Chưa có chi phí sau bán.</p> : (
            <ul className="space-y-1 text-sm">
              {costs.map((x) => <li key={x.id}>{x.code} · {x.description} · <span className="text-ink-soft">{COST_STATUS_LABEL[x.status]}</span> · {x.status === "confirmed" ? formatVnd(x.confirmed_amount) : toVnd(x.estimated_amount) === null ? "chưa có dự toán" : `dự kiến ${formatVnd(x.estimated_amount)}`}</li>)}
            </ul>
          )}
          {c.status !== "cancelled" && (
            <form action={action} className="mt-3 grid gap-3 md:grid-cols-4">
              <input type="hidden" name="intent" value="cost" /><input type="hidden" name="case_id" value={c.id} /><input type="hidden" name="vehicle_id" value={c.vehicle_id} />
              <input type="hidden" name="business_type" value={c.vehicle?.business_type ?? ""} /><input type="hidden" name="request_id" value={costRequestId} />
              <label className="md:col-span-2"><span className="label">Nội dung chi phí *</span><input name="description" className="field" placeholder="Thay giảm xóc theo bảo hành" /><Err k="description" /></label>
              <label><span className="label">Dự toán</span><input name="estimated_amount" className="field" placeholder="3tr" /><Err k="estimated_amount" /></label>
              <label><span className="label">Đơn vị thực hiện</span><input name="vendor" className="field" /></label>
              {c.vehicle?.business_type === "consignment" && (
                <label><span className="label">Bên chịu *</span><select name="borne_by" defaultValue="" className="field"><option value="">— Chọn —</option><option value="showroom">Showroom chịu</option><option value="owner">Chủ xe chịu</option></select><Err k="borne_by" /></label>
              )}
              <div className="md:col-span-4"><button className="btn btn-primary" disabled={pending}>Ghi chi phí sau bán</button></div>
            </form>
          )}
        </section>
      )}

      <section className="panel p-4">
        <h2 className="mb-2 font-semibold">Nhật ký</h2>
        {c.status !== "cancelled" && (
          <form action={action} className="mb-3 grid gap-2 md:grid-cols-[10rem_1fr_auto]">
            <input type="hidden" name="intent" value="event" /><input type="hidden" name="case_id" value={c.id} />
            <select name="event_kind" defaultValue="contact" className="field"><option value="contact">Liên hệ khách</option><option value="note">Ghi chú</option></select>
            <label><input name="content" className="field" placeholder="Nội dung (ví dụ: đã gọi khách, hẹn 9h sáng mai)" /><Err k="content" /></label>
            <button className="btn btn-ghost" disabled={pending}>Ghi</button>
          </form>
        )}
        <ul className="space-y-1 text-sm">
          {events.map((e) => <li key={e.id}><span className="text-ink-soft">{formatDateTime(e.created_at)} · {e.author?.full_name ?? "—"}{e.kind === "status" ? " · hệ thống" : ""}:</span> {e.content}</li>)}
        </ul>
      </section>

      {c.status === "resolved" && (
        <section className="panel p-4">
          <h2 className="mb-1 font-semibold">Kết quả xử lý</h2>
          <p className="text-sm">{c.resolution}</p>
          {manager && (
            <form action={action} className="mt-3 grid gap-3 md:grid-cols-3">
              <Hid intent="reopen" />
              <label className="md:col-span-2"><span className="label">Mở lại: việc tiếp theo *</span><input name="next_action" className="field" /><Err k="next_action" /></label>
              <label><span className="label">Hạn *</span><input type="date" name="next_due" min={today} className="field" /><Err k="next_due" /></label>
              <div className="md:col-span-3"><button className="btn btn-ghost" disabled={pending}>Mở lại phiếu</button></div>
            </form>
          )}
        </section>
      )}

      {c.status === "cancelled" && <section className="panel p-4 text-sm"><h2 className="mb-1 font-semibold">Đã hủy</h2><p>{c.end_reason}</p></section>}

      {open && canEdit && (
        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Đóng phiếu</h2>
          <form action={action} className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Hid intent="resolve" />
            <label><span className="label">Kết quả xử lý *</span><textarea name="resolution" rows={2} className="field" /><Err k="resolution" /></label>
            <div className="flex items-end"><button className="btn btn-primary" disabled={pending}>Đã xử lý xong</button></div>
          </form>
          <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
            <Hid intent="cancel" />
            <label className="grow"><span className="label">Hủy phiếu: lý do</span><input name="reason" className="field" /><Err k="reason" /></label>
            <button className="btn btn-ghost" disabled={pending} onClick={(e) => { if (!window.confirm("Hủy phiếu hậu mãi này?")) e.preventDefault(); }}>Hủy phiếu</button>
          </form>
        </section>
      )}
    </div>
  );
}
