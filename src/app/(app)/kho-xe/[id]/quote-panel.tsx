"use client";

import Link from "next/link";
import { useActionState } from "react";
import { quoteAction } from "../quote-actions";
import type { ActionState } from "../../nhu-cau/actions";
import { QUOTE_STATUS_LABEL, QUOTE_VERSION_STATUS_LABEL, isAcceptable, isExpiredVersion } from "@/lib/quotes";
import { formatVnd, toVnd } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import type { QuoteDemandOption, QuoteRow, QuoteVersionRow } from "./quote-load";

type Props = {
  vehicleId: string; saleStatus: string; canSell: boolean; manager: boolean; finance: boolean; userId: string;
  quotes: QuoteRow[]; demandOptions: QuoteDemandOption[]; requestIds: { create: string; createVersion: string; revise: string };
};

const VERSION_STYLE: Record<string, string> = {
  pending_approval: "bg-[#fdf7e6] text-[#8a6100]", issued: "bg-[#e6f2ea] text-sig-green", accepted: "bg-[#e6f2ea] text-sig-green",
  rejected: "bg-floor text-sig-red", superseded: "bg-floor text-ink-soft", cancelled: "bg-floor text-ink-soft line-through",
};

export function QuotePanel(p: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(quoteAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const confirm = (msg: string) => (e: React.MouseEvent) => { if (!window.confirm(msg)) e.preventDefault(); };
  const open = p.quotes.filter((q) => q.status === "open");
  const closed = p.quotes.filter((q) => q.status !== "open");
  const message = s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>;
  const Hid = ({ intent, q, v }: { intent: string; q?: QuoteRow; v?: QuoteVersionRow }) => (
    <><input type="hidden" name="intent" value={intent} /><input type="hidden" name="vehicle_id" value={p.vehicleId} />
      {q && <><input type="hidden" name="id" value={q.id} /><input type="hidden" name="version" value={q.version} /></>}
      {v && <input type="hidden" name="version_id" value={v.id} />}</>
  );
  const VersionLine = ({ v }: { v: QuoteVersionRow }) => {
    const disc = toVnd(v.list_price) !== null && toVnd(v.offered_price) !== null ? toVnd(v.list_price)! - toVnd(v.offered_price)! : null;
    return (
      <li className="border-b border-line/60 pb-2 text-sm">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${VERSION_STYLE[v.status]}`}>{QUOTE_VERSION_STATUS_LABEL[v.status]}</span>{" "}
        <b>Bản {v.version_no}</b> · giá báo <b className="num">{formatVnd(v.offered_price)}</b>
        {disc !== null && <span className="text-ink-soft"> ({disc > 0 ? `giảm ${formatVnd(disc)} so với giá niêm yết ${formatVnd(v.list_price)}` : disc < 0 ? `cao hơn giá niêm yết ${formatVnd(v.list_price)}` : "bằng giá niêm yết"})</span>}
        {toVnd(v.list_price) === null && <span className="text-ink-soft"> (xe chưa có giá niêm yết)</span>}
        {" "}· hiệu lực đến <span className={isExpiredVersion(v) ? "font-semibold text-sig-red" : ""}>{formatDateTime(v.valid_until)}{isExpiredVersion(v) ? " (ĐÃ HẾT HẠN)" : ""}</span>
        {v.needs_approval && <span className="text-[#8a6100]"> · giá thấp hơn mức cho phép</span>}
        {v.benefits && <div><span className="text-ink-soft">Ưu đãi: </span>{v.benefits}</div>}
        {v.note && <div><span className="text-ink-soft">Ghi chú: </span>{v.note}</div>}
        {v.decision_reason && <div className="text-ink-soft">{v.status === "rejected" ? "Từ chối" : "Duyệt"}{v.decider ? ` bởi ${v.decider.full_name}` : ""}: {v.decision_reason}</div>}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {message}
      {open.map((q) => {
        const cur = q.versions[0];
        const mine = q.owner_id === p.userId || p.manager;
        return (
          <div key={q.id} className="rounded-md border border-line p-3">
            <p className="text-sm">
              <b>{q.code}</b> · {QUOTE_STATUS_LABEL[q.status]} · Khách: {q.customer?.full_name ?? "—"}{q.customer?.phone ? ` · ${q.customer.phone}` : ""} · Nhu cầu:{" "}
              {q.demand ? <Link href={`/nhu-cau/${q.demand.id}`} className="text-petrol hover:underline">{q.demand.code}</Link> : "—"} · Phụ trách: {q.owner?.full_name ?? "—"}
            </p>
            <ul className="mt-2 space-y-2">{q.versions.map((v) => <VersionLine key={v.id} v={v} />)}</ul>
            {cur?.status === "pending_approval" && !p.manager && <p className="mt-2 text-xs text-[#8a6100]">Phiên bản này đang chờ quản lý duyệt. Chưa báo giá này cho khách cho đến khi được duyệt.</p>}
            {cur?.status === "pending_approval" && p.manager && (
              <div className="mt-2 flex flex-wrap gap-2">
                {(["approve", "reject"] as const).map((it) => (
                  <details key={it}>
                    <summary className={`btn btn-ghost !py-1 cursor-pointer text-sm ${it === "reject" ? "text-sig-red" : ""}`}>{it === "approve" ? "Duyệt giá này" : "Từ chối"}</summary>
                    <form action={action} className="mt-2 flex gap-2"><Hid intent={it} q={q} v={cur} />
                      <input name="reason" className="field" placeholder={it === "approve" ? "Lý do duyệt giá thấp *" : "Lý do từ chối *"} aria-label="Lý do" required />
                      <button className={`btn shrink-0 ${it === "approve" ? "btn-primary" : "btn-danger"}`} disabled={pending}>{it === "approve" ? "Duyệt" : "Từ chối"}</button></form>
                  </details>
                ))}
              </div>
            )}
            {mine && (
              <div className="mt-2 flex flex-wrap gap-2">
                {cur && isAcceptable(cur) && (
                  <form action={action}><Hid intent="accept" q={q} v={cur} />
                    <button className="btn btn-primary !py-1 text-sm" disabled={pending} onClick={confirm("Ghi nhận khách chấp nhận bản báo giá này? Đây chưa phải đơn bán hay thu tiền.")}>Khách chấp nhận bản {cur.version_no}</button></form>
                )}
                <details>
                  <summary className="btn btn-ghost !py-1 cursor-pointer text-sm">Sửa giá / lập phiên bản mới</summary>
                  <form action={action} className="mt-2 grid gap-2 md:grid-cols-2"><Hid intent="revise" q={q} /><input type="hidden" name="request_id" value={p.requestIds.revise} />
                    <label><span className="label">Giá báo mới *</span><input name="offered_price" className="field" placeholder="640tr" /><Err k="offered_price" /></label>
                    <label><span className="label">Hiệu lực đến * (không có hạn mặc định)</span><input type="datetime-local" name="valid_until" className="field" /><Err k="valid_until" /></label>
                    <label><span className="label">Ưu đãi / quà tặng</span><input name="benefits" className="field" /></label>
                    <label><span className="label">Ghi chú</span><input name="note" className="field" /></label>
                    <button className="btn btn-primary md:w-fit" disabled={pending}>Lập phiên bản mới</button>
                    <p className="text-xs text-ink-soft md:col-span-2">Phiên bản cũ không bị sửa; bản mới thay thế bản đang hiệu lực. Nếu giá thấp hơn mức cho phép, bản mới chờ quản lý duyệt.</p>
                  </form>
                </details>
                <details>
                  <summary className="btn btn-ghost !py-1 cursor-pointer text-sm text-sig-red">Hủy báo giá</summary>
                  <form action={action} className="mt-2 flex gap-2"><Hid intent="cancel" q={q} />
                    <input name="reason" className="field" placeholder="Lý do hủy *" aria-label="Lý do hủy báo giá" required />
                    <button className="btn btn-danger shrink-0" disabled={pending} onClick={confirm("Hủy báo giá này? Các phiên bản được giữ lại để tra cứu.")}>Hủy</button></form>
                </details>
              </div>
            )}
          </div>
        );
      })}

      {p.canSell && ["available", "held", "deposited"].includes(p.saleStatus) && (
        <details className="rounded-md border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-petrol">+ Lập báo giá cho khách</summary>
          <form action={action} className="mt-3 grid gap-3 md:grid-cols-2">
            <Hid intent="create" /><input type="hidden" name="request_id" value={p.requestIds.create} /><input type="hidden" name="version_request_id" value={p.requestIds.createVersion} />
            <label><span className="label">Nhu cầu mua của khách *</span>
              <select name="demand_id" defaultValue="" className="field"><option value="">— Chọn nhu cầu —</option>
                {p.demandOptions.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.customer_name}</option>)}</select><Err k="demand_id" /></label>
            <label><span className="label">Giá báo cho khách *</span><input name="offered_price" className="field" placeholder="650tr" /><Err k="offered_price" /></label>
            <label><span className="label">Hiệu lực đến * (không có hạn mặc định)</span><input type="datetime-local" name="valid_until" className="field" /><Err k="valid_until" /></label>
            <label><span className="label">Ưu đãi / quà tặng</span><input name="benefits" className="field" placeholder="Tặng phim cách nhiệt, bảo dưỡng 1 năm…" /></label>
            <label className="md:col-span-2"><span className="label">Ghi chú</span><input name="note" className="field" /></label>
            <button className="btn btn-primary md:w-fit" disabled={pending}>Lập báo giá</button>
            <p className="text-xs text-ink-soft md:col-span-2">Hệ thống tự kiểm tra giá với mức cho phép của xe; nếu thấp hơn, báo giá chờ quản lý duyệt (anh/chị không cần và không xem được giá sàn). Mỗi khách + xe chỉ một báo giá đang mở — muốn đổi giá hãy lập phiên bản mới.</p>
          </form>
        </details>
      )}
      {p.canSell && ["available", "held", "deposited"].includes(p.saleStatus) && p.demandOptions.length === 0 && <p className="text-xs text-ink-soft">Chưa có nhu cầu mua đang mở nào của anh/chị để lập báo giá. Tạo nhu cầu mua trước.</p>}

      {closed.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Báo giá đã kết thúc</h3>
          <ul className="space-y-2">
            {closed.map((q) => (
              <li key={q.id} className="text-sm">
                <b>{q.code}</b> · {QUOTE_STATUS_LABEL[q.status]} · {q.customer?.full_name ?? "—"} · {formatDateTime(q.created_at)}{q.end_reason ? <span className="text-ink-soft"> — {q.end_reason}</span> : null}
                <details className="mt-1"><summary className="cursor-pointer text-xs text-petrol">Xem các phiên bản</summary><ul className="mt-1 space-y-2">{q.versions.map((v) => <VersionLine key={v.id} v={v} />)}</ul></details>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.quotes.length === 0 && !(p.canSell && ["available", "held", "deposited"].includes(p.saleStatus)) && <p className="text-sm text-ink-soft">Chưa có báo giá nào.</p>}
      {p.finance && !p.canSell && <p className="text-xs text-ink-soft">Kế toán chỉ xem; báo giá do sales và quản lý lập.</p>}
    </div>
  );
}
