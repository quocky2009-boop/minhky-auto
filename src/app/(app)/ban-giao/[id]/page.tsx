import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/dates";
import { todayVn } from "@/lib/cashbook";
import { HANDOVER_STATUS_LABEL, RELATION_LABEL } from "@/lib/handover";
import { PageHeader } from "@/components/ui";
import { getHandover } from "../load";
import { HandoverPanel } from "./handover-panel";

export const metadata = { title: "Chi tiết bàn giao" };

export default async function HandoverPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireModule("docs");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const d = await getHandover(supabase, id);
  if (!d) notFound();
  const { handover: h } = d;
  const manager = isManager(user.roles);
  const canEdit = manager || (user.roles.includes("sales") && h.owner_id === user.id);
  const title = [h.vehicle?.code, h.vehicle?.make, h.vehicle?.model, h.vehicle?.year_made].filter(Boolean).join(" ");
  return (
    <>
      <PageHeader title={`Bàn giao ${h.code}`} sub={<>{HANDOVER_STATUS_LABEL[h.status]} · {title}</>}>
        <Link href="/ban-giao" className="btn btn-ghost">← Danh sách</Link>
        <Link href={`/ban-giao/${h.id}/bien-ban`} className="btn btn-ghost">Biên bản (in)</Link>
      </PageHeader>
      {sp["da-tao"] && <p role="status" className="mb-3 text-sm text-sig-green">Đã lập bàn giao. Hoàn tất checklist rồi giao xe.</p>}
      <section className="panel mb-4 p-4">
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <div><dt className="inline text-ink-soft">Xe: </dt><dd className="inline"><Link href={`/kho-xe/${h.vehicle_id}`} className="text-petrol hover:underline">{title}</Link>{h.vehicle?.plate ? ` · biển ${h.vehicle.plate}` : ""}</dd></div>
          <div><dt className="inline text-ink-soft">Khách: </dt><dd className="inline">{h.customer?.full_name ?? "—"}{h.customer?.phone ? ` · ${h.customer.phone}` : ""}</dd></div>
          <div><dt className="inline text-ink-soft">Đơn bán: </dt><dd className="inline"><Link href={`/don-ban/${h.order_id}`} className="text-petrol hover:underline">{h.order?.code}</Link>{h.order?.contract_ref ? ` · HĐ ${h.order.contract_ref}` : ""}</dd></div>
          <div><dt className="inline text-ink-soft">Người phụ trách: </dt><dd className="inline">{h.owner?.full_name ?? "—"}</dd></div>
          <div><dt className="inline text-ink-soft">Hẹn giao: </dt><dd className="inline">{h.planned_on ? formatDate(h.planned_on) : "Chưa hẹn"}</dd></div>
          {h.status === "delivered" && <div className="md:col-span-2"><dt className="inline text-ink-soft">Đã giao: </dt><dd className="inline">{h.delivered_on ? formatDate(h.delivered_on) : ""} · nhận bởi {h.received_by_name} ({RELATION_LABEL[h.received_relation ?? ""]}) · ODO {h.odo_at_handover} km · {h.keys_given} chìa khóa · ghi bởi {h.deliverer?.full_name ?? "—"} {h.delivered_at ? formatDateTime(h.delivered_at) : ""}</dd></div>}
          {h.end_reason && <div className="md:col-span-2"><dt className="inline text-ink-soft">Lý do hủy: </dt><dd className="inline">{h.end_reason}</dd></div>}
          {h.note && <div className="md:col-span-2"><dt className="inline text-ink-soft">Ghi chú: </dt><dd className="inline">{h.note}</dd></div>}
        </dl>
      </section>
      <HandoverPanel h={h} items={d.items} exceptions={d.exceptions} readiness={d.readiness} manager={manager} canEdit={canEdit} today={todayVn()} requestId={randomUUID()} />
    </>
  );
}
