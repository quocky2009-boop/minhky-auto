import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { SETTLEMENT_KIND_LABEL, SETTLEMENT_STATUS_LABEL } from "@/lib/settlements";
import { PageHeader } from "@/components/ui";
import { getSettlement } from "../load";
import { SettlementPanel } from "./settlement-panel";

export const metadata = { title: "Chi tiết quyết toán" };

export default async function SettlementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireModule("settlement");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getSettlement(await createClient(), id);
  if (!d) notFound();
  const { settlement: s } = d;
  const title = [s.vehicle?.code, s.vehicle?.make, s.vehicle?.model, s.vehicle?.year_made].filter(Boolean).join(" ");
  return (
    <>
      <PageHeader title={`Quyết toán ${s.code}${s.version_no > 1 ? ` · bản ${s.version_no}` : ""}`} sub={<>{SETTLEMENT_STATUS_LABEL[s.status]} · {title}</>}>
        <Link href="/quyet-toan" className="btn btn-ghost">← Danh sách</Link>
      </PageHeader>
      {sp["da-tao"] && <p role="status" className="mb-3 text-sm text-sig-green">Đã tạm tính quyết toán. Kiểm tra số liệu rồi trình quản lý phê duyệt.</p>}
      <section className="panel mb-4 p-4">
        <dl className="grid gap-2 text-sm md:grid-cols-3">
          <div><dt className="text-ink-soft">Loại</dt><dd>{SETTLEMENT_KIND_LABEL[s.kind]}</dd></div>
          <div><dt className="text-ink-soft">Xe / đơn bán</dt><dd><Link href={`/kho-xe/${s.vehicle_id}`} className="text-petrol hover:underline">{title}</Link> · <Link href={`/don-ban/${s.order_id}`} className="text-petrol hover:underline">{s.order?.code}</Link></dd></div>
          <div><dt className="text-ink-soft">Giá bán (hợp đồng)</dt><dd className="num font-semibold">{formatVnd(s.sale_price)}</dd></div>
          {s.kind === "owned" && <>
            <div><dt className="text-ink-soft">Giá mua</dt><dd className="num">{formatVnd(s.purchase_price)}</dd></div>
            <div><dt className="text-ink-soft">Chi phí được trừ trước khi chia</dt><dd className="num">{formatVnd(s.costs_deducted)} <span className="text-xs text-ink-soft">({s.inputs?.cost_basis === "no_costs" ? "không trừ" : "mọi chi phí đã xác nhận"})</span></dd></div>
            <div><dt className="text-ink-soft">Lợi nhuận phân chia P</dt><dd className="num font-semibold">{formatVnd(s.distributable)}</dd></div>
            {s.result === "profit" && <>
              <div><dt className="text-ink-soft">Phần công ty vận hành C ({String(s.company_rate)}%)</dt><dd className="num">{formatVnd(s.company_operating)}</dd></div>
              <div><dt className="text-ink-soft">Phần còn lại R = P − C</dt><dd className="num">{formatVnd(s.remainder)}</dd></div>
            </>}
          </>}
          {s.kind === "consignment" && <>
            <div><dt className="text-ink-soft">Phí ký gửi showroom hưởng</dt><dd className="num">{formatVnd(s.fee_amount)}</dd></div>
            <div><dt className="text-ink-soft">Chi phí chủ xe chịu</dt><dd className="num">{formatVnd(s.costs_deducted)}</dd></div>
          </>}
          <div><dt className="text-ink-soft">Tạm tính</dt><dd>{s.creator?.full_name ?? "—"} · {formatDateTime(s.created_at)}</dd></div>
          {s.checked_at && <div><dt className="text-ink-soft">Kiểm tra</dt><dd>{s.checker?.full_name ?? "—"} · {formatDateTime(s.checked_at)}</dd></div>}
          {s.approved_at && <div><dt className="text-ink-soft">Phê duyệt</dt><dd>{s.approver?.full_name ?? "—"} · {formatDateTime(s.approved_at)}</dd></div>}
          {s.adjust_reason && <div className="md:col-span-3"><dt className="text-ink-soft">Lý do điều chỉnh</dt><dd>{s.adjust_reason}</dd></div>}
          {s.loss_decision && <div className="md:col-span-3"><dt className="text-ink-soft">Cách xử lý hòa vốn/lỗ</dt><dd>{s.loss_decision}</dd></div>}
          {s.end_reason && <div className="md:col-span-3"><dt className="text-ink-soft">Lý do hủy</dt><dd>{s.end_reason}</dd></div>}
        </dl>
      </section>
      <SettlementPanel s={s} lines={d.lines} blockers={d.blockers} stale={d.stale} manager={isManager(user.roles)} requestId={randomUUID()} />
    </>
  );
}
