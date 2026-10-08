"use client";

import { useActionState, useState } from "react";
import { commissionAction } from "../actions";
import type { ActionState } from "../../nhu-cau/actions";
import { SCOPE_LABEL } from "@/lib/commissions";

type Props = { makes: { id: string; name: string }[]; models: { id: string; make_id: string; name: string }[]; today: string; requestId: string; rules: { id: string; version: number; active: boolean }[] };

/** Thêm quy tắc (quản lý) và hủy quy tắc đang hiệu lực. Model để trống = mức chung cho cả hãng (quy tắc riêng của model được ưu tiên). */
export function RulePanel({ makes, models, today, requestId, rules }: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(commissionAction, null);
  const [scope, setScope] = useState("model");
  const [make, setMake] = useState("");
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const active = rules.filter((r) => r.active);
  return (
    <section className="panel p-4">
      <h2 className="mb-2 font-semibold">Thêm quy tắc</h2>
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`mb-2 text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}
      <form action={action} className="grid gap-3 md:grid-cols-4">
        <input type="hidden" name="intent" value="rule" /><input type="hidden" name="request_id" value={requestId} />
        <label><span className="label">Áp dụng cho *</span>
          <select name="scope" value={scope} onChange={(e) => setScope(e.target.value)} className="field">{Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><Err k="scope" /></label>
        {scope === "model" ? (
          <>
            <label><span className="label">Hãng *</span>
              <select name="make_id" value={make} onChange={(e) => setMake(e.target.value)} className="field"><option value="">— Chọn —</option>{makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><Err k="make_id" /></label>
            <label><span className="label">Model (trống = cả hãng)</span>
              <select name="model_id" defaultValue="" className="field"><option value="">Cả hãng</option>{models.filter((m) => m.make_id === make).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select><Err k="model_id" /></label>
          </>
        ) : (
          <label className="md:col-span-2"><span className="label">Số VIN *</span><input name="vin" className="field uppercase" placeholder="RLHXXXXXXXXXXXXXX" /><Err k="vin" /></label>
        )}
        <label><span className="label">Số tiền hoa hồng *</span><input name="amount" className="field" placeholder="5tr" /><Err k="amount" /></label>
        <label><span className="label">Áp dụng từ ngày *</span><input type="date" name="effective_from" defaultValue={today} className="field" /><Err k="effective_from" /></label>
        <label className="md:col-span-2"><span className="label">Ghi chú</span><input name="note" className="field" /></label>
        <div className="md:col-span-4"><button className="btn btn-primary" disabled={pending}>Ghi quy tắc</button></div>
      </form>
      {active.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-ink-soft">Hủy một quy tắc (nhập nhầm)</summary>
          <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="intent" value="rule_void" />
            <label><span className="label">Quy tắc</span>
              <select name="rule_pick" className="field" onChange={(e) => { const [id, v] = e.target.value.split("|"); const f = e.currentTarget.form; if (f) { (f.elements.namedItem("id") as HTMLInputElement).value = id; (f.elements.namedItem("version") as HTMLInputElement).value = v; } }} defaultValue="">
                <option value="">— Chọn —</option>{active.map((r, i) => <option key={r.id} value={`${r.id}|${r.version}`}>Quy tắc hiệu lực #{i + 1}</option>)}</select></label>
            <input type="hidden" name="id" /><input type="hidden" name="version" />
            <label className="grow"><span className="label">Lý do hủy *</span><input name="reason" className="field" /><Err k="reason" /></label>
            <button className="btn btn-ghost" disabled={pending}>Hủy quy tắc</button>
          </form>
          <p className="mt-1 text-xs text-ink-soft">Các khoản hoa hồng đã tính không đổi; dùng “Tính lại” trên từng khoản chưa duyệt nếu cần.</p>
        </details>
      )}
    </section>
  );
}
