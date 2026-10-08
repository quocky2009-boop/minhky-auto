"use client";

import Link from "next/link";
import { useActionState } from "react";
import { aftersalesAction } from "../../hau-mai/actions";
import type { ActionState } from "../../nhu-cau/actions";
import { formatDate } from "@/lib/dates";
import { CASE_KIND_LABEL, CASE_STATUS_LABEL, COMMITMENT_KIND_LABEL } from "@/lib/aftersales";
import type { CommitmentRow } from "../../hau-mai/load";

type Line = { id: string; label: string };
type CaseLite = { id: string; code: string; title: string; status: string; order_line_id: string; next_due: string | null };
type Props = { lines: Line[]; commitments: CommitmentRow[]; cases: CaseLite[]; manager: boolean; canOpen: boolean; today: string; requestIds: Record<string, { commitment: string; case: string }> };

/** Cam kết/bảo hành (quản lý ghi) và mở phiếu hậu mãi (quản lý hoặc sales phụ trách đơn) cho từng xe của đơn đã ký. */
export function AftersalesPanel({ lines, commitments, cases, manager, canOpen, today, requestIds }: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(aftersalesAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  return (
    <div className="space-y-5">
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}
      {lines.map((l) => {
        const cms = commitments.filter((c) => c.order_line_id === l.id);
        const active = cms.filter((c) => c.status === "active");
        const cs = cases.filter((c) => c.order_line_id === l.id);
        return (
          <div key={l.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
            <p className="font-medium">{l.label}</p>
            <h3 className="mt-2 text-sm font-semibold text-ink-soft">Cam kết / bảo hành</h3>
            {cms.length === 0 ? <p className="text-sm text-ink-soft">Chưa có cam kết hoặc bảo hành.</p> : (
              <ul className="space-y-1 text-sm">
                {cms.map((c) => (
                  <li key={c.id} className={c.status === "void" ? "text-ink-soft line-through" : ""}>
                    {c.code} · {COMMITMENT_KIND_LABEL[c.kind]} “{c.title}” · từ {formatDate(c.starts_on)}{c.ends_on ? ` đến ${formatDate(c.ends_on)}` : ""}{c.odo_limit ? ` · tối đa ${c.odo_limit.toLocaleString("vi-VN")} km` : ""}
                    {c.status === "void" ? ` · đã hủy: ${c.void_reason}` : manager && (
                      <form action={action} className="ml-2 inline-flex gap-1">
                        <input type="hidden" name="intent" value="commitment_void" /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="version" value={c.version} />
                        <input name="reason" placeholder="Lý do hủy" className="field !py-0.5 text-xs" aria-label="Lý do hủy" />
                        <button className="btn btn-ghost !py-0.5 text-xs" disabled={pending}>Hủy</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {manager && (
              <form action={action} className="mt-2 grid gap-2 md:grid-cols-4">
                <input type="hidden" name="intent" value="commitment" /><input type="hidden" name="order_line_id" value={l.id} /><input type="hidden" name="request_id" value={requestIds[l.id]?.commitment} />
                <label><span className="label">Loại *</span><select name="kind" defaultValue="warranty" className="field">{Object.entries(COMMITMENT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><Err k="kind" /></label>
                <label className="md:col-span-2"><span className="label">Tên *</span><input name="title" className="field" placeholder="Bảo hành thân vỏ 12 tháng" /><Err k="title" /></label>
                <label><span className="label">Bắt đầu *</span><input type="date" name="starts_on" defaultValue={today} className="field" /><Err k="starts_on" /></label>
                <label><span className="label">Hết hạn</span><input type="date" name="ends_on" className="field" /><Err k="ends_on" /></label>
                <label><span className="label">Tối đa (km)</span><input name="odo_limit" inputMode="numeric" className="field" placeholder="100000" /><Err k="odo_limit" /></label>
                <label className="md:col-span-2"><span className="label">Điều kiện / ghi chú</span><input name="details" className="field" /></label>
                <div className="md:col-span-4"><button className="btn btn-ghost" disabled={pending}>+ Ghi cam kết / bảo hành</button></div>
              </form>
            )}

            <h3 className="mt-4 text-sm font-semibold text-ink-soft">Phiếu hậu mãi</h3>
            {cs.length > 0 && (
              <ul className="mb-2 space-y-1 text-sm">
                {cs.map((c) => <li key={c.id}><Link href={`/hau-mai/${c.id}`} className="text-petrol hover:underline">{c.code}</Link> · {c.title} · {CASE_STATUS_LABEL[c.status]}{c.next_due && (c.status === "open" || c.status === "in_progress") ? ` · hạn ${formatDate(c.next_due)}` : ""}</li>)}
              </ul>
            )}
            {canOpen && (
              <form action={action} className="grid gap-2 md:grid-cols-4">
                <input type="hidden" name="intent" value="case_create" /><input type="hidden" name="order_line_id" value={l.id} /><input type="hidden" name="request_id" value={requestIds[l.id]?.case} />
                <label><span className="label">Loại *</span><select name="kind" defaultValue="complaint" className="field">{Object.entries(CASE_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><Err k="kind" /></label>
                <label className="md:col-span-3"><span className="label">Nội dung chính *</span><input name="title" className="field" placeholder="Khách báo tiếng ồn gầm xe" /><Err k="title" /></label>
                <label className="md:col-span-2"><span className="label">Mô tả</span><input name="description" className="field" /></label>
                <label><span className="label">Số km hiện tại</span><input name="odo_at_case" inputMode="numeric" className="field" /><Err k="odo_at_case" /></label>
                <label><span className="label">Gắn cam kết/bảo hành</span><select name="commitment_id" defaultValue="" className="field"><option value="">— Không —</option>{active.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select><Err k="commitment_id" /></label>
                <label className="md:col-span-2"><span className="label">Việc tiếp theo *</span><input name="next_action" className="field" placeholder="Gọi khách hẹn lịch kiểm tra" /><Err k="next_action" /></label>
                <label><span className="label">Hạn *</span><input type="date" name="next_due" min={today} className="field" /><Err k="next_due" /></label>
                <div className="flex items-end"><button className="btn btn-primary" disabled={pending}>Mở phiếu</button></div>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
