import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canUse } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { searchDemands } from "@/lib/demands/data";
import { ErrorBox, PageHeader, Signal } from "@/components/ui";
import type { FollowupState } from "@/lib/followup";

export const metadata = { title: "Tổng quan" };

function Stat({ label, value, href, state }: { label: string; value: number | string; href?: string; state?: FollowupState }) {
  const body = (
    <div className="panel h-full p-4 transition hover:border-ink-soft">
      <p className="flex items-center gap-2 text-sm text-ink-soft">{state && <Signal state={state} />}{label}</p>
      <p className="num mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ "khong-co-quyen"?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/dang-nhap");
  if (!user.active || user.roles.length === 0) redirect("/chua-cap-quyen");
  const sp = await searchParams;
  const seller = canUse(user.roles, "demands");
  const supabase = await createClient();

  const vehiclesQ = supabase.from("vehicles").select("id", { count: "exact", head: true }).is("archived_at", null).in("sale_status", ["available", "held", "deposited"]);
  const care = seller
    ? await Promise.all([
        searchDemands({ followup: "overdue" }, 1, 0), searchDemands({ followup: "today" }, 1, 0), searchDemands({ followup: "stale" }, 1, 0),
        searchDemands({ kind: "buy" }, 1, 0), searchDemands({ kind: "sell" }, 1, 0),
      ])
    : null;
  const vehicles = await vehiclesQ;
  const [overdue, today, stale, buy, sell] = care ?? [null, null, null, null, null];

  return (
    <>
      <PageHeader title={`Chào ${user.name}`} sub="Tổng quan công việc" />
      {sp["khong-co-quyen"] && <div className="mb-4"><ErrorBox message="Anh/chị không có quyền vào mục vừa chọn." /></div>}
      {seller && overdue && today && stale && buy && sell && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-soft">Chăm sóc khách{user.roles.some((r) => r === "admin" || r === "manager") ? " — toàn showroom" : " — của tôi"}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Quá hạn" value={overdue.total} href="/nhu-cau?fu=overdue" state="overdue" />
            <Stat label="Đến hạn hôm nay" value={today.total} href="/nhu-cau?fu=today" state="today" />
            <Stat label="Lâu chưa cập nhật" value={stale.total} href="/nhu-cau?fu=stale" state="stale" />
            <Stat label="Khách cần mua (mở)" value={buy.total} href="/nhu-cau?kind=buy" />
            <Stat label="Khách cần bán (mở)" value={sell.total} href="/nhu-cau?kind=sell" />
          </div>
        </section>
      )}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">Kho xe</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Xe đang bán / giữ / cọc" value={vehicles.count ?? "—"} href="/kho-xe" />
        </div>
      </section>
      <section className="panel p-4 text-sm text-ink-soft">
        <p className="font-medium text-ink">Dashboard lãnh đạo — chưa triển khai (chặng 6)</p>
        <p className="mt-1">Vốn theo xe và tuổi tồn, tiền phải trả chủ ký gửi/người góp vốn, kết quả xe đã bán và công nợ sẽ có khi các phân hệ
          kho xe, vốn góp, bán hàng và thu chi được triển khai (chặng 3–6). Hiện chưa hiển thị số liệu tài chính để tránh số 0 gây hiểu nhầm.</p>
      </section>
    </>
  );
}
