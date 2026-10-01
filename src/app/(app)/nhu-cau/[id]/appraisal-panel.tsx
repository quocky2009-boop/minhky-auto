"use client";

import { useActionState, useState } from "react";
import { appraisalAction } from "../appraisal-actions";
import type { ActionState } from "../actions";
import { RESULT_LABEL } from "@/lib/appraisal";
import type { AppraisalView, Template } from "./appraisal-load";

type Props = { demandId: string; templates: Template[]; appraisal: AppraisalView | null; saleMode: string; moneyDefaults: { proposed: string; approvedMax: string } };

export function AppraisalPanel({ demandId, templates, appraisal, saleMode, moneyDefaults }: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(appraisalAction, null);
  const [ev, setEv] = useState(appraisal?.is_ev ?? false);
  const [rejecting, setRejecting] = useState(false);
  const status = appraisal?.status ?? "draft";
  const locked = status !== "draft";
  const fe = s?.fieldErrors ?? {};
  const shown = templates.filter((t) => !t.ev_only || ev);
  const groups = [...new Set(shown.map((t) => t.grp))];
  const counts = shown.reduce((c, t) => {
    const r = appraisal?.items[t.key]?.result ?? "unchecked";
    if (t.is_required && r === "unchecked") c.missing++;
    if (r === "fail") c.fail++;
    return c;
  }, { missing: 0, fail: 0 });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="demand_id" value={demandId} />
      <input type="hidden" name="version" value={appraisal?.version ?? ""} />
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}

      <p className="text-sm">
        Trạng thái: <b>{!appraisal ? "Chưa thẩm định" : status === "draft" ? "Nháp" : status === "approved" ? "Đã duyệt mua" : "Không duyệt mua"}</b>
        {appraisal && status === "draft" && <span className="text-ink-soft"> · còn {counts.missing} mục bắt buộc chưa kiểm tra{counts.fail ? `, ${counts.fail} mục không đạt` : ""}</span>}
        {status === "rejected" && appraisal?.reject_reason && <span className="text-ink-soft"> · Lý do: {appraisal.reject_reason}</span>}
      </p>

      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_ev" checked={ev} disabled={locked} onChange={(e) => setEv(e.target.checked)} /> Xe điện (thêm mục pin và sạc bắt buộc)
      </label>

      {groups.map((g) => (
        <fieldset key={g} className="rounded-md border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{g}</legend>
          <ul className="space-y-2">
            {shown.filter((t) => t.grp === g).map((t) => {
              const it = appraisal?.items[t.key] ?? { result: "unchecked", note: "" };
              return (
                <li key={t.key} className="grid gap-1.5 md:grid-cols-[1fr_9rem_1fr] md:items-center">
                  <input type="hidden" name="item_keys" value={t.key} />
                  <span className="text-sm">{t.label}{t.is_required ? <span className="text-sig-red"> *</span> : null}</span>
                  <select name={`item_${t.key}`} defaultValue={it.result} disabled={locked} className="field !py-1.5 text-sm" aria-label={`Kết quả: ${t.label}`}>
                    {Object.entries(RESULT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <input name={`note_${t.key}`} defaultValue={it.note} disabled={locked} className="field !py-1.5 text-sm"
                    placeholder={t.requires_note_on_pass ? "Ghi số đo / bằng chứng" : "Ghi chú (bắt buộc nếu không đạt)"} aria-label={`Ghi chú: ${t.label}`} />
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      <p className="text-xs text-ink-soft">Mục chưa kiểm tra không được coi là đạt. Ảnh/video bằng chứng: tải ở mục “Tệp đính kèm” bên phải, ghi tên tệp vào ghi chú mục tương ứng.</p>

      <label className="block"><span className="label">Nhận xét thẩm định</span>
        <textarea name="summary" defaultValue={appraisal?.summary ?? ""} disabled={locked} rows={2} className="field" /></label>

      <div className="grid gap-3 md:grid-cols-2">
        <label><span className="label">Giá đề xuất mua (nội bộ)</span>
          <input name="proposed_price" defaultValue={moneyDefaults.proposed} disabled={locked} className="field" placeholder="600tr" />{fe.proposed_price && <span className="text-xs text-sig-red">{fe.proposed_price}</span>}</label>
        <label><span className="label">Giá mua TỐI ĐA được duyệt{saleMode === "consignment" ? " (không bắt buộc với xe ký gửi)" : " *"}</span>
          <input name="approved_max_price" defaultValue={moneyDefaults.approvedMax} disabled={locked} className="field" placeholder="650tr" />{fe.approved_max_price && <span className="text-xs text-sig-red">{fe.approved_max_price}</span>}</label>
      </div>
      <p className="text-xs text-ink-soft">Không có ngưỡng giá. Khi nhập kho, giá mua thực tế không được vượt giá tối đa đã duyệt ở đây. Giá chỉ quản lý/kế toán xem được.</p>

      <div className="flex flex-wrap items-center gap-2">
        {!locked && (<>
          <button name="intent" value="save" className="btn btn-ghost" disabled={pending}>Lưu nháp</button>
          <button name="intent" value="approve" className="btn btn-primary" disabled={pending}
            onClick={(e) => { if (!window.confirm("Duyệt mua xe này với nội dung thẩm định đang nhập?")) e.preventDefault(); }}>Lưu và duyệt mua</button>
          <button type="button" className="btn btn-danger" onClick={() => setRejecting((x) => !x)}>Không duyệt</button>
        </>)}
        {locked && <button name="intent" value="reopen" className="btn btn-ghost" disabled={pending}
          onClick={(e) => { if (!window.confirm("Mở lại thẩm định? Giá tối đa đã duyệt sẽ bị xóa và phải duyệt lại.")) e.preventDefault(); }}>Mở lại để sửa</button>}
      </div>
      {rejecting && !locked && (
        <div className="flex gap-2">
          <input name="reason" className="field" placeholder="Lý do không duyệt mua *" aria-label="Lý do không duyệt" />
          <button name="intent" value="reject" className="btn btn-danger shrink-0" disabled={pending}>Xác nhận không duyệt</button>
        </div>
      )}
    </form>
  );
}
