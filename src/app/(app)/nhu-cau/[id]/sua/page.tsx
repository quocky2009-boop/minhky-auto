import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, getSellers, getSources } from "@/lib/demands/data";
import { toLocalInput } from "@/lib/dates";
import { toVnd } from "@/lib/money";
import { ErrorBox, PageHeader } from "@/components/ui";
import { DemandForm, type DemandFormValues } from "../../demand-form";
import { loadDemand } from "../load";

export const metadata = { title: "Sửa nhu cầu" };
const s = (x: unknown) => (x === null || x === undefined ? "" : String(x));
const money = (x: unknown) => { const v = toVnd(x); return v === null ? "" : v.toString(); };

export default async function EditDemandPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("demands");
  const { id } = await params;
  const supabase = await createClient();
  const d = await loadDemand(supabase, id);
  if (!d) notFound();
  const { data: canEdit } = await supabase.rpc("can_edit_demand_ui", { p_id: id });
  const [catalog, sources, sellers] = await Promise.all([getCatalog(), getSources(), getSellers()]);
  const o = d.offer;
  const initial: DemandFormValues = {
    kind: d.kind, priority: d.priority, source_id: s(d.source_id), raw_message: s(d.raw_message), notes: s(d.notes),
    options: d.options.map((x) => ({ make: x.make, model: x.model ?? "", variant: x.variant ?? "" })),
    budget_min: money(d.budget_min), budget_max: money(d.budget_max), year_min: s(d.year_min), year_max: s(d.year_max),
    odo_max: s(d.odo_max), fuel_types: d.fuel_types, seats: d.seats.map(String), condition_pref: s(d.condition_pref),
    colors_accepted: d.colors_accepted.join(", "), colors_rejected: d.colors_rejected.join(", "),
    needs_loan: s(d.needs_loan), wants_trade_in: s(d.wants_trade_in), expected_timeframe: s(d.expected_timeframe),
    expected_by: s(d.expected_by), strict_criteria: d.strict_criteria, must_have_note: s(d.must_have_note), flexible_note: s(d.flexible_note),
    ...(o ? {
      s_make: s(o.make_name), s_model: s(o.model_name), s_variant: s(o.variant_name), s_year_made: s(o.year_made), s_year_registered: s(o.year_registered),
      s_color: s(o.color), s_fuel: s(o.fuel_type), s_seats: s(o.seats), s_odo: s(o.odo), s_plate: s(o.plate), s_vin: s(o.vin),
      s_price: money(o.asking_price), s_negotiable: s(o.negotiable), s_condition_note: s(o.condition_note), s_repair_note: s(o.repair_history_note),
      s_papers_note: s(o.papers_note), s_has_loan: s(o.has_loan), s_loan_remaining: money(o.loan_remaining), s_location: s(o.vehicle_location),
      s_sell_time: s(o.desired_sell_time), s_sale_mode: s(o.sale_mode), s_inspection_at: toLocalInput(o.inspection_at),
    } : {}),
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Sửa ${d.code}`} sub={`${d.customer.full_name} · ${d.kind === "buy" ? "Cần mua" : "Cần bán"}`} />
      {!canEdit ? (
        <ErrorBox message="Anh/chị chỉ được xem nhu cầu này (được chia sẻ). Người phụ trách hoặc quản lý mới sửa được." />
      ) : (
        <DemandForm mode="update" demandId={d.id} version={d.version} initial={initial} catalog={catalog} sources={sources}
          sellers={sellers} canAssign={false} me={user.id} />
      )}
    </div>
  );
}
