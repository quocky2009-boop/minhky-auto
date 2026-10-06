"use client";

import { useActionState } from "react";
import { settlementAction } from "../../quyet-toan/actions";
import type { ActionState } from "../../nhu-cau/actions";

export function SettlementCreate({ lineId, requestId }: { lineId: string; requestId: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(settlementAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2"><input type="hidden" name="intent" value="create" /><input type="hidden" name="request_id" value={requestId} /><input type="hidden" name="order_line_id" value={lineId} />
      <button className="btn btn-primary !py-1 text-sm" disabled={pending}>Tạm tính quyết toán</button>
      {s?.message && <span role="alert" className="text-xs text-sig-red">{s.message}</span>}
    </form>
  );
}
