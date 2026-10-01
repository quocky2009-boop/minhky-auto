import { signOut } from "../actions";

export default function NoRolePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="panel max-w-sm space-y-3 p-5">
        <h1 className="text-lg font-semibold">Tài khoản chưa được cấp vai trò</h1>
        <p className="text-sm text-ink-soft">Anh/chị đã đăng nhập nhưng chưa được giao vai trò, hoặc tài khoản đang bị khóa. Liên hệ quản trị để được cấp quyền.</p>
        <form action={signOut}><button className="btn btn-ghost">Đăng xuất</button></form>
      </div>
    </main>
  );
}
