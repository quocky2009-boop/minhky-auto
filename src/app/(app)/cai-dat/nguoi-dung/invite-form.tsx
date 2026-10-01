"use client";

import { useActionState } from "react";
import { inviteUser } from "./actions";
import type { ActionState } from "../../nhu-cau/actions";
import { ROLE_LABEL } from "@/lib/modules";

export function InviteForm({ disabled }: { disabled: boolean }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(inviteUser, null);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
      {s?.message && <p role="status" className={`text-sm md:col-span-3 ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}
      <label><span className="label">Họ tên</span><input name="full_name" className="field" required /></label>
      <label><span className="label">Email</span><input name="email" type="email" className="field" required /></label>
      <button className="btn btn-primary" disabled={pending || disabled}>{pending ? "Đang mời…" : "Gửi lời mời"}</button>
      <fieldset className="md:col-span-3">
        <legend className="label">Vai trò</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {Object.entries(ROLE_LABEL).map(([k, l]) => (
            <label key={k} className="inline-flex items-center gap-1.5"><input type="checkbox" name="roles" value={k} defaultChecked={k === "sales"} /> {l}</label>
          ))}
        </div>
      </fieldset>
    </form>
  );
}
