import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { HANDOVER_STATUS_LABEL, HOLDER_LABEL, ITEM_STATE_LABEL, RELATION_LABEL } from "@/lib/handover";
import { getHandover } from "../../load";
import { PrintButton } from "./print-button";

export const metadata = { title: "Biên bản bàn giao xe" };

/** Biên bản bàn giao (trang in). Không có số tiền: chỉ xe, khách, checklist, người nhận, ODO, chìa khóa. */
export default async function MinutesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("docs");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getHandover(await createClient(), id);
  if (!d) notFound();
  const { handover: h, items } = d;
  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-sm text-black print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden"><span className="text-ink-soft">Xem trước biên bản</span><PrintButton /></div>
      <h1 className="text-center text-xl font-bold uppercase">Biên bản bàn giao xe</h1>
      <p className="mb-4 text-center">Số {h.code} · {HANDOVER_STATUS_LABEL[h.status]}{h.delivered_on ? ` · ngày ${formatDate(h.delivered_on)}` : ""}</p>
      <table className="mb-4 w-full border-collapse">
        <tbody>
          {[
            ["Bên giao", "Minh Kỳ Auto"], ["Bên nhận (khách)", `${h.customer?.full_name ?? ""}${h.customer?.phone ? ` · ${h.customer.phone}` : ""}`],
            ["Xe", [h.vehicle?.code, h.vehicle?.make, h.vehicle?.model, h.vehicle?.year_made].filter(Boolean).join(" ")], ["Số khung (VIN)", h.vehicle?.vin ?? "—"], ["Biển số", h.vehicle?.plate ?? "—"],
            ["Hợp đồng bán", `${h.order?.contract_ref ?? "—"}${h.order?.contract_date ? ` · ký ${formatDate(h.order.contract_date)}` : ""}`],
            ["Người nhận xe", h.received_by_name ? `${h.received_by_name} (${RELATION_LABEL[h.received_relation ?? ""]})` : "…………………"],
            ["Số ODO lúc giao", h.odo_at_handover !== null ? `${h.odo_at_handover} km` : "…………………"], ["Số chìa khóa giao", h.keys_given !== null ? String(h.keys_given) : "…………………"],
          ].map(([k, v]) => <tr key={k} className="border border-black"><td className="w-48 border border-black p-1 font-semibold">{k}</td><td className="border border-black p-1">{v}</td></tr>)}
        </tbody>
      </table>
      <table className="mb-8 w-full border-collapse">
        <thead><tr className="border border-black"><th className="border border-black p-1 text-left">Hạng mục</th><th className="border border-black p-1">Tình trạng</th><th className="border border-black p-1">Bản gốc</th><th className="border border-black p-1">Bản scan</th><th className="border border-black p-1">Người giữ</th></tr></thead>
        <tbody>
          {items.filter((i) => i.state !== "na").map((i) => (
            <tr key={i.template_key} className="border border-black">
              <td className="border border-black p-1">{i.label}{i.is_required ? " *" : ""}{i.note ? ` — ${i.note}` : ""}</td>
              <td className="border border-black p-1 text-center">{ITEM_STATE_LABEL[i.state]}</td>
              <td className="border border-black p-1 text-center">{i.has_original ? "Có" : "—"}</td><td className="border border-black p-1 text-center">{i.has_scan ? "Có" : "—"}</td>
              <td className="border border-black p-1 text-center">{i.holder ? HOLDER_LABEL[i.holder] : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-8 text-center"><div><b>Bên giao</b><div className="h-20" /><i>(ký, ghi họ tên)</i></div><div><b>Bên nhận</b><div className="h-20" /><i>(ký, ghi họ tên)</i></div></div>
    </div>
  );
}
