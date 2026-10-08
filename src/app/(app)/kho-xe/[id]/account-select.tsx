import { formatVnd } from "@/lib/money";

export type AccountOption = { id: string; code: string; name: string; balance: unknown };

/** Chọn tài khoản tiền cho khoản có tiền thật (D87). Bỏ trống chỉ đúng với vốn cam kết hoặc khi bên là công ty (tiền công ty đã nằm trong sổ quỹ). */
export function AccountSelect({ accounts, hint, error }: { accounts: AccountOption[]; hint?: string; error?: string }) {
  return (
    <label className="md:col-span-2">
      <span className="label">Tài khoản tiền {hint ? <span className="font-normal text-ink-soft">({hint})</span> : null}</span>
      <select name="account_id" defaultValue="" className="field"><option value="">— Không gắn tài khoản —</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name} · còn {formatVnd(a.balance)}</option>)}</select>
      {error ? <span className="mt-1 block text-xs text-sig-red">{error}</span> : null}
    </label>
  );
}
