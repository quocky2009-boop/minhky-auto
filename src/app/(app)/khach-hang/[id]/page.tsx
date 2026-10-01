import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSources } from "@/lib/demands/data";
import { formatDateTime } from "@/lib/dates";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { formatRange } from "@/lib/money";
import { KindTag, PageHeader, StatusText } from "@/components/ui";
import { CustomerForm } from "./customer-form";

export const metadata = { title: "Khách hàng" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("customers");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase.from("customers")
    .select("id, code, version, full_name, phone, area, address, source_id, notes, created_at, owner:profiles!customers_owner_id_fkey(full_name)")
    .eq("id", id).maybeSingle();
  if (!c) notFound();
  const [sources, demands] = await Promise.all([getSources(), supabase.from("demand_search")
    .select("id, code, kind, status, is_trade_in, vehicle_summary, price_low, price_high, last_activity_at")
    .eq("customer_id", id).order("created_at", { ascending: false })]);
  const phone = normalizePhone(c.phone);
  const owner = (Array.isArray(c.owner) ? c.owner[0] : c.owner) as { full_name: string } | null;
  return (
    <>
      <PageHeader title={c.full_name} sub={`${c.code} · phụ trách: ${owner?.full_name ?? "—"} · tạo ${formatDateTime(c.created_at)}`}>
        {phone && <a href={`tel:${phone}`} className="btn btn-primary">Gọi {formatPhone(phone)}</a>}
        {phone && <a href={`https://zalo.me/${phone}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Zalo</a>}
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Nhu cầu của khách ({demands.data?.length ?? 0})</h2>
            <span className="flex gap-3 text-sm">
              <Link href={`/nhu-cau/moi?khach=${c.id}&loai=buy`} className="font-medium text-petrol">+ Cần mua</Link>
              <Link href={`/nhu-cau/moi?khach=${c.id}&loai=sell`} className="font-medium text-petrol">+ Cần bán</Link>
            </span>
          </div>
          <ul className="divide-y divide-line">
            {(demands.data ?? []).map((d) => (
              <li key={d.id} className="py-2">
                <Link href={`/nhu-cau/${d.id}`} className="block hover:text-petrol">
                  <div className="flex items-center gap-2 text-xs"><KindTag kind={d.kind} tradeIn={d.is_trade_in} /><span className="text-ink-soft">{d.code}</span><StatusText kind={d.kind} status={d.status} /></div>
                  <div className="text-sm">{d.vehicle_summary || "Chưa rõ xe"} <span className="num text-xs text-ink-soft">· {formatRange(d.price_low, d.price_high)}</span></div>
                </Link>
              </li>
            ))}
            {!demands.data?.length && <li className="py-2 text-sm text-ink-soft">Anh/chị chưa có nhu cầu nào của khách này trong phạm vi được xem.</li>}
          </ul>
        </section>
        <section className="panel p-4">
          <h2 className="mb-3 font-semibold">Thông tin khách</h2>
          <CustomerForm c={c} sources={sources} />
          <p className="mt-3 text-xs text-ink-soft">Đổi người phụ trách khách do quản lý thực hiện. Không gộp khách tự động.</p>
        </section>
      </div>
    </>
  );
}
