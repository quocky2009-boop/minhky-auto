import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { getSellers, getStaleDays } from "@/lib/demands/data";
import { suggestBuyersForOffer, suggestForBuy, toBuyCriteria, type BuyDemandRow, type SellPoolRow, type VehiclePoolRow } from "@/lib/demands/suggest";
import { followupState } from "@/lib/followup";
import { formatDate, formatDateTime, relativeDays, toLocalInput } from "@/lib/dates";
import { formatRange, formatVnd } from "@/lib/money";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { MATCH_LEVEL_LABEL, type MatchResult } from "@/lib/matching";
import {
  BUSINESS_TYPE_LABEL, CHANNEL_LABEL, CONDITION_LABEL, CRITERIA_LABEL, FUEL_LABEL, PRIORITY_LABEL, SALE_MODE_LABEL,
  nextStatuses, statusLabel, triLabel,
} from "@/lib/labels";
import { KindTag, Signal, StatusText } from "@/components/ui";
import { loadDemand } from "./load";
import { AcquireForm } from "./acquire-form";
import { getLocations } from "@/lib/vehicles/data";
import { ActivityForm } from "./activity-form";
import { ReassignForm, ShareForm, UploadForm } from "./side-forms";
import { unshareDemand } from "../actions";
import { ConfirmButton } from "@/components/confirm-button";

export const metadata = { title: "Chi tiết nhu cầu" };

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-line/70 py-1.5 text-sm last:border-0">
    <dt className="text-ink-soft">{label}</dt><dd>{children}</dd>
  </div>
);
const unknown = <span className="text-ink-soft">Chưa rõ</span>;
const orUnknown = (v: React.ReactNode) => (v === null || v === undefined || v === "" ? unknown : v);

const LEVEL_STYLE: Record<string, string> = {
  match: "bg-[#e6f2ea] text-sig-green", near: "bg-[#fdf7e6] text-[#8a6100]", verify: "bg-floor text-ink-soft", excluded: "",
};
function MatchCard({ title, sub, result, href, contact }: { title: string; sub: string; result: MatchResult; href?: string; contact?: string }) {
  return (
    <li className="rounded-md border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {href ? <Link href={href} className="font-medium text-petrol hover:underline">{title}</Link> : <span className="font-medium">{title}</span>}
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${LEVEL_STYLE[result.level]}`}>{MATCH_LEVEL_LABEL[result.level]}</span>
      </div>
      <p className="num text-xs text-ink-soft">{sub}</p>
      <p className={`mt-1 text-xs font-medium ${result.readyToDeliver ? "text-sig-green" : "text-[#8a6100]"}`}>{result.availabilityLabel}</p>
      <ul className="mt-1.5 space-y-0.5 text-xs">
        {result.checks.map((c, i) => (
          <li key={i} className={c.outcome === "match" ? "text-ink" : c.outcome === "mismatch" ? "text-sig-red" : "text-ink-soft"}>
            {c.outcome === "match" ? "✓" : c.outcome === "mismatch" ? "✗" : "?"} {c.message}{c.strict && c.outcome !== "match" ? " (bắt buộc)" : ""}
          </li>
        ))}
        {result.reasons.filter((r) => !result.checks.some((c) => c.message === r)).map((r) => <li key={r} className="text-ink-soft">• {r}</li>)}
      </ul>
      {contact && <p className="mt-1.5 text-xs text-ink-soft">{contact}</p>}
    </li>
  );
}

export default async function DemandDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireModule("demands");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const d = await loadDemand(supabase, id);
  if (!d) notFound();

  const manager = isManager(user.roles);
  const active = !["closed", "won", "acquired", "paused"].includes(d.status);
  const [staleDays, sellers, canEditRes, acts, files, shares, poolV, poolS, poolB] = await Promise.all([
    getStaleDays(),
    getSellers(),
    supabase.rpc("can_edit_demand_ui", { p_id: id }),
    supabase.from("demand_activities").select("id, occurred_at, channel, content, result, next_action, next_action_due, status_from, status_to, actor:profiles!demand_activities_actor_id_fkey(full_name)")
      .eq("demand_id", id).order("occurred_at", { ascending: false }).limit(100),
    supabase.from("demand_attachments").select("id, storage_path, file_name, mime_type, size_bytes, created_at").eq("demand_id", id).order("created_at", { ascending: false }),
    supabase.from("demand_shares").select("user_id, user:profiles!demand_shares_user_id_fkey(full_name)").eq("demand_id", id),
    active && d.kind === "buy" ? supabase.rpc("match_pool_vehicles") : Promise.resolve({ data: [] }),
    active && d.kind === "buy" ? supabase.rpc("match_pool_sell_offers") : Promise.resolve({ data: [] }),
    active && d.kind === "sell" && d.offer && !d.offer.converted_vehicle_id ? supabase.rpc("match_pool_buy_demands") : Promise.resolve({ data: [] }),
  ]);
  const canEdit = !!canEditRes.data;
  const canAcquire = manager && d.kind === "sell" && !!d.offer && !d.offer.converted_vehicle_id && ["appraised", "negotiating"].includes(d.status);
  const [convertedVehicle, locations] = await Promise.all([
    d.offer?.converted_vehicle_id ? supabase.from("vehicles").select("id, code").eq("id", d.offer.converted_vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
    canAcquire ? getLocations() : Promise.resolve([]),
  ]);
  const now = new Date();
  const st = followupState(d, staleDays, now);
  const phone = normalizePhone(d.customer.phone);

  // Gợi ý ghép
  let buySug: ReturnType<typeof suggestForBuy> | null = null;
  let sellSug: ReturnType<typeof suggestBuyersForOffer<BuyDemandRow & { code: string; owner_name: string | null; can_open: boolean }>> = [];
  if (active && d.kind === "buy") {
    const criteria = toBuyCriteria({ ...d, options: d.options }, staleDays, now);
    buySug = suggestForBuy(criteria, (poolV.data ?? []) as VehiclePoolRow[], (poolS.data ?? []) as SellPoolRow[], d.id);
  }
  if (active && d.kind === "sell" && d.offer && d.offer.make_id) {
    const offerRow: SellPoolRow = {
      demand_id: d.id, code: d.code, status: d.status, owner_id: d.owner_id, owner_name: d.owner_name, can_open: true, last_activity_at: d.last_activity_at,
      make_id: d.offer.make_id, model_id: d.offer.model_id, variant_id: d.offer.variant_id, make_name: d.offer.make_name, model_name: d.offer.model_name,
      variant_name: d.offer.variant_name, year_made: d.offer.year_made, color: d.offer.color, fuel_type: d.offer.fuel_type, seats: d.offer.seats,
      odo: d.offer.odo, asking_price: d.offer.asking_price, sale_mode: d.offer.sale_mode,
    };
    sellSug = suggestBuyersForOffer(offerRow, (poolB.data ?? []) as (BuyDemandRow & { code: string; owner_name: string | null; can_open: boolean })[], staleDays, now);
  }

  const signed = files.data?.length
    ? (await supabase.storage.from("demand-files").createSignedUrls(files.data.map((f) => f.storage_path), 600)).data ?? []
    : [];
  const shareRows = (shares.data ?? []).map((s) => ({ id: s.user_id as string, name: ((Array.isArray(s.user) ? s.user[0] : s.user) as { full_name: string } | null)?.full_name ?? "" }));
  const shareCandidates = sellers.filter((s) => s.id !== d.owner_id && !shareRows.some((r) => r.id === s.id));
  const defaultDue = toLocalInput(new Date(now.getTime() + 24 * 3600 * 1000));
  const vehicleTitle = (r: { make_name: string | null; model_name: string | null; variant_name: string | null; year_made: number | null }) =>
    [r.make_name, r.model_name, r.variant_name, r.year_made].filter(Boolean).join(" ");

  return (
    <div className="space-y-4">
      {sp["da-tao"] && <p role="status" className="panel border-[#b7d9c3] bg-[#eef7f1] px-4 py-2 text-sm text-sig-green">Đã lưu nhu cầu {d.code}.</p>}
      {sp["da-luu"] && <p role="status" className="panel border-[#b7d9c3] bg-[#eef7f1] px-4 py-2 text-sm text-sig-green">Đã lưu thay đổi.</p>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft"><Link href="/nhu-cau" className="hover:text-petrol">Nhu cầu</Link> / {d.code}</p>
          <h1 className="mt-1 text-xl font-bold md:text-2xl">{d.customer.full_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <KindTag kind={d.kind} tradeIn={!!d.wants_trade_in || d.offer?.sale_mode === "trade_in"} />
            <StatusText kind={d.kind} status={d.status} />
            <Signal state={st} withLabel />
            {d.priority !== "normal" && <span className="text-xs font-medium">{PRIORITY_LABEL[d.priority]}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {phone && <a href={`tel:${phone}`} className="btn btn-primary">Gọi {formatPhone(phone)}</a>}
          {phone && <a href={`https://zalo.me/${phone}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Zalo</a>}
          {canEdit && <Link href={`/nhu-cau/${d.id}/sua`} className="btn btn-ghost">Sửa</Link>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <section className={`panel p-4 ${st === "overdue" ? "border-sig-red" : ""}`}>
            <h2 className="mb-1 text-sm font-semibold">Việc tiếp theo</h2>
            {d.next_action ? (
              <p>{d.next_action} <span className={`num text-sm ${st === "overdue" ? "font-semibold text-sig-red" : "text-ink-soft"}`}>
                — {formatDateTime(d.next_action_due)} ({relativeDays(d.next_action_due, now)})</span></p>
            ) : <p className="text-sm text-ink-soft">Chưa có lịch. {active && "Ghi nhật ký bên dưới và hẹn việc tiếp theo."}</p>}
            {st === "stale" && <p className="mt-1 text-sm text-ink-soft">Đã hơn {staleDays} ngày không cập nhật — cần xác minh lại với khách, không coi nhu cầu còn hiệu lực.</p>}
            {d.status === "closed" && <p className="mt-1 text-sm">Đã đóng {formatDate(d.closed_at)} — lý do: {d.closed_reason}</p>}
            {d.status === "paused" && <p className="mt-1 text-sm">Tạm dừng — lý do: {d.paused_reason}</p>}
          </section>

          {d.kind === "buy" ? (
            <section className="panel p-4">
              <h2 className="mb-2 font-semibold">Tiêu chí khách cần mua</h2>
              <dl>
                <Row label="Phương án xe">{d.options.length ? d.options.map((o, i) => <div key={i}>{[o.make, o.model, o.variant].filter(Boolean).join(" ")}</div>) : unknown}</Row>
                <Row label="Ngân sách"><span className="num">{formatRange(d.budget_min, d.budget_max)}</span></Row>
                <Row label="Đời xe">{d.year_min || d.year_max ? `${d.year_min ?? "…"} – ${d.year_max ?? "…"}` : unknown}</Row>
                <Row label="Màu chấp nhận">{orUnknown(d.colors_accepted.join(", "))}</Row>
                {d.colors_rejected.length > 0 && <Row label="Màu không muốn">{d.colors_rejected.join(", ")}</Row>}
                <Row label="ODO tối đa">{d.odo_max !== null ? `${d.odo_max.toLocaleString("vi-VN")} km` : unknown}</Row>
                <Row label="Nhiên liệu">{orUnknown(d.fuel_types.map((x) => FUEL_LABEL[x]).join(", "))}</Row>
                <Row label="Số chỗ">{orUnknown(d.seats.join(", "))}</Row>
                <Row label="Mới / cũ">{d.condition_pref ? CONDITION_LABEL[d.condition_pref] : unknown}</Row>
                <Row label="Cần vay">{triLabel(d.needs_loan)}</Row>
                <Row label="Đổi xe cũ">{triLabel(d.wants_trade_in)}</Row>
                <Row label="Dự kiến mua">{orUnknown([d.expected_timeframe, d.expected_by && formatDate(d.expected_by)].filter(Boolean).join(" · "))}</Row>
                <Row label="Bắt buộc">{d.strict_criteria.length ? d.strict_criteria.map((c) => CRITERIA_LABEL[c]).join(", ") : "Không có — mọi tiêu chí linh hoạt"}</Row>
                {d.must_have_note && <Row label="Yêu cầu khác">{d.must_have_note}</Row>}
                {d.flexible_note && <Row label="Linh hoạt">{d.flexible_note}</Row>}
              </dl>
            </section>
          ) : (
            <section className="panel p-4">
              <h2 className="font-semibold">Thông tin khách cung cấp</h2>
              <p className="mb-2 text-xs text-ink-soft">Chưa được showroom kiểm tra. Kết quả thẩm định thực tế ghi ở hồ sơ thu mua (chặng 3).</p>
              {d.offer ? (
                <dl>
                  <Row label="Xe">{orUnknown(vehicleTitle(d.offer))}</Row>
                  <Row label="Năm đăng ký">{orUnknown(d.offer.year_registered)}</Row>
                  <Row label="Giá khách muốn"><span className="num">{formatVnd(d.offer.asking_price)}</span> · thương lượng: {triLabel(d.offer.negotiable)}</Row>
                  <Row label="Màu / ODO">{orUnknown(d.offer.color)} · {d.offer.odo !== null ? `${d.offer.odo.toLocaleString("vi-VN")} km` : "ODO chưa rõ"}</Row>
                  <Row label="Nhiên liệu / chỗ">{d.offer.fuel_type ? FUEL_LABEL[d.offer.fuel_type] : "Chưa rõ"} · {d.offer.seats ?? "chưa rõ"} chỗ</Row>
                  <Row label="Biển số / VIN">{orUnknown([d.offer.plate, d.offer.vin].filter(Boolean).join(" · "))}</Row>
                  <Row label="Hình thức">{SALE_MODE_LABEL[d.offer.sale_mode]}</Row>
                  <Row label="Còn vay">{triLabel(d.offer.has_loan)}{d.offer.loan_remaining !== null && d.offer.loan_remaining !== undefined ? ` · dư nợ ${formatVnd(d.offer.loan_remaining)}` : ""}</Row>
                  <Row label="Tình trạng">{orUnknown(d.offer.condition_note)}</Row>
                  <Row label="Lịch sử sửa chữa">{orUnknown(d.offer.repair_history_note)}</Row>
                  <Row label="Hồ sơ">{orUnknown(d.offer.papers_note)}</Row>
                  <Row label="Nơi để xe">{orUnknown(d.offer.vehicle_location)}</Row>
                  <Row label="Muốn bán khi">{orUnknown(d.offer.desired_sell_time)}</Row>
                  <Row label="Hẹn thẩm định">{d.offer.inspection_at ? formatDateTime(d.offer.inspection_at) : unknown}</Row>
                </dl>
              ) : <p className="text-sm text-ink-soft">Chưa có thông tin xe.</p>}
            </section>
          )}

          {(d.raw_message || d.notes) && (
            <section className="panel p-4">
              {d.raw_message && (<><h2 className="mb-1 text-sm font-semibold">Tin nhắn gốc</h2>
                <blockquote className="whitespace-pre-wrap rounded bg-floor p-3 text-sm">{d.raw_message}</blockquote></>)}
              {d.notes && (<><h2 className="mb-1 mt-3 text-sm font-semibold">Ghi chú</h2><p className="whitespace-pre-wrap text-sm">{d.notes}</p></>)}
            </section>
          )}

          {/* Gợi ý ghép */}
          {buySug && (
            <section className="panel p-4">
              <h2 className="font-semibold">Gợi ý xe phù hợp</h2>
              <p className="mb-3 text-xs text-ink-soft">Theo quy tắc rõ ràng; tiêu chí bắt buộc không bị bỏ qua. Hệ thống không tự gửi tin cho khách.</p>
              <h3 className="mb-2 text-sm font-semibold text-sig-green">Xe sẵn bán ({buySug.vehicles.length})</h3>
              {buySug.vehicles.length ? (
                <ul className="mb-4 grid gap-2 md:grid-cols-2">
                  {buySug.vehicles.map(({ item: v, result }) => (
                    <MatchCard key={v.vehicle_id} title={`${v.code} · ${vehicleTitle(v)}`} result={result}
                      sub={`${BUSINESS_TYPE_LABEL[v.business_type]} · ${v.color ?? "màu chưa rõ"} · giá chào ${formatVnd(v.asking_price)}`} />
                  ))}
                </ul>
              ) : <p className="mb-4 text-sm text-ink-soft">Chưa có xe trong kho phù hợp.</p>}
              <h3 className="mb-2 text-sm font-semibold text-[#8a6100]">Nguồn xe khách đang chào bán — chưa thu mua ({buySug.offers.length})</h3>
              {buySug.offers.length ? (
                <ul className="grid gap-2 md:grid-cols-2">
                  {buySug.offers.map(({ item: o, result }) => (
                    <MatchCard key={o.demand_id} title={`${o.code} · ${vehicleTitle(o)}`} result={result}
                      href={o.can_open ? `/nhu-cau/${o.demand_id}` : undefined}
                      sub={`${o.color ?? "màu chưa rõ"} · khách muốn ${formatVnd(o.asking_price)} · ${SALE_MODE_LABEL[o.sale_mode]}`}
                      contact={o.can_open ? undefined : `Khách của ${o.owner_name ?? "đồng nghiệp"} — liên hệ người phụ trách.`} />
                  ))}
                </ul>
              ) : <p className="text-sm text-ink-soft">Chưa có nguồn xe khách chào bán phù hợp.</p>}
            </section>
          )}
          {d.kind === "sell" && active && (
            <section className="panel p-4">
              <h2 className="font-semibold">Khách mua có thể quan tâm ({sellSug.length})</h2>
              <p className="mb-3 text-xs text-ink-soft">Xe này là nguồn chưa thu mua — chỉ giới thiệu là “có thể lấy được xe”, không hứa giao ngay.</p>
              {!d.offer?.make_id ? <p className="text-sm text-ink-soft">Cần nhập hãng xe để ghép.</p> : sellSug.length ? (
                <ul className="grid gap-2 md:grid-cols-2">
                  {sellSug.map(({ item: b, result }) => (
                    <MatchCard key={b.demand_id} title={`${b.code} · ngân sách ${formatRange(b.budget_min, b.budget_max)}`} result={result}
                      href={b.can_open ? `/nhu-cau/${b.demand_id}` : undefined}
                      sub={(b.options ?? []).map((o) => [o.make, o.model, o.variant].filter(Boolean).join(" ")).join(" / ") || "Chưa rõ xe"}
                      contact={b.can_open ? undefined : `Khách của ${b.owner_name ?? "đồng nghiệp"} — liên hệ người phụ trách.`} />
                  ))}
                </ul>
              ) : <p className="text-sm text-ink-soft">Chưa có khách mua phù hợp.</p>}
            </section>
          )}

          <section className="panel p-4">
            <h2 className="mb-3 font-semibold">Ghi nhật ký liên hệ</h2>
            {(() => {
              const allowed = nextStatuses(d.kind, d.status, manager);
              const req = randomUUID();
              return <ActivityForm key={req} demandId={d.id} requestId={req} kind={d.kind} status={d.status} version={d.version}
                allowed={canEdit ? allowed : []} hasNext={!!d.next_action} defaultDue={defaultDue} />;
            })()}
            <h3 className="mb-2 mt-6 text-sm font-semibold">Lịch sử ({acts.data?.length ?? 0})</h3>
            <ol className="space-y-3 border-l-2 border-line pl-4">
              {(acts.data ?? []).map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="num text-xs text-ink-soft">{formatDateTime(a.occurred_at)} · {((Array.isArray(a.actor) ? a.actor[0] : a.actor) as { full_name: string } | null)?.full_name ?? ""} · {CHANNEL_LABEL[a.channel]}</p>
                  <p className="whitespace-pre-wrap">{a.content}</p>
                  {a.result && <p className="text-ink-soft">Kết quả: {a.result}</p>}
                  {a.status_to && <p className="text-xs">Trạng thái: {statusLabel(d.kind, a.status_from ?? "")} → <b>{statusLabel(d.kind, a.status_to)}</b></p>}
                  {a.next_action && <p className="text-xs text-petrol">Hẹn: {a.next_action} — {formatDateTime(a.next_action_due)}</p>}
                </li>
              ))}
              {!acts.data?.length && <li className="text-sm text-ink-soft">Chưa có liên hệ nào.</li>}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="panel p-4">
            <h2 className="mb-2 text-sm font-semibold">Khách hàng</h2>
            <dl>
              <Row label="Mã"><Link href={`/khach-hang/${d.customer.id}`} className="text-petrol hover:underline">{d.customer.code}</Link></Row>
              <Row label="Điện thoại">{d.customer.phone ? formatPhone(d.customer.phone) : unknown}</Row>
              <Row label="Khu vực">{orUnknown(d.customer.area)}</Row>
              <Row label="Nguồn">{orUnknown(d.source_name)}</Row>
              <Row label="Phụ trách">{orUnknown(d.owner_name)}</Row>
              <Row label="Liên hệ gần nhất">{formatDateTime(d.last_contact_at, "Chưa liên hệ")}</Row>
              <Row label="Tạo lúc">{formatDateTime(d.created_at)}</Row>
            </dl>
            <Link href={`/nhu-cau/moi?khach=${d.customer.id}&loai=${d.kind === "buy" ? "sell" : "buy"}`} className="mt-3 block text-sm font-medium text-petrol">
              + Thêm nhu cầu {d.kind === "buy" ? "bán" : "mua"} cho khách này
            </Link>
          </section>

          <section className="panel p-4">
            <h2 className="mb-2 text-sm font-semibold">Tệp đính kèm</h2>
            <ul className="mb-3 space-y-1 text-sm">
              {(files.data ?? []).map((f, i) => (
                <li key={f.id}>
                  {signed[i]?.signedUrl ? <a href={signed[i].signedUrl} target="_blank" rel="noopener noreferrer" className="text-petrol hover:underline">{f.file_name}</a> : f.file_name}
                  <span className="text-xs text-ink-soft"> · {formatDate(f.created_at)}</span>
                </li>
              ))}
              {!files.data?.length && <li className="text-ink-soft">Chưa có tệp.</li>}
            </ul>
            <UploadForm demandId={d.id} />
            <p className="mt-2 text-xs text-ink-soft">Tệp riêng tư; đường dẫn xem chỉ có hiệu lực 10 phút.</p>
          </section>

          {d.kind === "sell" && convertedVehicle.data && (
            <section className="panel border-[#b7d9c3] p-4">
              <h2 className="mb-1 text-sm font-semibold">Đã nhập kho</h2>
              <p className="text-sm">Xe này đã thành <Link href={`/kho-xe/${convertedVehicle.data.id}`} className="font-medium text-petrol hover:underline">{convertedVehicle.data.code}</Link> trong kho.</p>
            </section>
          )}
          {canAcquire && d.offer && (
            <section className="panel p-4">
              <h2 className="mb-2 text-sm font-semibold">Nhập kho (quản lý)</h2>
              <AcquireForm demandId={d.id} requestId={randomUUID()} saleMode={d.offer.sale_mode} locations={locations}
                offer={{ make: d.offer.make_name ?? "", model: d.offer.model_name ?? "", variant: d.offer.variant_name ?? "", year: String(d.offer.year_made ?? ""),
                  color: d.offer.color ?? "", odo: d.offer.odo !== null ? String(d.offer.odo) : "", vin: d.offer.vin ?? "", plate: d.offer.plate ?? "",
                  fuel: d.offer.fuel_type ? FUEL_LABEL[d.offer.fuel_type] : "", price: "" }} />
            </section>
          )}
          {manager && d.kind === "sell" && !d.offer?.converted_vehicle_id && !canAcquire && active && (
            <p className="rounded-md bg-floor p-3 text-xs text-ink-soft">Để nhập xe này vào kho, chuyển nhu cầu sang “Đã thẩm định” hoặc “Thương lượng” bằng nhật ký liên hệ.</p>
          )}

          <section className="panel p-4">
            <h2 className="mb-2 text-sm font-semibold">Chia sẻ để hỗ trợ</h2>
            <ul className="mb-2 space-y-1 text-sm">
              {shareRows.map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  {r.name}
                  {canEdit && (
                    <form action={unshareDemand}><input type="hidden" name="demand_id" value={d.id} /><input type="hidden" name="user_id" value={r.id} />
                      <ConfirmButton message={`Bỏ chia sẻ với ${r.name}?`} className="text-xs text-ink-soft hover:text-sig-red">Bỏ</ConfirmButton></form>
                  )}
                </li>
              ))}
              {!shareRows.length && <li className="text-ink-soft">Chưa chia sẻ cho ai.</li>}
            </ul>
            {canEdit && <ShareForm demandId={d.id} candidates={shareCandidates} />}
            <p className="mt-2 text-xs text-ink-soft">Người được chia sẻ xem và ghi nhật ký được, không sửa tiêu chí.</p>
          </section>

          {manager && d.status !== "closed" && (
            <section className="panel p-4">
              <h2 className="mb-2 text-sm font-semibold">Người phụ trách (quản lý)</h2>
              <ReassignForm demandId={d.id} version={d.version} ownerId={d.owner_id} sellers={sellers} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
