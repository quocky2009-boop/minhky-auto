import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-2xl font-bold tracking-tight text-ink">Minh Kỳ Auto</p>
          <p className="mt-1 text-sm text-ink-soft">Showroom 212 Trường Chinh — hệ thống nội bộ</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-xs leading-relaxed text-ink-soft">
          Tài khoản do quản trị cấp. Quên mật khẩu hoặc chưa có tài khoản, liên hệ quản lý showroom.
        </p>
      </div>
    </main>
  );
}
