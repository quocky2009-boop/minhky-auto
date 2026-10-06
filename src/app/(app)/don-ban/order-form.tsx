"use client";

import { useActionState, useState } from "react";
import { orderAction } from "./actions";
import type { ActionState } from "../nhu-cau/actions";
import type { DemandOption, QuoteOption, VehicleOption } from "./load";
import { formatVnd } from "@/lib/money";

type Row = { vehicle: string; price: string; quote: string };
type Props = {
  mode: "create" | "update"; requestId?: string; orderId?: string; version?: number;
  demands?: DemandOption[]; vehicles: VehicleOption[]; quotes: QuoteOption[];
  initial?: { contract_ref: string; contract_date: string; note: string; rows: Row[] };
};

/** Form lập/sửa đơn nháp: nhiều dòng xe, mỗi dòng giá bán và (tùy chọn) báo giá khách đã chấp nhận. Việc cần duyệt do database quyết định. */
export function OrderForm(p: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(orderAction, null);
  const [rows, setRows] = useState<Row[]>(p.initial?.rows.length ? p.initial.rows : [{ vehicle: "", price: "", quote: "" }]);
  const [demand, setDemand] = useState("");
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const quotesFor = (vehicle: string) => p.quotes.filter((q) => q.vehicle_id === vehicle && (p.mode === "update" || !demand || q.demand_id === demand));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="intent" value={p.mode} />
      {p.mode === "create" ? <input type="hidden" name="request_id" value={p.requestId} /> : <><input type="hidden" name="id" value={p.orderId} /><input type="hidden" name="version" value={p.version} /></>}
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}
      {p.mode === "create" && (
        <label className="block"><span className="label">Nhu cầu mua của khách *</span>
          <select name="demand_id" value={demand} onChange={(e) => setDemand(e.target.value)} className="field"><option value="">— Chọn nhu cầu —</option>
            {(p.demands ?? []).map((d) => <option key={d.id} value={d.id}>{d.code} · {d.customer_name}</option>)}</select><Err k="demand_id" /></label>
      )}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Xe trong đơn</h3>
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-line p-3 md:grid-cols-[2fr_1fr_1.5fr_auto]">
            <label><span className="label">Xe *</span>
              <select name="line_vehicle" value={r.vehicle} onChange={(e) => set(i, { vehicle: e.target.value, quote: "" })} className="field"><option value="">— Chọn xe —</option>
                {p.vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select><Err k={`line_vehicle_${i}`} /></label>
            <label><span className="label">Giá bán ghi trên hợp đồng *</span>
              <input name="line_price" value={r.price} onChange={(e) => set(i, { price: e.target.value })} className="field" placeholder="650tr" /><Err k={`line_price_${i}`} /></label>
            <label><span className="label">Báo giá khách đã chấp nhận (tùy chọn)</span>
              <select name="line_quote" value={r.quote} onChange={(e) => { const q = p.quotes.find((x) => x.id === e.target.value); set(i, { quote: e.target.value, ...(q ? { price: q.price } : {}) }); }} className="field">
                <option value="">— Không gắn báo giá —</option>
                {quotesFor(r.vehicle).map((q) => <option key={q.id} value={q.id}>{q.label} · {formatVnd(q.price)}</option>)}</select></label>
            <button type="button" className="btn btn-ghost self-end text-sig-red" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))} disabled={rows.length === 1}>Bỏ</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" onClick={() => setRows((rs) => [...rs, { vehicle: "", price: "", quote: "" }])}>+ Thêm xe</button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label><span className="label">Số hợp đồng bán (bắt buộc khi xác nhận)</span><input name="contract_ref" defaultValue={p.initial?.contract_ref ?? ""} className="field" /></label>
        <label><span className="label">Ngày ký hợp đồng</span><input type="date" name="contract_date" defaultValue={p.initial?.contract_date ?? ""} className="field" /><Err k="contract_date" /></label>
        <label><span className="label">Ghi chú</span><input name="note" defaultValue={p.initial?.note ?? ""} className="field" /></label>
      </div>
      <button className="btn btn-primary" disabled={pending}>{p.mode === "create" ? "Lập đơn bán (nháp)" : "Lưu đơn nháp"}</button>
      <p className="text-xs text-ink-soft">Mỗi xe chỉ nằm trong một đơn bán hiệu lực; người lập sau bị từ chối. Giá bán là giá ghi trên hợp đồng, chưa phải tiền đã thu. Giá thấp hơn mức cho phép sẽ cần quản lý duyệt khi xác nhận (anh/chị không xem được giá sàn).</p>
    </form>
  );
}
