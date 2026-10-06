"use client";

import { useActionState } from "react";
import { cashAction } from "./actions";
import type { ActionState } from "../nhu-cau/actions";
import type { AccountBalance } from "./load";
import { ACCOUNT_KIND_LABEL } from "@/lib/cashbook";
import { formatVnd } from "@/lib/money";

export function AccountsPanel({ accounts, manager, requestId }: { accounts: AccountBalance[]; manager: boolean; requestId: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(cashAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  return (
    <div className="space-y-3">
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}
      {accounts.length === 0 ? <p className="text-sm text-ink-soft">Chưa có tài khoản tiền. {manager ? "Lập tài khoản (tiền mặt/ngân hàng) trước khi ghi phiếu." : "Nhờ quản lý lập tài khoản tiền."}</p> : (
        <div className="grid gap-2 md:grid-cols-3">
          {accounts.map((a) => (
            <div key={a.id} className={`rounded-md border border-line p-3 text-sm ${a.is_active ? "" : "opacity-60"}`}>
              <div className="flex items-center justify-between"><b>{a.code} · {a.name}</b><span className="text-xs text-ink-soft">{ACCOUNT_KIND_LABEL[a.kind]}{a.is_active ? "" : " · ngừng dùng"}</span></div>
              <div className="num mt-1 text-lg font-semibold">{formatVnd(a.balance)}</div>
              <div className="text-xs text-ink-soft">Đầu kỳ {formatVnd(a.opening_balance)} · thu {formatVnd(a.total_in)} · chi {formatVnd(a.total_out)}</div>
              {manager && (
                <form action={action} className="mt-1"><input type="hidden" name="intent" value="toggle_account" /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="version" value={a.version} />
                  <input type="hidden" name="is_active" value={String(!a.is_active)} />
                  <button className="text-xs text-petrol hover:underline" disabled={pending}>{a.is_active ? "Ngừng sử dụng" : "Dùng lại"}</button></form>
              )}
            </div>
          ))}
        </div>
      )}
      {manager && (
        <details className="rounded-md border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-petrol">+ Lập tài khoản tiền</summary>
          <form action={action} className="mt-3 grid gap-3 md:grid-cols-4"><input type="hidden" name="intent" value="create_account" /><input type="hidden" name="request_id" value={requestId} />
            <label><span className="label">Tên *</span><input name="name" className="field" placeholder="Quỹ tiền mặt / Vietcombank…" /><Err k="name" /></label>
            <label><span className="label">Loại *</span><select name="kind" defaultValue="cash" className="field"><option value="cash">Tiền mặt</option><option value="bank">Ngân hàng</option></select><Err k="kind" /></label>
            <label><span className="label">Số dư đầu kỳ (nhập một lần)</span><input name="opening_balance" className="field" placeholder="0" /><Err k="opening_balance" /></label>
            <label><span className="label">Ghi chú</span><input name="note" className="field" /></label>
            <button className="btn btn-primary md:w-fit" disabled={pending}>Lập tài khoản</button>
            <p className="text-xs text-ink-soft md:col-span-4">Số dư đầu kỳ khóa khi đã có phiếu. Không ghi số tài khoản đầy đủ vào đây. Tài khoản không xóa được, chỉ ngừng sử dụng.</p>
          </form>
        </details>
      )}
    </div>
  );
}
