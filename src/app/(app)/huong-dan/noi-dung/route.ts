import { getCurrentUser } from "@/lib/auth";
import { canUse } from "@/lib/modules";
import { SALES_GUIDE_HTML } from "@/content/sales-guide";

/** Nội dung hướng dẫn (chỉ người đăng nhập có quyền; trang /huong-dan nhúng qua iframe cùng nguồn). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.active || !canUse(user.roles, "guide")) return new Response("Không có quyền", { status: 403 });
  return new Response(SALES_GUIDE_HTML, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, max-age=300" },
  });
}
