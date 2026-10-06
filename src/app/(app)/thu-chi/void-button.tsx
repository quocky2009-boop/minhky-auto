"use client";

import { useActionState } from "react";
import { cashAction } from "./actions";
import type { ActionState } from "../nhu-cau/actions";

export function VoidButton({ id, version }: { id: string; version: number }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(cashAction, null);
  return (
    <details className="inline-block">
      <summary className="cursor-pointer text-xs text-sig-red">Hủy phiếu</summary>
      <form action={action} className="mt-1 flex gap-1"><input type="hidden" name="intent" value="void" /><input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={version} />
        <input name="reason" className="field !py-1 text-xs" placeholder="Lý do hủy *" aria-label="Lý do hủy phiếu" required />
        <button className="btn btn-danger !py-1 text-xs" disabled={pending} onClick={(e) => { if (!window.confirm("Hủy phiếu này? Phiếu vẫn được lưu nhưng không còn tính vào quỹ/công nợ.")) e.preventDefault(); }}>Hủy</button></form>
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-xs ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}
    </details>
  );
}
