import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { getCatalog } from "@/lib/demands/data";
import { getLocations, searchVehicles } from "@/lib/vehicles/data";
import { readVehicleFilters, toVehicleQuery, toVehicleRpcFilter, type RawParams } from "@/lib/vehicles/filters";
import { formatVnd } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { BUSINESS_TYPE_LABEL, CONDITION_LABEL, PREP_LABEL, VEHICLE_SALE_STATUS } from "@/lib/labels";
import { Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";

export const metadata = { title: "Kho xe" };
const PAGE = 25;

const QUICK: { label: string; params: Record<string, string> }[] = [
  { label: "Đang tồn kho", params: {} },
  { label: "Đang bán", params: { state: "selling" } },
  { label: "Chưa chào bán", params: { state: "not_listed" } },
  { label: "Xe ký gửi", params: { bt: "consignment" } },
  { label: "Tồn lâu (> 90 ngày)", params: { age: "90" } },
  { label: "Đã bán / kết thúc", params: { state: "ended" } },
];

export default async function InventoryPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const user = await requireModule("inventory");
  const sp = await searchParams;
  const f = readVehicleFilters(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const { rpc, warnings } = toVehicleRpcFilter(f);
  const [catalog, locations, res] = await Promise.all([getCatalog(), getLocations(), searchVehicles(rpc, PAGE, (page - 1) * PAGE)]);
  const manager = isManager(user.roles);
  const active = Object.entries(f).some(([k, v]) => k !== "sort" && !!v);

  return (
    <>
      <PageHeader title="Kho xe" sub={`${res.total} xe khớp bộ lọc · tuổi tồn tính từ ngày nhập kho`}>
        {manager && <Link href="/kho-xe/moi" className="btn btn-primary">+ Nhập xe</Link>}
      </PageHeader>

      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {QUICK.map((q) => {
          const active = toVehicleQuery(q.params) === toVehicleQuery(f);
          return (
            <Link key={q.label} href={`/kho-xe?${toVehicleQuery(q.params)}`}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${active ? "border-petrol bg-petrol text-white" : "border-line bg-surface hover:border-ink-soft"}`}>
              {q.label}
            </Link>
          );
        })}
      </div>

      <form method="get" className="panel mb-4 p-3 md:p-4">
        <div className="flex gap-2">
          <input name="q" defaultValue={f.q} placeholder="Tìm mã xe, VIN, biển số, hãng, model, màu…" className="field" aria-label="Tìm nhanh" />
          <button className="btn btn-primary shrink-0">Lọc</button>
        </div>
        <details className="mt-3" open={active && !f.q}>
          <summary className="cursor-pointer text-sm font-medium text-petrol">Bộ lọc kết hợp</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <label><span className="label">Mới / cũ</span>
              <select name="cond" defaultValue={f.cond} className="field"><option value="">Tất cả</option><option value="new">Xe mới</option><option value="used">Đã qua sử dụng</option></select></label>
            <label><span className="label">Hình thức</span>
              <select name="bt" defaultValue={f.bt} className="field"><option value="">Tất cả</option><option value="owned">Showroom sở hữu</option><option value="consignment">Ký gửi</option></select></label>
            <label><span className="label">Trạng thái bán</span>
              <select name="state" defaultValue={f.state} className="field">
                <option value="">Đang tồn kho</option><option value="all">Tất cả</option><option value="selling">Đang bán / giữ / cọc</option><option value="ended">Đã bán / kết thúc</option>
                {Object.entries(VEHICLE_SALE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
            <label><span className="label">Chuẩn bị</span>
              <select name="prep" defaultValue={f.prep} className="field"><option value="">Tất cả</option>{Object.entries(PREP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label><span className="label">Hãng</span>
              <select name="make" defaultValue={f.make} className="field"><option value="">Tất cả</option>{catalog.makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label><span className="label">Model</span>
              <select name="model" defaultValue={f.model} className="field"><option value="">Tất cả</option>
                {catalog.models.filter((m) => !f.make || m.make_id === f.make).map((m) => <option key={m.id} value={m.id}>{catalog.makes.find((x) => x.id === m.make_id)?.name} {m.name}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="label">Đời từ</span><input name="yf" defaultValue={f.yf} inputMode="numeric" className="field" /></label>
              <label><span className="label">đến</span><input name="yt" defaultValue={f.yt} inputMode="numeric" className="field" /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="label">Giá chào từ</span><input name="pf" defaultValue={f.pf} placeholder="600tr" className="field" /></label>
              <label><span className="label">đến</span><input name="pt" defaultValue={f.pt} placeholder="700tr" className="field" /></label>
            </div>
            <label><span className="label">Màu</span><input name="color" defaultValue={f.color} list="v-colors" className="field" />
              <datalist id="v-colors">{catalog.colors.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label><span className="label">Vị trí</span>
              <select name="loc" defaultValue={f.loc} className="field"><option value="">Tất cả</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label><span className="label">Tồn tối thiểu (ngày)</span><input name="age" defaultValue={f.age} inputMode="numeric" className="field" /></label>
            <label><span className="label">Sắp xếp</span>
              <select name="sort" defaultValue={f.sort} className="field"><option value="">Tồn lâu nhất trước</option><option value="created">Mới nhập</option><option value="price">Giá chào thấp → cao</option></select></label>
          </div>
          <div className="mt-3 flex gap-2"><button className="btn btn-primary">Áp dụng</button><Link href="/kho-xe" className="btn btn-ghost">Xóa lọc</Link></div>
        </details>
      </form>

      {warnings.map((w) => <div key={w} className="mb-3"><ErrorBox message={w} /></div>)}
      {res.error && <ErrorBox message="Không tải được kho xe. Thử tải lại trang." />}
      {!res.error && res.rows.length === 0 && (
        <Empty title={active ? "Không có xe nào khớp bộ lọc." : "Chưa có xe trong kho."} action={manager ? { href: "/kho-xe/moi", label: "+ Nhập xe" } : undefined} />
      )}

      {res.rows.length > 0 && (
        <>
          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-soft">
                <tr><th className="px-3 py-2 font-medium">Mã</th><th className="px-3 py-2 font-medium">Xe</th><th className="px-3 py-2 font-medium">Mới/cũ · Hình thức</th>
                  <th className="px-3 py-2 font-medium">Bán hàng</th><th className="px-3 py-2 font-medium">Chuẩn bị</th><th className="px-3 py-2 font-medium">Giá chào</th><th className="px-3 py-2 font-medium">Vị trí</th><th className="px-3 py-2 font-medium">Tuổi tồn</th></tr>
              </thead>
              <tbody>
                {res.rows.map((v) => (
                  <tr key={v.id} className="border-b border-line last:border-0 hover:bg-floor/60">
                    <td className="px-3 py-2.5 font-semibold"><Link href={`/kho-xe/${v.id}`} className="text-petrol hover:underline">{v.code}</Link></td>
                    <td className="px-3 py-2.5">{[v.spec_name, v.year_made].filter(Boolean).join(" ")}<div className="text-xs text-ink-soft">{v.color ?? "màu chưa rõ"}{v.odo !== null ? ` · ${v.odo.toLocaleString("vi-VN")} km` : ""}{v.plate ? ` · ${v.plate}` : ""}</div></td>
                    <td className="px-3 py-2.5">{CONDITION_LABEL[v.condition]} · {BUSINESS_TYPE_LABEL[v.business_type]}</td>
                    <td className="px-3 py-2.5">{VEHICLE_SALE_STATUS[v.sale_status]}</td>
                    <td className="px-3 py-2.5">{PREP_LABEL[v.prep_status]}</td>
                    <td className="num px-3 py-2.5">{v.asking_price !== null && v.asking_price !== undefined ? formatVnd(v.asking_price) : <span className="text-ink-soft">Chưa có giá</span>}</td>
                    <td className="px-3 py-2.5">{v.location_name ?? <span className="text-ink-soft">Chưa rõ</span>}</td>
                    <td className="num px-3 py-2.5">{v.age_days !== null ? `${v.age_days} ngày` : <span className="text-ink-soft">Chưa rõ ngày nhập</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {res.rows.map((v) => (
              <li key={v.id} className="panel p-3">
                <Link href={`/kho-xe/${v.id}`} className="block">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold text-petrol">{v.code}</span><span className="text-xs text-ink-soft">{VEHICLE_SALE_STATUS[v.sale_status]}</span></div>
                  <div className="mt-0.5 font-medium">{[v.spec_name, v.year_made].filter(Boolean).join(" ")}</div>
                  <div className="text-xs text-ink-soft">{v.color ?? "màu chưa rõ"}{v.odo !== null ? ` · ${v.odo.toLocaleString("vi-VN")} km` : ""} · {BUSINESS_TYPE_LABEL[v.business_type]}</div>
                  <div className="num mt-1 flex justify-between text-sm"><span>{v.asking_price !== null && v.asking_price !== undefined ? formatVnd(v.asking_price) : "Chưa có giá"}</span>
                    <span className="text-ink-soft">{v.age_days !== null ? `${v.age_days} ngày` : `nhập ${formatDate(v.intake_date, "—")}`}</span></div>
                </Link>
              </li>
            ))}
          </ul>
          <Pager total={res.total} page={page} pageSize={PAGE} makeHref={(p) => `/kho-xe?${toVehicleQuery(f, { page: String(p) })}`} />
        </>
      )}
    </>
  );
}
