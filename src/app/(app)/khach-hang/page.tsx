import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";

export const metadata = { title: "Khách hàng" };
const PAGE = 25;
type Row = { id: string; code: string; full_name: string; phone: string | null; area: string | null; owner_name: string | null; updated_at: string; open_demands: number };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireModule("customers");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_customers", { p_q: q || null, p_limit: PAGE, p_offset: (page - 1) * PAGE });
  const res = (data as { total: number; rows: Row[] } | null) ?? { total: 0, rows: [] };
  return (
    <>
      <PageHeader title="Khách hàng" sub={`${res.total} khách`}>
        <Link href="/nhu-cau/moi" className="btn btn-primary">+ Thêm nhu cầu / khách</Link>
      </PageHeader>
      <form method="get" className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Tên, số điện thoại, khu vực…" className="field" aria-label="Tìm khách" />
        <button className="btn btn-primary shrink-0">Tìm</button>
      </form>
      {error && <ErrorBox message="Không tải được danh sách khách." />}
      {!error && res.rows.length === 0 && <Empty title={q ? "Không tìm thấy khách phù hợp." : "Chưa có khách hàng."} />}
      {res.rows.length > 0 && (
        <div className="panel divide-y divide-line">
          {res.rows.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link href={`/khach-hang/${c.id}`} className="min-w-0">
                <p className="font-medium">{c.full_name} <span className="text-xs font-normal text-ink-soft">{c.code}</span></p>
                <p className="text-xs text-ink-soft">
                  {c.phone ? formatPhone(c.phone) : "Chưa có SĐT"}{c.area ? ` · ${c.area}` : ""} · {c.open_demands} nhu cầu đang mở
                  {c.owner_name ? ` · ${c.owner_name}` : ""} · cập nhật {formatDate(c.updated_at)}
                </p>
              </Link>
              {c.phone && <a href={`tel:${c.phone}`} className="btn btn-ghost shrink-0 !px-3 text-sm">Gọi</a>}
            </div>
          ))}
        </div>
      )}
      <Pager total={res.total} page={page} pageSize={PAGE} makeHref={(p) => `/khach-hang?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`} />
    </>
  );
}
