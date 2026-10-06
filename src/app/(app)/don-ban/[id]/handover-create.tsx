"use client";

import { useActionState } from "react";
import { handoverAction } from "../../ban-giao/actions";
import type { ActionState } from "../../nhu-cau/actions";

export function HandoverCreate({ lineId, requestId }: { lineId: string; requestId: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(handoverAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2"><input type="hidden" name="intent" value="create" /><input type="hidden" name="request_id" value={requestId} /><input type="hidden" name="order_line_id" value={lineId} />
      <input type="date" name="planned_on" className="field !py-1" aria-label="Ngày hẹn giao" />
      <button className="btn btn-primary !py-1 text-sm" disabled={pending}>Lập bàn giao</button>
      {s?.message && <span role="alert" className="text-xs text-sig-red">{s.message}</span>}
    </form>
  );
}
