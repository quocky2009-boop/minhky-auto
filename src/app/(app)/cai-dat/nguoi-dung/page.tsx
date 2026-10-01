import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasAdminKey } from "@/lib/supabase/admin";
import { ROLE_LABEL, type AppRole } from "@/lib/modules";
import { ErrorBox, PageHeader } from "@/components/ui";
import { setActive, toggleRole } from "./actions";
import { InviteForm } from "./invite-form";
import { ConfirmButton } from "@/components/confirm-button";

export const metadata = { title: "Người dùng & vai trò" };

export default async function UsersPage() {
  const me = await requireModule("users");
  const supabase = await createClient();
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, is_active, created_at").order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  const keyOk = hasAdminKey();
  return (
    <>
      <PageHeader title="Người dùng & vai trò" sub="Tài khoản nội bộ do quản trị viên mời. Quyền lấy từ bảng vai trò trong database, không từ dữ liệu người dùng tự sửa." />
      <section className="panel mb-4 p-4">
        <h2 className="mb-3 font-semibold">Mời nhân viên</h2>
        {!keyOk && <div className="mb-3"><ErrorBox message="Máy chủ chưa cấu hình SUPABASE_SECRET_KEY nên chưa gửi lời mời được. Các thao tác phân quyền bên dưới vẫn dùng được." /></div>}
        <InviteForm disabled={!keyOk} />
      </section>
      <section className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-ink-soft">
            <tr><th className="px-3 py-2 font-medium">Nhân viên</th>{Object.values(ROLE_LABEL).map((l) => <th key={l} className="px-2 py-2 text-center font-medium">{l}</th>)}<th className="px-3 py-2 font-medium">Tài khoản</th></tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => {
              const mine = (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole);
              return (
                <tr key={p.id} className={`border-b border-line last:border-0 ${p.is_active ? "" : "text-ink-soft"}`}>
                  <td className="px-3 py-2 font-medium">{p.full_name}{p.id === me.id ? " (tôi)" : ""}</td>
                  {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => {
                    const on = mine.includes(r);
                    const locked = p.id === me.id && r === "admin";
                    return (
                      <td key={r} className="px-2 py-2 text-center">
                        <form action={toggleRole}>
                          <input type="hidden" name="user_id" value={p.id} /><input type="hidden" name="role" value={r} /><input type="hidden" name="on" value={on ? "0" : "1"} />
                          <button disabled={locked} aria-pressed={on} aria-label={`${on ? "Gỡ" : "Cấp"} vai trò ${ROLE_LABEL[r]} cho ${p.full_name}`}
                            className={`h-6 w-6 rounded border ${on ? "border-petrol bg-petrol text-white" : "border-line bg-surface"} disabled:opacity-60`}>{on ? "✓" : ""}</button>
                        </form>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    {p.id === me.id ? "Đang hoạt động" : (
                      <form action={setActive}>
                        <input type="hidden" name="user_id" value={p.id} /><input type="hidden" name="active" value={p.is_active ? "0" : "1"} />
                        <ConfirmButton message={p.is_active ? `Khóa tài khoản ${p.full_name}? Người này sẽ mất mọi quyền truy cập.` : `Mở khóa tài khoản ${p.full_name}?`}
                          className={`btn !py-1 text-xs ${p.is_active ? "btn-danger" : "btn-ghost"}`}>{p.is_active ? "Khóa" : "Mở khóa"}</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
