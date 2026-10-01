"use client";
import { useActionState } from "react";
import { setPassword } from "../actions";

export default function SetPasswordPage() {
  const [state, action, pending] = useActionState(setPassword, undefined);
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form action={action} className="panel w-full max-w-sm space-y-4 p-5">
        <h1 className="text-lg font-semibold">Đặt mật khẩu</h1>
        <div>
          <label className="label" htmlFor="password">Mật khẩu mới (tối thiểu 10 ký tự)</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="password2">Nhập lại mật khẩu</label>
          <input id="password2" name="password2" type="password" autoComplete="new-password" minLength={10} required className="field" />
        </div>
        {state?.error && <p role="alert" className="text-sm text-sig-red">{state.error}</p>}
        <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Đang lưu…" : "Lưu mật khẩu"}</button>
      </form>
    </main>
  );
}
