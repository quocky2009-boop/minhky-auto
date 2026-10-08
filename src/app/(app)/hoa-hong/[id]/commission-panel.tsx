"use client";

import { useActionState } from "react";
import { commissionAction } from "../actions";
import type { ActionState } from "../../nhu-cau/actions";
import { formatDate } from "@/lib/dates";
import { formatVnd, toVnd } from "@/lib/money";
import type { EntryRow, PaymentRow } from "../load";

type Account = { id: string; code: string; name: string; balance: unknown };
type Props = { e: EntryRow; payments: PaymentRow[]; manager: boolean; finance: boolean; accounts: Account[]; today: string; requestId: string };

export function CommissionPanel({ e, payments, manager, finance, accounts, today, requestId }: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(commissionAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const Hid = ({ intent }: { intent: string }) => <><input type="hidden" name="intent" value={intent} /><input type="hidden" name="id" value={e.id} /><input type="hidden" name="version" value={e.version} /></>;
  const live = e.status !== "cancelled";
  const remaining = toVnd(e.remaining);
  return (
    <div className="space-y-4">
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}

      {manager && live && e.status !== "approved" && (
        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Quản lý</h2>
          <div className="flex flex-wrap items-end gap-3">
            <form action={action}><Hid intent="recalc" /><button className="btn btn-ghost" disabled={pending}>Tính lại theo quy tắc hiện hành</button></form>
            {e.status === "accrued" && <form action={action}><Hid intent="approve" /><button className="btn btn-primary" disabled={pending}>Duyệt {formatVnd(e.amount)}</button></form>}
          </div>
          {e.status === "no_rule" && <p className="mt-2 text-sm text-[#8a6100]">Chưa có quy tắc nên chưa duyệt được. Thêm quy tắc ở “Quy tắc hoa hồng” rồi tính lại.</p>}
        </section>
      )}

      {finance && e.status === "approved" && (
        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Chi hoa hồng</h2>
          {remaining === 0n ? <p className="text-sm text-sig-green">Đã chi đủ.</p> : (
            <form action={action} className="grid gap-3 md:grid-cols-4">
              <input type="hidden" name="intent" value="pay" /><input type="hidden" name="entry_id" value={e.id} /><input type="hidden" name="request_id" value={requestId} />
              <label><span className="label">Số tiền *</span><input name="amount" defaultValue={remaining === null ? "" : remaining.toString()} className="field" /><Err k="amount" /></label>
              <label className="md:col-span-2"><span className="label">Tài khoản tiền *</span>
                <select name="account_id" defaultValue="" className="field"><option value="">— Chọn —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name} · còn {formatVnd(a.balance)}</option>)}</select><Err k="account_id" /></label>
              <label><span className="label">Ngày chi</span><input type="date" name="paid_on" max={today} defaultValue={today} className="field" /><Err k="paid_on" /></label>
              <label className="md:col-span-2"><span className="label">Chứng từ / số tham chiếu</span><input name="reference" className="field" /></label>
              <label className="md:col-span-2"><span className="label">Ghi chú</span><input name="note" className="field" /></label>
              <div className="md:col-span-4"><button className="btn btn-primary" disabled={pending}>Ghi chi</button></div>
            </form>
          )}
        </section>
      )}

      {payments.length > 0 && (
        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Các lần chi</h2>
          <ul className="space-y-1 text-sm">
            {payments.map((p) => (
              <li key={p.id} className={p.status === "void" ? "text-ink-soft line-through" : ""}>
                {formatDate(p.paid_on)} · {formatVnd(p.amount)} · {p.account ? `${p.account.code} ${p.account.name}` : "—"}{p.reference ? ` · ${p.reference}` : ""}{p.status === "void" ? ` · đã hủy: ${p.void_reason}` : ""}
                {p.status === "posted" && manager && (
                  <form action={action} className="ml-2 inline-flex gap-1">
                    <input type="hidden" name="intent" value="pay_void" /><input type="hidden" name="id" value={p.id} />
                    <input name="reason" placeholder="Lý do hủy" className="field !py-0.5 text-xs" aria-label="Lý do hủy" />
                    <button className="btn btn-ghost !py-0.5 text-xs" disabled={pending}>Hủy</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {manager && live && (
        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Hủy khoản hoa hồng</h2>
          <form action={action} className="flex flex-wrap items-end gap-2">
            <Hid intent="cancel" />
            <label className="grow"><span className="label">Lý do</span><input name="reason" className="field" /><Err k="reason" /></label>
            <button className="btn btn-ghost" disabled={pending} onClick={(ev) => { if (!window.confirm("Hủy khoản hoa hồng này?")) ev.preventDefault(); }}>Hủy khoản</button>
          </form>
          <p className="mt-1 text-xs text-ink-soft">Khoản đã có chi trả phải hủy các khoản chi trước.</p>
        </section>
      )}
    </div>
  );
}
