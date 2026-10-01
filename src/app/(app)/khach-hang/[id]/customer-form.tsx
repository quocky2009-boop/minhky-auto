"use client";

import { useActionState } from "react";
import { updateCustomer } from "../actions";
import type { ActionState } from "../../nhu-cau/actions";

type C = { id: string; version: number; full_name: string; phone: string | null; area: string | null; address: string | null; source_id: string | null; notes: string | null };

export function CustomerForm({ c, sources }: { c: C; sources: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(updateCustomer, null);
  const fe = s?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={c.id} /><input type="hidden" name="version" value={c.version} />
      {s?.message && <p role="status" className={`text-sm md:col-span-2 ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}
      <label><span className="label">Họ tên *</span><input name="full_name" defaultValue={c.full_name} className="field" />{fe.full_name && <span className="text-xs text-sig-red">{fe.full_name}</span>}</label>
      <label><span className="label">Số điện thoại</span><input name="phone" defaultValue={c.phone ?? ""} inputMode="tel" className="field" />{fe.phone && <span className="text-xs text-sig-red">{fe.phone}</span>}</label>
      <label><span className="label">Khu vực</span><input name="area" defaultValue={c.area ?? ""} className="field" /></label>
      <label><span className="label">Nguồn khách</span>
        <select name="source_id" defaultValue={c.source_id ?? ""} className="field"><option value="">Chưa rõ</option>{sources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      </label>
      <label className="md:col-span-2"><span className="label">Địa chỉ</span><input name="address" defaultValue={c.address ?? ""} className="field" /></label>
      <label className="md:col-span-2"><span className="label">Ghi chú</span><textarea name="notes" defaultValue={c.notes ?? ""} rows={2} className="field" /></label>
      <div><button className="btn btn-primary" disabled={pending}>{pending ? "Đang lưu…" : "Lưu thông tin khách"}</button></div>
    </form>
  );
}
