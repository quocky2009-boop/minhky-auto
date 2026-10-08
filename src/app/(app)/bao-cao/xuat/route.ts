import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canSeeFinance } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { INVENTORY_COLUMNS, RESULT_COLUMNS, inventoryToCsv, parsePeriod, resultsToCsv, type InventoryRow, type ResultRow } from "@/lib/reports";

export const dynamic = "force-dynamic";
const MAX_ROWS = 5000;
/** Không cắt cụt âm thầm: quá giới hạn thì yêu cầu thu hẹp kỳ. */
const tooMany = () => new NextResponse(`Báo cáo vượt ${MAX_ROWS} dòng. Thu hẹp khoảng thời gian rồi xuất lại.`, { status: 422 });

/** Xuất CSV theo quyền: chỉ quản lý/kế toán/admin; dữ liệu đọc qua RLS bằng chính phiên của người dùng (không service-role). Không chứa dữ liệu cá nhân của khách. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.active || !canSeeFinance(user.roles)) return new NextResponse("Không có quyền xuất báo cáo.", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("loai") === "ton-kho" ? "ton-kho" : "ket-qua";
  const supabase = await createClient();
  let body: string;
  if (kind === "ton-kho") {
    const { data, error } = await supabase.from("report_inventory").select(INVENTORY_COLUMNS).order("age_days", { ascending: false }).order("code").limit(MAX_ROWS + 1);
    if (error) return new NextResponse("Không xuất được báo cáo. Thử lại.", { status: 500 });
    const rows = (data ?? []) as unknown as InventoryRow[];
    if (rows.length > MAX_ROWS) return tooMany();
    body = inventoryToCsv(rows);
  } else {
    const p = parsePeriod(sp.get("tu") ?? undefined, sp.get("den") ?? undefined);
    const { data, error } = await supabase.from("report_vehicle_results").select(RESULT_COLUMNS)
      .gte("sold_on", p.from).lte("sold_on", p.to).order("sold_on", { ascending: false }).order("order_code", { ascending: false }).limit(MAX_ROWS + 1);
    if (error) return new NextResponse("Không xuất được báo cáo. Thử lại.", { status: 500 });
    const rows = (data ?? []) as unknown as ResultRow[];
    if (rows.length > MAX_ROWS) return tooMany();
    body = resultsToCsv(rows);
  }
  const name = kind === "ton-kho" ? "ton-kho" : `ket-qua-xe-${sp.get("tu") ?? ""}-${sp.get("den") ?? ""}`.replace(/[^a-z0-9-]/gi, "");
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "no-store",
    },
  });
}
