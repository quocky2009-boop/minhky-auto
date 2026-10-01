import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { formatVnd } from "@/lib/money";
import { BUSINESS_TYPE_LABEL, CONDITION_LABEL, PREP_LABEL, VEHICLE_SALE_STATUS } from "@/lib/labels";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Kho xe" };
const nm = (x: unknown) => ((Array.isArray(x) ? x[0] : x) as { name: string } | null)?.name ?? "";

export default async function InventoryPage() {
  await requireModule("inventory");
  const supabase = await createClient();
  // Giá chào nằm ở bảng riêng; RLS tự trả null với vai trò không được xem giá. Giá vốn/giá sàn không đọc ở đây.
  const { data } = await supabase.from("vehicles")
    .select("id, code, year_made, color, odo, condition, business_type, sale_status, prep_status, intake_date, make:vehicle_makes(name), model:vehicle_models(name), variant:vehicle_variants(name), listing:vehicle_listings(asking_price)")
    .is("archived_at", null).order("intake_date", { ascending: true, nullsFirst: false }).limit(200);
  const today = Date.now();
  return (
    <>
      <PageHeader title="Kho xe" sub="Xem nhanh xe theo quyền của anh/chị. Nhập xe, thu mua, thẩm định, ký gửi: chặng 3 (chưa triển khai)." />
      {!data?.length ? <Empty title="Chưa có xe nào trong phạm vi anh/chị được xem." /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-soft">
              <tr><th className="px-3 py-2 font-medium">Mã</th><th className="px-3 py-2 font-medium">Xe</th><th className="px-3 py-2 font-medium">Mới/cũ · Hình thức</th>
                <th className="px-3 py-2 font-medium">Bán hàng</th><th className="px-3 py-2 font-medium">Chuẩn bị</th><th className="px-3 py-2 font-medium">Giá chào</th><th className="px-3 py-2 font-medium">Tuổi tồn</th></tr>
            </thead>
            <tbody>
              {data.map((v) => {
                const listing = (Array.isArray(v.listing) ? v.listing[0] : v.listing) as { asking_price: unknown } | null;
                const age = v.intake_date ? Math.floor((today - new Date(`${v.intake_date}T00:00:00+07:00`).getTime()) / 86400000) : null;
                return (
                  <tr key={v.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-medium">{v.code}</td>
                    <td className="px-3 py-2">{[nm(v.make), nm(v.model), nm(v.variant), v.year_made].filter(Boolean).join(" ")}<div className="text-xs text-ink-soft">{v.color ?? "màu chưa rõ"}{v.odo !== null ? ` · ${v.odo.toLocaleString("vi-VN")} km` : ""}</div></td>
                    <td className="px-3 py-2">{CONDITION_LABEL[v.condition]} · {BUSINESS_TYPE_LABEL[v.business_type]}</td>
                    <td className="px-3 py-2">{VEHICLE_SALE_STATUS[v.sale_status]}</td>
                    <td className="px-3 py-2">{PREP_LABEL[v.prep_status]}</td>
                    <td className="num px-3 py-2">{listing ? formatVnd(listing.asking_price) : <span className="text-ink-soft">Không hiển thị</span>}</td>
                    <td className="num px-3 py-2">{age !== null ? `${age} ngày (từ ${formatDate(v.intake_date)})` : "Chưa rõ ngày nhập"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
