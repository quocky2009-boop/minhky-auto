"use client";

import { useActionState } from "react";
import { reassignDemand, shareDemand, uploadAttachment, type ActionState } from "../actions";

const Msg = ({ s }: { s: ActionState }) =>
  s?.message ? <p role="status" className={`mt-2 text-xs ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p> : null;

export function ReassignForm({ demandId, version, ownerId, sellers }: { demandId: string; version: number; ownerId: string | null; sellers: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(reassignDemand, null);
  return (
    <form action={action} className="space-y-2"
      onSubmit={(e) => { if (!confirm("Đổi người phụ trách nhu cầu này?")) e.preventDefault(); }}>
      <input type="hidden" name="demand_id" value={demandId} /><input type="hidden" name="version" value={version} />
      <select name="owner_id" defaultValue={ownerId ?? ""} className="field" aria-label="Người phụ trách mới">
        {sellers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <input name="note" className="field" placeholder="Lý do (không bắt buộc)" />
      <button className="btn btn-ghost w-full" disabled={pending}>Đổi người phụ trách</button>
      <Msg s={s} />
    </form>
  );
}

export function ShareForm({ demandId, candidates }: { demandId: string; candidates: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(shareDemand, null);
  if (candidates.length === 0) return null;
  return (
    <form action={action} className="flex gap-2">
      <input type="hidden" name="demand_id" value={demandId} />
      <select name="user_id" className="field" aria-label="Chia sẻ cho">
        {candidates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <button className="btn btn-ghost shrink-0" disabled={pending}>Chia sẻ</button>
      <Msg s={s} />
    </form>
  );
}

export function UploadForm({ demandId }: { demandId: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(uploadAttachment, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="demand_id" value={demandId} />
      <input type="file" name="file" accept="image/*,video/*,application/pdf" className="block w-full text-sm" required />
      <button className="btn btn-ghost w-full" disabled={pending}>{pending ? "Đang tải lên…" : "Tải tệp lên"}</button>
      <Msg s={s} />
    </form>
  );
}
