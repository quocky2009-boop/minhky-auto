"use client";

import { useActionState } from "react";
import { handoverAction } from "../actions";
import type { ActionState } from "../../nhu-cau/actions";
import { EXCEPTION_LABEL, HOLDER_LABEL, ITEM_STATE_LABEL, RELATION_LABEL, readinessSummary, type Readiness } from "@/lib/handover";
import { formatDateTime } from "@/lib/dates";
import type { ExceptionRow, HandoverRow, ItemRow } from "../load";

type Props = { h: HandoverRow; items: ItemRow[]; exceptions: ExceptionRow[]; readiness: Readiness | null; manager: boolean; canEdit: boolean; today: string; requestId: string };

export function HandoverPanel({ h, items, exceptions, readiness, manager, canEdit, today, requestId }: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(handoverAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const confirm = (msg: string) => (e: React.MouseEvent) => { if (!window.confirm(msg)) e.preventDefault(); };
  const open = h.status === "preparing";
  const sum = readiness ? readinessSummary(readiness) : null;
  const groups = [...new Set(items.map((i) => i.grp))];
  const Hid = ({ intent }: { intent: string }) => <><input type="hidden" name="intent" value={intent} /><input type="hidden" name="id" value={h.id} /><input type="hidden" name="version" value={h.version} /></>;
  const activeKinds = new Set(exceptions.filter((e) => e.status === "active").map((e) => e.kind));
  return (
    <div className="space-y-4">
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}

      {sum && (
        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Điều kiện giao xe</h2>
          <ul className="space-y-1 text-sm">
            <li>{sum.contractOk ? "✔" : "✘"} Đơn bán đã ký hợp đồng {!sum.contractOk && <span className="text-sig-red">(không miễn được)</span>}</li>
            {sum.items.map((x) => (
              <li key={x.kind}>{x.ok ? "✔" : x.waived ? "◐" : "✘"} {x.label}
                {x.waived && <span className="text-[#8a6100]"> — đã được quản lý phê duyệt ngoại lệ</span>}</li>
            ))}
          </ul>
          {open && <p className={`mt-2 text-sm font-semibold ${sum.canDeliver ? "text-sig-green" : "text-sig-red"}`}>{sum.canDeliver ? "Đủ điều kiện giao xe." : "Chưa đủ điều kiện giao xe."}</p>}
        </section>
      )}

      <section className="panel p-4">
        <h2 className="mb-2 font-semibold">Checklist bàn giao</h2>
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <h3 className="mb-1 text-sm font-semibold text-ink-soft">{g}</h3>
            <ul className="space-y-2">
              {items.filter((i) => i.grp === g).map((i) => (
                <li key={i.template_key} className="rounded-md border border-line p-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><b>{i.label}</b>{i.is_required && <span className="text-sig-red"> *</span>}</span>
                    <span className={i.state === "ok" ? "text-sig-green" : i.state === "missing" ? "text-sig-red" : "text-ink-soft"}>{ITEM_STATE_LABEL[i.state]}
                      {i.state !== "pending" && i.state !== "na" ? ` · ${i.has_original ? "có bản gốc" : "không có bản gốc"}${i.has_scan ? ", có bản scan" : ""}${i.holder ? ` · ${HOLDER_LABEL[i.holder]}` : ""}` : ""}</span>
                  </div>
                  {i.note && <p className="text-xs text-ink-soft">{i.note}</p>}
                  {open && canEdit && (
                    <details className="mt-1"><summary className="cursor-pointer text-xs text-petrol">Cập nhật</summary>
                      <form action={action} className="mt-2 grid gap-2 md:grid-cols-4"><input type="hidden" name="intent" value="item" /><input type="hidden" name="id" value={h.id} /><input type="hidden" name="template_key" value={i.template_key} /><input type="hidden" name="item_version" value={i.version} />
                        <label><span className="label">Trạng thái</span><select name="state" defaultValue={i.state === "pending" ? "ok" : i.state} className="field">{Object.entries(ITEM_STATE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="state" /></label>
                        <label><span className="label">Người giữ bản gốc</span><select name="holder" defaultValue={i.holder ?? ""} className="field"><option value="">—</option>{Object.entries(HOLDER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="holder" /></label>
                        <div className="flex items-end gap-3 text-sm"><label className="inline-flex items-center gap-1"><input type="checkbox" name="has_original" defaultChecked={i.has_original} /> Có bản gốc</label>
                          <label className="inline-flex items-center gap-1"><input type="checkbox" name="has_scan" defaultChecked={i.has_scan} /> Có bản scan</label></div>
                        <label><span className="label">Ghi chú</span><input name="note" defaultValue={i.note ?? ""} className="field" /><Err k="note" /></label>
                        <button className="btn btn-primary md:w-fit" disabled={pending}>Lưu mục</button></form></details>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-ink-soft">Bản scan chỉ ghi “đã có” (hệ thống không lưu tệp giấy tờ). Ảnh/video xe lúc giao: dùng khối “Ảnh và video” ở trang xe.</p>
      </section>

      <section className="panel p-4">
        <h2 className="mb-2 font-semibold">Phê duyệt ngoại lệ</h2>
        {exceptions.length === 0 ? <p className="text-sm text-ink-soft">Chưa có ngoại lệ nào.</p> : (
          <ul className="space-y-1 text-sm">
            {exceptions.map((e) => (
              <li key={e.id} className={e.status === "revoked" ? "text-ink-soft line-through" : ""}>
                <b>{EXCEPTION_LABEL[e.kind]}</b> · {e.reason} · {e.approver?.full_name ?? "—"} · {formatDateTime(e.approved_at)}{e.status === "revoked" ? <span className="no-underline"> · ĐÃ THU HỒI: {e.revoke_reason}</span> : null}
                {manager && open && e.status === "active" && (
                  <details className="ml-2 inline-block"><summary className="cursor-pointer text-xs text-sig-red no-underline">Thu hồi</summary>
                    <form action={action} className="mt-1 flex gap-1"><Hid intent="revoke" /><input type="hidden" name="exception_id" value={e.id} />
                      <input name="reason" className="field !py-1 text-xs" placeholder="Lý do thu hồi *" aria-label="Lý do thu hồi" required />
                      <button className="btn btn-danger !py-1 text-xs" disabled={pending}>Thu hồi</button></form></details>
                )}
              </li>
            ))}
          </ul>
        )}
        {manager && open && (
          <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-petrol">+ Phê duyệt ngoại lệ</summary>
            <form action={action} className="mt-2 grid gap-2 md:grid-cols-3"><Hid intent="grant" /><input type="hidden" name="handover_id" value={h.id} /><input type="hidden" name="request_id" value={requestId} />
              <label><span className="label">Điều kiện được miễn *</span><select name="kind" defaultValue="" className="field"><option value="">— Chọn —</option>
                {Object.entries(EXCEPTION_LABEL).filter(([k]) => !activeKinds.has(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="kind" /></label>
              <label className="md:col-span-2"><span className="label">Lý do *</span><input name="reason" className="field" /><Err k="reason" /></label>
              <button className="btn btn-primary md:w-fit" disabled={pending} onClick={confirm("Phê duyệt ngoại lệ cho phép giao xe dù chưa đủ điều kiện này? Việc này được ghi lại.")}>Phê duyệt</button>
              <p className="text-xs text-ink-soft md:col-span-3">Ví dụ: ngân hàng đã duyệt vay nhưng chưa giải ngân. Hợp đồng chưa ký thì không có ngoại lệ.</p>
            </form></details>
        )}
      </section>

      {open && canEdit && (
        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Giao xe</h2>
          <form action={action} className="grid gap-3 md:grid-cols-3"><Hid intent="deliver" />
            <label><span className="label">Ngày giao *</span><input type="date" name="delivered_on" defaultValue={today} max={today} className="field" /><Err k="delivered_on" /></label>
            <label><span className="label">Người nhận xe *</span><input name="received_by_name" defaultValue={h.customer?.full_name ?? ""} className="field" /><Err k="received_by_name" /></label>
            <label><span className="label">Quan hệ *</span><select name="received_relation" defaultValue="customer" className="field">{Object.entries(RELATION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="received_relation" /></label>
            <label><span className="label">Số ODO lúc giao (km) *</span><input name="odo" inputMode="numeric" className="field" /><Err k="odo" /></label>
            <label><span className="label">Số chìa khóa giao *</span><input name="keys_given" inputMode="numeric" className="field" /><Err k="keys_given" /></label>
            <label><span className="label">Ghi chú</span><input name="note" className="field" /></label>
            <button className="btn btn-primary md:w-fit" disabled={pending} onClick={confirm("Xác nhận đã giao xe? Xe chuyển sang “đã giao” và không sửa được nữa.")}>Xác nhận đã giao xe</button>
          </form>
          <details className="mt-3"><summary className="cursor-pointer text-sm text-sig-red">Hủy bàn giao</summary>
            <form action={action} className="mt-2 flex gap-2"><Hid intent="cancel" />
              <input name="reason" className="field" placeholder="Lý do hủy *" aria-label="Lý do hủy bàn giao" required />
              <button className="btn btn-danger shrink-0" disabled={pending} onClick={confirm("Hủy bàn giao? Mỗi dòng xe chỉ có một bàn giao, hủy rồi không lập lại được.")}>Hủy</button></form></details>
        </section>
      )}
    </div>
  );
}
