import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canSeeFinance, isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { formatVnd, toVnd } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { ENTRY_STATUS_LABEL, SCOPE_LABEL } from "@/lib/commissions";
import { todayVn } from "@/lib/cashbook";
import { PageHeader } from "@/components/ui";
import { loadAccounts } from "../../thu-chi/load";
import { getEntry } from "../load";
import { CommissionPanel } from "./commission-panel";

export const metadata = { title: "Chi tiết hoa hồng" };

export default async function CommissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("commission");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const d = await getEntry(supabase, id);
  if (!d) notFound();
  const { entry: e, payments } = d;
  const finance = canSeeFinance(user.roles);
  const accounts = finance ? (await loadAccounts(supabase)).filter((a) => a.is_active).map((a) => ({ id: a.id, code: a.code, name: a.name, balance: a.balance })) : [];
  const title = [e.vehicle?.code, e.vehicle?.make, e.vehicle?.model, e.vehicle?.year_made].filter(Boolean).join(" ");
  const snap = e.rule_snapshot;
  return (
    <>
      <PageHeader title={`Hoa hồng ${e.code}`} sub={<>{ENTRY_STATUS_LABEL[e.status]} · {title}</>}>
        <Link href="/hoa-hong" className="btn btn-ghost">← Danh sách</Link>
      </PageHeader>
      <section className="panel mb-4 p-4">
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <div><dt className="inline text-ink-soft">Nhân viên: </dt><dd className="inline">{e.employee?.full_name ?? "—"}</dd></div>
          <div><dt className="inline text-ink-soft">Số tiền: </dt><dd className="num inline font-semibold">{toVnd(e.amount) === null ? "Chưa có quy tắc" : formatVnd(e.amount)}</dd></div>
          <div><dt className="inline text-ink-soft">Xe: </dt><dd className="inline">{finance || isManager(user.roles) ? <Link href={`/kho-xe/${e.vehicle_id}`} className="text-petrol hover:underline">{title}</Link> : title}{e.vehicle?.condition === "used" && e.vehicle.vin ? ` · VIN ${e.vehicle.vin}` : ""} · {e.vehicle?.condition === "new" ? "xe mới" : "xe cũ"}</dd></div>
          <div><dt className="inline text-ink-soft">Đơn bán: </dt><dd className="inline">{e.order ? <Link href={`/don-ban/${e.order_id}`} className="text-petrol hover:underline">{e.order.code}</Link> : "—"} · ký {formatDate(e.sold_on)}</dd></div>
          <div className="md:col-span-2"><dt className="inline text-ink-soft">Quy tắc áp dụng: </dt>
            <dd className="inline">{snap ? `${snap.code} · ${SCOPE_LABEL[snap.scope ?? ""] ?? ""} · hiệu lực từ ${snap.effective_from ? formatDate(snap.effective_from) : "—"}` : "Chưa có quy tắc cho xe này tại ngày ký hợp đồng. Quản lý thêm quy tắc rồi bấm “Tính lại”."}</dd></div>
          {e.approved_at && <div><dt className="inline text-ink-soft">Duyệt lúc: </dt><dd className="inline">{formatDateTime(e.approved_at)}</dd></div>}
          {e.end_reason && <div className="md:col-span-2"><dt className="inline text-ink-soft">Lý do hủy: </dt><dd className="inline">{e.end_reason}</dd></div>}
          {e.status === "approved" && <div className="md:col-span-2"><dt className="inline text-ink-soft">Đã chi / còn lại: </dt><dd className="num inline">{formatVnd(e.paid)} / {formatVnd(e.remaining)}</dd></div>}
        </dl>
        <p className="mt-2 text-xs text-ink-soft">Hoa hồng không trừ trước khi chia lợi nhuận góp vốn; hoa hồng đã duyệt tính vào kết quả toàn showroom. Chưa tính thuế thu nhập cá nhân.</p>
      </section>
      <CommissionPanel e={e} payments={payments} manager={isManager(user.roles)} finance={finance} accounts={accounts} today={todayVn()} requestId={randomUUID()} />
    </>
  );
}
