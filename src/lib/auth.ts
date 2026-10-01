import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canUse, type AppRole } from "@/lib/modules";

export type CurrentUser = { id: string; email: string | null; name: string; roles: AppRole[]; active: boolean };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name, is_active").eq("id", claims.sub).maybeSingle(),
    supabase.rpc("my_roles"),
  ]);
  return {
    id: claims.sub,
    email: (claims.email as string | undefined) ?? null,
    name: profile?.full_name ?? (claims.email as string | undefined) ?? "Người dùng",
    roles: ((roles as AppRole[] | null) ?? []),
    active: profile?.is_active ?? false,
  };
});

/** Chặn trang theo module (lớp điều hướng). Quyền dữ liệu vẫn do RLS quyết định. */
export async function requireModule(key: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/dang-nhap");
  if (!user.active || user.roles.length === 0) redirect("/chua-cap-quyen");
  if (!canUse(user.roles, key)) redirect("/tong-quan?khong-co-quyen=1");
  return user;
}
