import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canUse } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { searchDemands } from "@/lib/demands/data";
import { ErrorBox, PageHeader, Signal } from "@/components/ui";
import type { FollowupState } from "@/lib/followup";
import { money } from "@/lib/reports";
import { loadDashboard } from "../bao-cao/load";
import { todayVn } from "@/lib/cashbook";

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
  const day = todayVn();
  const openCases = () => supabase.from("aftersales_cases").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]);
  const [vehicles, dash, caseOverdue, caseToday, caseOpen] = await Promise.all([
    vehiclesQ, loadDashboard(supabase), openCases().lt("next_due", day), openCases().eq("next_due", day), openCases(),
  ]);
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
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">Hậu mãi{user.roles.some((r) => r === "admin" || r === "manager") ? " — toàn showroom" : " — của tôi"}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Phiếu quá hạn" value={caseOverdue.count ?? "—"} href="/hau-mai?tab=overdue" state="overdue" />
          <Stat label="Phiếu đến hạn hôm nay" value={caseToday.count ?? "—"} href="/hau-mai?tab=today" state="today" />
          <Stat label="Phiếu đang xử lý" value={caseOpen.count ?? "—"} href="/hau-mai" />
        </div>
      </section>
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">Kho xe</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Xe đang bán / giữ / cọc" value={vehicles.count ?? "—"} href="/kho-xe" />
        </div>
      </section>
      {dash && <Finance d={dash} />}
    </>
  );
}

function Finance({ d }: { d: NonNullable<Awaited<ReturnType<typeof loadDashboard>>> }) {
  const o = d.inventory.owned, c = d.inventory.consignment;
  const age = (x: { age_0_30: number; age_31_60: number; age_61_90: number; age_91_plus: number }) => `${x.age_0_30} · ${x.age_31_60} · ${x.age_61_90} · ${x.age_91_plus}`;
  return (
    <>
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">Tồn kho — sở hữu và ký gửi tách riêng</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Xe sở hữu trong kho" value={o.count} href="/bao-cao?muc=ton-kho" />
          <Stat label="Vốn hàng tồn sở hữu" value={money(o.capital_tied)} href="/bao-cao?muc=ton-kho" />
          <Stat label="Xe ký gửi trong kho" value={c.count} href="/bao-cao?muc=ton-kho" />
          <Stat label="Nguồn xe chưa nhập kho" value={d.inventory.not_yet_in_stock} href="/kho-xe" />
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Tuổi tồn (0–30 · 31–60 · 61–90 · trên 90 ngày): sở hữu {age(o)} · ký gửi {age(c)}.
          {o.cost_unknown > 0 ? ` ${o.cost_unknown} xe sở hữu chưa có giá mua nên chưa tính vào vốn.` : ""}
          {o.open_cost_lines > 0 ? ` ${o.open_cost_lines} khoản chi phí chưa xác nhận.` : ""}
        </p>
      </section>
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">Vốn theo nguồn và tiền</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Vốn góp ngoài (ròng) trong xe tồn" value={money(d.capital_sources.external_capital)} />
          <Stat label="Dư nợ vay trên xe tồn" value={money(d.capital_sources.loan_outstanding)} />
          <Stat label={`Tiền thực có (${d.money.accounts} tài khoản)`} value={money(d.money.balance)} href="/thu-chi" />
          <Stat label="Công nợ khách chưa thu (đơn đã ký)" value={money(d.receivables.orders_outstanding)} href="/don-ban" />
        </div>
      </section>
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">Phải trả và quyết toán</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Còn phải chi theo quyết toán" value={money(d.payables.settlement_out)} href="/quyet-toan?trang_thai=approved" />
          <Stat label="Còn phải trả thu cũ đổi mới" value={money(d.payables.tradein_payable)} href="/don-ban" />
          <Stat label="Xe đã bán chưa có quyết toán duyệt" value={d.settlements.unsettled_sold} href="/bao-cao" />
          <Stat label="Quyết toán chờ kiểm tra/duyệt" value={d.settlements.pending_approval} href="/quyet-toan" />
        </div>
        <p className="mt-2 text-xs text-ink-soft">Kết quả từng xe, lãi gộp, lợi nhuận phân chia và phần công ty hưởng: xem <Link href="/bao-cao" className="text-petrol hover:underline">Báo cáo</Link>.</p>
      </section>
    </>
  );
}
