import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canSeeFinance, isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { CASE_KIND_LABEL, CASE_STATUS_LABEL, COMMITMENT_KIND_LABEL, COVERAGE_LABEL } from "@/lib/aftersales";
import { todayVn } from "@/lib/cashbook";
import { PageHeader } from "@/components/ui";
import { getCase } from "../load";
import { CasePanel } from "./case-panel";

export const metadata = { title: "Phiếu hậu mãi" };

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireModule("aftersales");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const finance = canSeeFinance(user.roles);
  const d = await getCase(await createClient(), id, finance);
  if (!d) notFound();
  const { c, commitment } = d;
  const manager = isManager(user.roles);
  const canEdit = manager || c.assigned_to === user.id || (user.roles.includes("sales") && c.owner_id === user.id);
  const title = [c.vehicle?.code, c.vehicle?.make, c.vehicle?.model, c.vehicle?.year_made].filter(Boolean).join(" ");
  return (
    <>
      <PageHeader title={`Phiếu ${c.code}`} sub={<>{CASE_KIND_LABEL[c.kind]} · {CASE_STATUS_LABEL[c.status]} · {title}</>}>
        <Link href="/hau-mai" className="btn btn-ghost">← Danh sách</Link>
      </PageHeader>
      {sp["da-tao"] && <p role="status" className="mb-3 text-sm text-sig-green">Đã mở phiếu hậu mãi.</p>}
      <section className="panel mb-4 p-4">
        <p className="font-medium">{c.title}</p>
        {c.description && <p className="mt-1 whitespace-pre-line text-sm">{c.description}</p>}
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <div><dt className="inline text-ink-soft">Xe: </dt><dd className="inline">{c.vehicle ? <Link href={`/kho-xe/${c.vehicle_id}`} className="text-petrol hover:underline">{title}</Link> : "—"}{c.vehicle?.plate ? ` · biển ${c.vehicle.plate}` : ""}</dd></div>
          <div><dt className="inline text-ink-soft">Khách: </dt><dd className="inline">{c.customer?.full_name ?? "—"}{c.customer?.phone ? ` · ${c.customer.phone}` : ""}</dd></div>
          <div><dt className="inline text-ink-soft">Đơn bán: </dt><dd className="inline">{c.order ? <Link href={`/don-ban/${c.order_id}`} className="text-petrol hover:underline">{c.order.code}</Link> : "—"}</dd></div>
          <div><dt className="inline text-ink-soft">Người phụ trách: </dt><dd className="inline">{c.assignee?.full_name ?? "—"}</dd></div>
          <div><dt className="inline text-ink-soft">Tiếp nhận: </dt><dd className="inline">{formatDate(c.received_on)}{c.odo_at_case !== null ? ` · ${c.odo_at_case.toLocaleString("vi-VN")} km` : " · chưa ghi số km"}</dd></div>
          {commitment && (
            <div className="md:col-span-2"><dt className="inline text-ink-soft">Cam kết/bảo hành: </dt>
              <dd className="inline">{commitment.code} · {COMMITMENT_KIND_LABEL[commitment.kind]} “{commitment.title}” · từ {formatDate(commitment.starts_on)}{commitment.ends_on ? ` đến ${formatDate(commitment.ends_on)}` : ""}{commitment.odo_limit ? ` · tối đa ${commitment.odo_limit.toLocaleString("vi-VN")} km` : ""}
                {c.coverage && <span className={`ml-2 font-semibold ${c.coverage === "within" ? "text-sig-green" : c.coverage === "outside" ? "text-sig-red" : "text-[#8a6100]"}`}>{COVERAGE_LABEL[c.coverage]}</span>}
                <span className="block text-xs text-ink-soft">Chỉ là gợi ý theo ngày và số km; quản lý quyết định có bảo hành hay không.</span></dd></div>
          )}
        </dl>
      </section>
      <CasePanel c={c} events={d.events} costs={d.costs} staff={d.staff} manager={manager} canEdit={canEdit} finance={finance} today={todayVn()} costRequestId={randomUUID()} />
    </>
  );
}
