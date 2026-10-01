"use client";

import { useActionState, useState } from "react";
import { logActivity, type ActionState } from "../actions";
import { CHANNEL_LABEL, NEEDS_NEXT_ACTION, statusLabel } from "@/lib/labels";

type Props = {
  demandId: string; requestId: string; kind: "buy" | "sell"; status: string; version: number;
  allowed: string[]; hasNext: boolean; defaultDue: string;
};

export function ActivityForm(p: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(logActivity, null);
  const [newStatus, setNewStatus] = useState("");
  const target = newStatus || p.status;
  const needNext = NEEDS_NEXT_ACTION(target) && (!p.hasNext || newStatus !== "");
  const needReason = newStatus === "closed" || newStatus === "paused";
  const fe = state?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="demand_id" value={p.demandId} />
      <input type="hidden" name="request_id" value={p.requestId} />
      <input type="hidden" name="current_status" value={p.status} />
      <input type="hidden" name="version" value={p.version} />
      <input type="hidden" name="has_next" value={p.hasNext && newStatus === "" ? "1" : ""} />
      {state?.message && (
        <p role="status" className={`text-sm ${state.ok ? "text-sig-green" : "text-sig-red"}`}>{state.message}</p>
      )}
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <label><span className="label">Kênh</span>
          <select name="channel" className="field" defaultValue="call">
            {Object.entries(CHANNEL_LABEL).filter(([k]) => k !== "system").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label><span className="label">Kết quả</span><input name="result" className="field" placeholder="Khách hẹn cuối tuần xem xe" /></label>
      </div>
      <label className="block"><span className="label">Nội dung trao đổi *</span>
        <textarea name="content" rows={2} className="field" required /><Err k="content" />
      </label>
      {p.allowed.length > 0 && (
        <label className="block"><span className="label">Chuyển trạng thái</span>
          <select name="new_status" className="field" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
            <option value="">Giữ nguyên — {statusLabel(p.kind, p.status)}</option>
            {p.allowed.map((s) => <option key={s} value={s}>{statusLabel(p.kind, s)}</option>)}
          </select>
        </label>
      )}
      {needReason && (
        <label className="block"><span className="label">Lý do {newStatus === "closed" ? "đóng" : "tạm dừng"} *</span>
          <input name="reason" className="field" placeholder={newStatus === "closed" ? "Khách đã mua nơi khác / không liên lạc được…" : "Khách hẹn sau Tết…"} />
          <Err k="reason" />
        </label>
      )}
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <label><span className="label">Việc tiếp theo{needNext ? " *" : ""}</span>
          <input name="next_action" className="field" placeholder="Gửi ảnh xe / hẹn lái thử" /><Err k="next_action" />
        </label>
        <label><span className="label">Hạn</span><input type="datetime-local" name="next_due" defaultValue={needNext ? p.defaultDue : ""} className="field" /><Err k="next_due" /></label>
      </div>
      {needNext && <p className="text-xs text-ink-soft">Nhu cầu đang xử lý phải có việc tiếp theo và hạn — để không ai bị bỏ quên.</p>}
      <button className="btn btn-primary w-full md:w-auto" disabled={pending}>{pending ? "Đang lưu…" : "Ghi nhật ký"}</button>
    </form>
  );
}
