import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canSeeFinance, isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { getCatalog } from "@/lib/demands/data";
import { getLocations } from "@/lib/vehicles/data";
import { toVnd } from "@/lib/money";
import { VEHICLE_SALE_STATUS } from "@/lib/labels";
import { ErrorBox, PageHeader } from "@/components/ui";
import { VehicleForm } from "../../vehicle-form";
import { loadVehicle } from "../load";

export const metadata = { title: "Sửa xe" };
const s = (x: unknown) => (x === null || x === undefined ? "" : String(x));
const money = (x: unknown) => { const v = toVnd(x); return v === null ? "" : v.toString(); };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("inventory");
  const { id } = await params;
  const supabase = await createClient();
  const v = await loadVehicle(supabase, id);
  if (!v) notFound();
  if (!isManager(user.roles)) return <ErrorBox message="Chỉ quản lý được sửa hồ sơ xe." />;
  if (["sold", "delivered", "returned_to_owner"].includes(v.sale_status)) {
    return <ErrorBox message="Xe này đã kết thúc một vòng sở hữu nên không sửa trực tiếp. Nếu xe quay lại showroom, hãy nhập thành hồ sơ mới." />;
  }
  const [catalog, locations] = await Promise.all([getCatalog(), getLocations()]);
  const initial: Record<string, string> = {
    make: v.make, model: v.model, variant: v.variant, year_made: s(v.year_made), year_registered: s(v.year_registered), color: s(v.color),
    odo: s(v.odo), fuel_type: s(v.fuel_type), seats: s(v.seats), vin: s(v.vin), plate: s(v.plate), condition: v.condition, business_type: v.business_type,
    source_type: s(v.source_type), intake_date: s(v.intake_date), location_id: s(v.location_id), prep_status: v.prep_status, paperwork_status: v.paperwork_status,
    sale_status: v.sale_status, sale_status_label: VEHICLE_SALE_STATUS[v.sale_status] ?? "", notes: s(v.notes), asking_price: money(v.asking_price),
    purchase_price: money(v.purchase_price), floor_price: money(v.floor_price),
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Sửa ${v.code}`} sub={[v.make, v.model, v.year_made].filter(Boolean).join(" ")} />
      <VehicleForm mode="update" vehicleId={v.id} version={v.version} initial={initial} catalog={catalog} locations={locations} showFinance={canSeeFinance(user.roles)} />
    </div>
  );
}
