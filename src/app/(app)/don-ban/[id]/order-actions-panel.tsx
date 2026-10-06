"use client";

import { useActionState } from "react";
import { orderAction } from "../actions";
import type { ActionState } from "../../nhu-cau/actions";

type Props = { id: string; version: number; status: "draft" | "confirmed" | "cancelled"; manager: boolean; mine: boolean; needsApproval: boolean; contractRef: string; contractDate: string };

export function OrderActionsPanel(p: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(orderAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const confirm = (msg: string) => (e: React.MouseEvent) => { if (!window.confirm(msg)) e.preventDefault(); };
  const Hid = ({ intent }: { intent: string }) => <><input type="hidden" name="intent" value={intent} /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="version" value={p.version} /></>;
  const blocked = p.needsApproval && !p.manager;
  return (
    <div className="space-y-3">
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}
      {p.status === "draft" && p.mine && (
        blocked ? (
          <p className="rounded-md bg-[#fdf7e6] p-3 text-sm text-[#8a6100]">Có xe bán thấp hơn mức cho phép: chỉ quản lý/admin xác nhận được đơn này (kèm lý do duyệt). Nhờ quản lý mở đơn này để duyệt.</p>
        ) : (
          <form action={action} className="grid gap-2 rounded-md border border-line p-3 md:grid-cols-3"><Hid intent="confirm" />
            <label><span className="label">Số hợp đồng bán *</span><input name="contract_ref" defaultValue={p.contractRef} className="field" /><Err k="contract_ref" /></label>
            <label><span className="label">Ngày ký hợp đồng *</span><input type="date" name="contract_date" defaultValue={p.contractDate} className="field" /><Err k="contract_date" /></label>
            {p.needsApproval && <label><span className="label">Lý do duyệt giá thấp *</span><input name="approval_reason" className="field" /></label>}
            <button className="btn btn-primary md:w-fit" disabled={pending} onClick={confirm("Xác nhận đơn bán? Các xe trong đơn chuyển sang “đã bán”. Chỉ quản lý hủy được sau khi xác nhận.")}>Xác nhận đã ký hợp đồng</button>
          </form>
        )
      )}
      {p.status !== "cancelled" && (p.status === "draft" ? p.mine : p.manager) && (
        <details>
          <summary className="btn btn-ghost !py-1 cursor-pointer text-sm text-sig-red">Hủy đơn bán</summary>
          <form action={action} className="mt-2 flex gap-2"><Hid intent="cancel" />
            <input name="reason" className="field" placeholder="Lý do hủy *" aria-label="Lý do hủy đơn bán" required />
            <button className="btn btn-danger shrink-0" disabled={pending} onClick={confirm(p.status === "confirmed" ? "Hủy đơn đã ký hợp đồng? Xe trở lại trạng thái đang bán." : "Hủy đơn nháp này?")}>Hủy đơn</button></form>
        </details>
      )}
    </div>
  );
}
