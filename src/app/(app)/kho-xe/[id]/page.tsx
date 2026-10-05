import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canSeeFinance, isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { formatVnd } from "@/lib/money";
import { BUSINESS_TYPE_LABEL, CONDITION_LABEL, FUEL_LABEL, PAPERWORK_LABEL, PREP_LABEL, SOURCE_TYPE_LABEL, VEHICLE_SALE_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui";
import { loadVehicle } from "./load";
import { loadCosts } from "./cost-load";
import { CostsPanel } from "./costs-panel";
import { loadConsignment } from "./consignment-load";
import { ConsignmentPanel } from "./consignment-panel";
import { loadVehicleFiles } from "./file-load";
import { FilesPanel } from "./files-panel";
import { allowedCategories } from "@/lib/vehicle-files";
import { loadCapital } from "./capital-load";
import { CapitalPanel } from "./capital-panel";
import { toVnd } from "@/lib/money";
import { loadReservations } from "./reservation-load";
import { ReservationPanel } from "./reservation-panel";
import { randomUUID } from "node:crypto";

export const metadata = { title: "Chi tiết xe" };

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[9rem_1fr] gap-2 border-b border-line/70 py-1.5 text-sm last:border-0"><dt className="text-ink-soft">{label}</dt><dd>{children}</dd></div>
);
const unknown = <span className="text-ink-soft">Chưa rõ</span>;
const orUnknown = (v: React.ReactNode) => (v === null || v === undefined || v === "" ? unknown : v);

export default async function VehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireModule("inventory");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const v = await loadVehicle(supabase, id);
  if (!v) notFound();
  const [{ data: history }, demand] = await Promise.all([
    supabase.rpc("vehicle_history", { p_id: id }),
    v.source_demand_id ? supabase.from("demands").select("id, code").eq("id", v.source_demand_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const finance = canSeeFinance(user.roles);
  const manager = isManager(user.roles);
  const isConsignment = v.business_type === "consignment";
  const canSellRole = user.roles.some((r) => r === "admin" || r === "manager" || r === "sales");
  const showReservations = canSellRole || finance;
  const [files, costData, consignment, capital, reservations] = await Promise.all([
    loadVehicleFiles(supabase, v.id),
    finance ? loadCosts(supabase, v.id) : Promise.resolve(null),
    finance && isConsignment ? loadConsignment(supabase, v.id) : Promise.resolve(null),
    finance && !isConsignment ? loadCapital(supabase, v.id) : Promise.resolve(null),
    showReservations ? loadReservations(supabase, v.id, canSellRole && v.sale_status === "available") : Promise.resolve(null),
  ]);
  const title = [v.make, v.model, v.variant, v.year_made].filter(Boolean).join(" ");
  const cycles = ((history ?? []) as { id: string; code: string; sale_status: string; business_type: string; intake_date: string | null; depth: number }[]).filter((h) => h.depth > 0);
  const age = v.intake_date ? Math.floor((Date.now() - new Date(`${v.intake_date}T00:00:00+07:00`).getTime()) / 86400000) : null;
  const ended = ["sold", "delivered", "returned_to_owner"].includes(v.sale_status);

  return (
    <div className="space-y-4">
      {sp["da-tao"] && <p role="status" className="panel border-[#b7d9c3] bg-[#eef7f1] px-4 py-2 text-sm text-sig-green">Đã nhập xe {v.code} vào kho.</p>}
      {sp["da-nhap-kho"] && <p role="status" className="panel border-[#b7d9c3] bg-[#eef7f1] px-4 py-2 text-sm text-sig-green">Đã nhập kho {v.code} từ nhu cầu bán. Thông tin khách khai vẫn được giữ ở nhu cầu nguồn.</p>}
      {sp["da-luu"] && <p role="status" className="panel border-[#b7d9c3] bg-[#eef7f1] px-4 py-2 text-sm text-sig-green">Đã lưu thay đổi.</p>}
      <PageHeader title={title || v.code} sub={`${v.code} · ${CONDITION_LABEL[v.condition]} · ${BUSINESS_TYPE_LABEL[v.business_type]}`}>
        {manager && !ended && <Link href={`/kho-xe/${v.id}/sua`} className="btn btn-primary">Sửa</Link>}
        <Link href="/kho-xe" className="btn btn-ghost">Về kho xe</Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Thông tin xe</h2>
          <dl>
            <Row label="Hãng / model">{orUnknown([v.make, v.model, v.variant].filter(Boolean).join(" "))}</Row>
            <Row label="Năm SX / đăng ký">{orUnknown([v.year_made, v.year_registered].filter(Boolean).join(" / "))}</Row>
            <Row label="Màu">{orUnknown(v.color)}</Row>
            <Row label="ODO">{v.odo !== null ? `${v.odo.toLocaleString("vi-VN")} km` : unknown}</Row>
            <Row label="Nhiên liệu / chỗ">{v.fuel_type ? FUEL_LABEL[v.fuel_type] : "Chưa rõ"} · {v.seats ?? "chưa rõ"} chỗ</Row>
            <Row label="VIN">{orUnknown(v.vin)}</Row>
            <Row label="Biển số">{orUnknown(v.plate)}</Row>
            <Row label="Ghi chú">{orUnknown(v.notes)}</Row>
          </dl>
        </section>

        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Trạng thái (các chiều tách riêng)</h2>
          <dl>
            <Row label="Bán hàng"><b>{VEHICLE_SALE_STATUS[v.sale_status]}</b></Row>
            <Row label="Chuẩn bị bán">{PREP_LABEL[v.prep_status]}</Row>
            <Row label="Hồ sơ giấy tờ">{PAPERWORK_LABEL[v.paperwork_status]}</Row>
            <Row label="Nguồn xe">{v.source_type ? SOURCE_TYPE_LABEL[v.source_type] : "Chưa rõ"}</Row>
            <Row label="Vị trí">{orUnknown(v.location_name)}</Row>
            <Row label="Ngày nhập kho">{v.intake_date ? `${formatDate(v.intake_date)} (${age} ngày)` : unknown}</Row>
          </dl>
          {demand.data && <p className="mt-3 text-sm">Nguồn gốc: nhu cầu bán <Link href={`/nhu-cau/${demand.data.id}`} className="text-petrol hover:underline">{demand.data.code}</Link> (thông tin khách khai nằm ở đó).</p>}
        </section>

        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Giá</h2>
          <dl>
            <Row label="Giá chào bán">{v.asking_price !== null ? <span className="num font-semibold">{formatVnd(v.asking_price)}</span> : unknown}</Row>
            {finance && (
              <>
                <Row label="Giá mua (nội bộ)">{v.business_type === "consignment" ? <span className="text-ink-soft">Không áp dụng — xe ký gửi</span> : v.purchase_price !== null ? <span className="num">{formatVnd(v.purchase_price)}</span> : unknown}</Row>
                <Row label="Giá sàn (nội bộ)">{v.floor_price !== null ? <span className="num">{formatVnd(v.floor_price)}</span> : unknown}</Row>
              </>
            )}
          </dl>
          {!finance && <p className="mt-2 text-xs text-ink-soft">Giá mua và giá sàn chỉ hiển thị với quản lý/kế toán.</p>}
        </section>

        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Lịch sử vòng sở hữu</h2>
          {cycles.length === 0 ? <p className="text-sm text-ink-soft">Đây là lần đầu xe vào showroom (hoặc chưa có VIN để đối chiếu).</p> : (
            <ul className="space-y-1 text-sm">
              {cycles.map((c) => (
                <li key={c.id}><Link href={`/kho-xe/${c.id}`} className="text-petrol hover:underline">{c.code}</Link> · {BUSINESS_TYPE_LABEL[c.business_type]} · {VEHICLE_SALE_STATUS[c.sale_status]} · nhập {formatDate(c.intake_date)}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-soft">Mỗi lần xe quay lại showroom là một hồ sơ mới; hồ sơ và giao dịch cũ được giữ nguyên.</p>
        </section>
      </div>
      {reservations && (
        <section className="panel p-4">
          <h2 className="mb-3 font-semibold">Giữ xe và đặt cọc</h2>
          <ReservationPanel vehicleId={v.id} saleStatus={v.sale_status} canSell={canSellRole} manager={manager} finance={finance} userId={user.id}
            reservations={reservations.reservations} publicInfo={reservations.publicInfo} demandOptions={reservations.demandOptions}
            requestIds={{ reserve: randomUUID(), convert: randomUUID() }} />
        </section>
      )}
      <section className="panel p-4">
        <h2 className="mb-3 font-semibold">Ảnh và video</h2>
        <FilesPanel vehicleId={v.id} files={files} categories={allowedCategories(user.roles)} manager={manager} />
      </section>
      {costData && (
        <section className="panel p-4">
          <h2 className="mb-3 font-semibold">Chi phí chuẩn bị xe</h2>
          <CostsPanel vehicleId={v.id} businessType={v.business_type} costs={costData.costs} summary={costData.summary} manager={manager}
            addRequestId={randomUUID()} payRequestIds={Object.fromEntries(costData.costs.map((c) => [c.id, randomUUID()]))} />
        </section>
      )}
      {consignment && (
        <section className="panel p-4">
          <h2 className="mb-3 font-semibold">Hợp đồng ký gửi</h2>
          <ConsignmentPanel vehicleId={v.id} contract={consignment.contract} terms={consignment.terms} earlier={consignment.earlier} manager={manager}
            createRequestId={randomUUID()} termsRequestId={randomUUID()}
            ownerCostConfirmed={costData?.summary?.confirmed_owner ?? null} ownerCostPaid={costData?.summary?.paid_owner ?? null}
            openCostLines={costData?.summary?.open_lines ?? 0} />
        </section>
      )}
      {capital && (
        <section className="panel p-4">
          <h2 className="mb-3 font-semibold">Vốn góp và chia lợi nhuận</h2>
          <CapitalPanel vehicleId={v.id} manager={manager} parties={capital.parties} terms={capital.terms} entries={capital.entries} summary={capital.summary}
            loans={capital.loans} needsReconfirm={capital.needsReconfirm}
            purchasePrice={toVnd(v.purchase_price)?.toString() ?? null} confirmedCosts={toVnd(costData?.summary?.confirmed_showroom)?.toString() ?? null}
            openCostLines={costData?.summary?.open_lines ?? 0}
            requestIds={{ party: randomUUID(), terms: randomUUID(), entry: randomUUID(), loan: randomUUID(), loanPay: Object.fromEntries(capital.loans.map((l) => [l.id, randomUUID()])) }} />
        </section>
      )}
      {isConsignment && !finance && <p className="text-xs text-ink-soft">Hợp đồng ký gửi chỉ hiển thị với quản lý/kế toán.</p>}
    </div>
  );
}
