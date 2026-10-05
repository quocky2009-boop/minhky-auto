"use client";

import { useActionState, useMemo, useState } from "react";
import { capitalAction } from "../capital-actions";
import type { ActionState } from "../../nhu-cau/actions";
import {
  COST_BASIS_LABEL, ENTRY_TYPE_LABEL, LOAN_KIND_LABEL, PARTY_KIND_LABEL, TERMS_STATUS_LABEL,
  formatScaledPercent, previewProfitSplit, settlementBlockers, sumPercent,
} from "@/lib/capital";
import { formatVnd, parseVndInput } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { EntryRow, LoanRow, PartyRow, SummaryRow, TermsRow } from "./capital-load";

type Props = {
  vehicleId: string; manager: boolean;
  parties: PartyRow[]; terms: TermsRow[]; entries: EntryRow[]; summary: SummaryRow[]; loans: LoanRow[]; needsReconfirm: boolean;
  purchasePrice: string | null; confirmedCosts: string | null; openCostLines: number;
  requestIds: { party: string; terms: string; entry: string; loan: string; loanPay: Record<string, string> };
};

const STATUS_STYLE: Record<string, string> = { draft: "bg-[#fdf7e6] text-[#8a6100]", approved: "bg-[#e6f2ea] text-sig-green", superseded: "bg-floor text-ink-soft", void: "bg-floor text-ink-soft line-through" };
const pct = (v: string) => formatScaledPercent(sumPercent([v])) + "%";

export function CapitalPanel(p: Props) {
  const { vehicleId, manager, parties, terms, entries, summary, loans } = p;
  const [s, action, pending] = useActionState<ActionState, FormData>(capitalAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const confirm = (msg: string) => (e: React.MouseEvent) => { if (!window.confirm(msg)) e.preventDefault(); };
  const Hid = ({ intent, id, version }: { intent: string; id?: string; version?: number }) => (
    <><input type="hidden" name="intent" value={intent} /><input type="hidden" name="vehicle_id" value={vehicleId} />
      {id && <input type="hidden" name="id" value={id} />}{version !== undefined && <input type="hidden" name="version" value={version} />}</>
  );
  const partyName = (id: string) => parties.find((x) => x.id === id)?.name ?? "—";
  const partyKind = (id: string) => parties.find((x) => x.id === id)?.kind ?? "individual";
  const activeParties = parties.filter((x) => x.is_active);

  const current = terms.find((t) => t.status === "approved") ?? null;
  const drafts = terms.filter((t) => t.status === "draft");
  const history = terms.filter((t) => t.status === "superseded" || t.status === "void");
  const sumOf = (id: string) => summary.find((x) => x.party_id === id);
  const blockers = settlementBlockers(current, p.needsReconfirm);

  // Dòng tỷ lệ trong form lập điều khoản
  const [rows, setRows] = useState<{ party: string; ratio: string }[]>([{ party: "", ratio: "" }, { party: "", ratio: "" }]);
  const ratioSum = useMemo(() => {
    try { return sumPercent(rows.map((r) => r.ratio.trim().replace(",", ".")).filter((v) => /^\d{1,3}(\.\d{1,4})?$/.test(v))); } catch { return 0n; }
  }, [rows]);

  // Ước tính chia lợi nhuận
  const [sale, setSale] = useState("");
  const preview = useMemo(() => {
    if (!current || !sale.trim()) return null;
    let salePrice: bigint | null = null;
    try { salePrice = parseVndInput(sale); } catch { return { ok: false as const, message: "Không hiểu giá bán. Ví dụ: 700tr" }; }
    if (salePrice === null) return null;
    return previewProfitSplit({
      salePrice, purchasePrice: p.purchasePrice === null ? null : BigInt(p.purchasePrice), confirmedCosts: p.confirmedCosts === null ? null : BigInt(p.confirmedCosts),
      openCostLines: p.openCostLines, terms: { cost_basis: current.cost_basis, company_rate: current.company_rate },
      shares: current.shares.map((sh) => ({ party_id: sh.party_id, name: partyName(sh.party_id), kind: partyKind(sh.party_id), ratio_percent: sh.ratio_percent })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale, current, p.purchasePrice, p.confirmedCosts, p.openCostLines, parties]);

  return (
    <div className="space-y-5">
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}

      {/* ---- Điều khoản đang hiệu lực ---- */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">Điều khoản chia lợi nhuận đang hiệu lực</h3>
        {current ? (
          <div className="space-y-2">
            <p className="text-sm">
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE.approved}`}>Phiên bản {current.version_no}</span>{" "}
              Tỷ lệ dành cho công ty (vận hành): <b className="num">{pct(current.company_rate)}</b> · Duyệt {formatDate(current.approved_at)}
              {current.agreement_ref ? ` · ${current.agreement_ref}` : ""}
            </p>
            <dl className="grid gap-1 text-sm md:grid-cols-2">
              <div><dt className="inline text-ink-soft">Chi phí trừ trước khi chia: </dt><dd className="inline">{current.cost_basis ? COST_BASIS_LABEL[current.cost_basis] : <span className="text-[#8a6100]">Chờ xác nhận</span>}</dd></div>
              <div><dt className="inline text-ink-soft">Xử lý hòa vốn/lỗ: </dt><dd className="inline">{current.loss_policy || <span className="text-[#8a6100]">Chờ xác nhận</span>}</dd></div>
              {current.basis_note && <div className="md:col-span-2"><dt className="inline text-ink-soft">Căn cứ: </dt><dd className="inline">{current.basis_note}</dd></div>}
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs text-ink-soft"><th className="py-1 pr-2">Bên góp vốn</th><th className="pr-2">Tỷ lệ chia</th><th className="pr-2">Vốn cam kết</th><th className="pr-2">Đã nhận</th><th className="pr-2">Đã rút</th><th>Thực nhận ròng</th></tr></thead>
                <tbody>
                  {current.shares.map((sh) => {
                    const x = sumOf(sh.party_id);
                    return (
                      <tr key={sh.party_id} className="border-b border-line/60">
                        <td className="py-1 pr-2">{partyName(sh.party_id)} <span className="text-xs text-ink-soft">({PARTY_KIND_LABEL[partyKind(sh.party_id)]})</span></td>
                        <td className="num pr-2">{pct(sh.ratio_percent)}</td>
                        <td className="num pr-2">{x ? formatVnd(x.committed) : <span className="text-ink-soft">Chưa ghi</span>}</td>
                        <td className="num pr-2">{x ? formatVnd(x.received) : <span className="text-ink-soft">Chưa ghi</span>}</td>
                        <td className="num pr-2">{x ? formatVnd(x.withdrawn) : <span className="text-ink-soft">Chưa ghi</span>}</td>
                        <td className="num">{x ? formatVnd(x.net_received) : <span className="text-ink-soft">Chưa ghi</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-soft">Cam kết, thực nhận và rút vốn là ba số tách riêng. Tỷ lệ chia là căn cứ đã được xác nhận; hệ thống không tự đổi tỷ lệ theo vốn thực nhận hay theo thời gian.</p>
          </div>
        ) : <p className="text-sm text-ink-soft">Chưa có điều khoản được duyệt. Xe chưa quyết toán chia lợi nhuận được.</p>}

        {p.needsReconfirm && current && (
          <div className="mt-2 rounded-md border border-[#e6c97a] bg-[#fdf7e6] p-3 text-sm">
            <p className="font-semibold text-[#8a6100]">Vốn góp đã thay đổi sau khi duyệt — cần xác nhận lại căn cứ phân chia.</p>
            <p className="text-xs text-ink-soft">Tỷ lệ chia chưa bị đổi. Quản lý xác nhận tỷ lệ vẫn đúng, hoặc lập và duyệt phiên bản mới.</p>
            {manager && (
              <form action={action} className="mt-2 flex flex-wrap gap-2">
                <Hid intent="reconfirm" id={current.id} version={current.version} />
                <input name="note" className="field min-w-[16rem] flex-1" placeholder="Vì sao tỷ lệ vẫn đúng (ví dụ: các bên đã thống nhất giữ 60/40) *" aria-label="Nội dung xác nhận" /><Err k="note" />
                <button className="btn btn-primary" disabled={pending} onClick={confirm("Xác nhận lại căn cứ phân chia với tỷ lệ hiện tại?")}>Xác nhận lại</button>
              </form>
            )}
          </div>
        )}

        <div className="mt-2 rounded-md bg-floor p-2 text-sm">
          <p className="font-semibold">Điều kiện để quyết toán (chặng bán hàng sẽ dùng):</p>
          {blockers.length === 0 ? <p className="text-sig-green">Điều khoản đủ điều kiện. Còn cần giao dịch bán thật và quy trình tạm tính → kiểm tra → phê duyệt → thanh toán.</p> : (
            <ul className="ml-5 list-disc text-[#8a6100]">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          )}
        </div>
      </div>

      {/* ---- Ước tính ---- */}
      {current && (
        <div className="rounded-md border border-line p-3">
          <h3 className="mb-1 text-sm font-semibold">Ước tính chia lợi nhuận (không phải quyết toán)</h3>
          <label className="block max-w-xs"><span className="label">Nếu bán xe với giá</span>
            <input value={sale} onChange={(e) => setSale(e.target.value)} className="field" placeholder="700tr" inputMode="decimal" /></label>
          {preview && !preview.ok && <p className="mt-2 text-sm text-[#8a6100]">{preview.message}</p>}
          {preview && preview.ok && (
            <div className="mt-2 space-y-1 text-sm">
              <p>Lợi nhuận được chia P = giá bán − giá mua{preview.deducted > 0n ? " − chi phí đã xác nhận" : ""} = <b className="num">{formatVnd(preview.distributable)}</b>
                {preview.deducted > 0n ? <span className="text-ink-soft"> (đã trừ {formatVnd(preview.deducted)} chi phí)</span> : null}</p>
              <p>Công ty (vận hành, {pct(current.company_rate)}): <b className="num">{formatVnd(preview.split.companyOperatingShare)}</b> · Còn lại chia theo tỷ lệ: <b className="num">{formatVnd(preview.split.remainder)}</b></p>
              <ul className="ml-5 list-disc">
                {preview.split.shares.map((sh) => <li key={sh.id}>{sh.label}{sh.isCompany ? " (công ty góp vốn)" : ""}: <b className="num">{formatVnd(sh.amount)}</b></li>)}
              </ul>
              {preview.split.shares.some((x) => x.isCompany) && <p>Công ty nhận tổng cộng <b className="num">{formatVnd(preview.split.companyTotal)}</b> (phần vận hành + phần theo vốn góp, không đếm trùng).</p>}
              {preview.warnings.map((w) => <p key={w} className="text-[#8a6100]">{w}</p>)}
              <p className="text-xs text-ink-soft">Lợi nhuận không đồng nghĩa tiền mặt sẵn có. Quyết toán thật cần giao dịch bán và được phê duyệt.</p>
            </div>
          )}
        </div>
      )}

      {/* ---- Bản nháp / lịch sử ---- */}
      {(drafts.length > 0 || history.length > 0) && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Các phiên bản khác</h3>
          <ul className="space-y-2 text-sm">
            {[...drafts, ...history].map((t) => {
              const total = sumPercent(t.shares.map((x) => x.ratio_percent));
              return (
                <li key={t.id} className="rounded-md border border-line p-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[t.status]}`}>{TERMS_STATUS_LABEL[t.status]}</span>{" "}
                  <b>v{t.version_no}</b> · công ty {pct(t.company_rate)} · {t.shares.map((x) => `${partyName(x.party_id)} ${pct(x.ratio_percent)}`).join(", ") || "chưa có bên nào"}
                  {t.status === "draft" && <span className={total === 1_000_000n ? "text-sig-green" : "text-sig-red"}> · tổng {formatScaledPercent(total)}%</span>}
                  {t.status === "void" && t.void_reason && <span className="text-ink-soft"> · lý do hủy: {t.void_reason}</span>}
                  {manager && t.status === "draft" && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      <form action={action}><Hid intent="terms_approve" id={t.id} version={t.version} />
                        <button className="btn btn-primary !py-1 text-sm" disabled={pending || total !== 1_000_000n} title={total !== 1_000_000n ? "Tổng tỷ lệ chia phải đúng 100%" : undefined}
                          onClick={confirm("Duyệt điều khoản này? Bản đã duyệt không sửa được, chỉ thay bằng phiên bản mới.")}>Duyệt</button></form>
                      <form action={action} className="flex gap-1"><Hid intent="terms_discard" id={t.id} version={t.version} />
                        <input name="reason" className="field !w-40 !py-0.5 text-xs" placeholder="Lý do hủy" aria-label="Lý do hủy bản nháp" required />
                        <button className="btn btn-ghost !py-1 text-sm" disabled={pending}>Hủy nháp</button></form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {manager && (
        <details className="rounded-md border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-petrol">+ Lập điều khoản chia lợi nhuận mới (bản nháp)</summary>
          <form action={action} className="mt-3 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="intent" value="terms_create" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="request_id" value={p.requestIds.terms} />
            <label><span className="label">Tỷ lệ dành cho công ty — vận hành (%) *</span><input name="company_rate" className="field" placeholder="theo thỏa thuận riêng của xe" inputMode="decimal" /><Err k="company_rate" />
              <span className="text-xs text-ink-soft">Không có mức mặc định; nhập 0 nếu thỏa thuận thật sự là 0%.</span></label>
            <label><span className="label">Chi phí trừ trước khi chia</span>
              <select name="cost_basis" defaultValue="" className="field"><option value="">Chờ xác nhận</option>{Object.entries(COST_BASIS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="cost_basis" /></label>
            <label className="md:col-span-2"><span className="label">Cách xử lý khi hòa vốn / lỗ (để trống nếu chờ xác nhận)</span><input name="loss_policy" className="field" /></label>
            <label><span className="label">Căn cứ phân chia</span><input name="basis_note" className="field" placeholder="Vốn góp, thỏa thuận miệng/văn bản…" /></label>
            <label><span className="label">Số văn bản thỏa thuận</span><input name="agreement_ref" className="field" /></label>
            <fieldset className="rounded-md border border-line p-3 md:col-span-2">
              <legend className="px-1 text-sm font-semibold">Bên góp vốn và tỷ lệ chia (tổng phải đúng 100% mới duyệt được)</legend>
              {rows.map((r, i) => (
                <div key={i} className="mb-2 grid grid-cols-[1fr_7rem_auto] gap-2">
                  <select name="share_party" value={r.party} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, party: e.target.value } : x)))} className="field" aria-label="Bên góp vốn">
                    <option value="">— Chọn bên —</option>{activeParties.map((x) => <option key={x.id} value={x.id}>{x.name} ({PARTY_KIND_LABEL[x.kind]})</option>)}
                  </select>
                  <input name="share_ratio" value={r.ratio} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, ratio: e.target.value } : x)))} className="field" placeholder="%" inputMode="decimal" aria-label="Tỷ lệ chia (%)" />
                  <button type="button" className="btn btn-ghost !px-2" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Xóa dòng">✕</button>
                </div>
              ))}
              <Err k="shares" />
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setRows([...rows, { party: "", ratio: "" }])}>+ Thêm bên</button>
              <p className={`mt-1 text-sm ${ratioSum === 1_000_000n ? "text-sig-green" : "text-[#8a6100]"}`}>Tổng tỷ lệ hiện tại: <b>{formatScaledPercent(ratioSum)}%</b>{ratioSum === 1_000_000n ? " ✓" : " (cần đúng 100%)"}</p>
              {activeParties.length === 0 && <p className="text-xs text-sig-red">Chưa có bên góp vốn nào — thêm ở mục “Bên góp vốn” bên dưới trước.</p>}
            </fieldset>
            <button className="btn btn-primary md:w-fit" disabled={pending}>Lưu bản nháp</button>
          </form>
        </details>
      )}

      {/* ---- Sổ vốn góp ---- */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">Sổ vốn góp</h3>
        {entries.length === 0 ? <p className="text-sm text-ink-soft">Chưa có dòng nào.</p> : (
          <ul className="space-y-1 text-sm">
            {entries.map((e) => (
              <li key={e.id} className={`flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-1 ${e.status === "void" ? "text-ink-soft line-through" : ""}`}>
                <span className="num">{formatDate(e.entry_date)} · {partyName(e.party_id)} · {ENTRY_TYPE_LABEL[e.entry_type]} · {formatVnd(e.amount)}{e.reference ? ` · ${e.reference}` : ""}{e.note ? ` · ${e.note}` : ""}{e.status === "void" ? ` (đã hủy: ${e.void_reason})` : ""}</span>
                {manager && e.status === "posted" && (
                  <form action={action} className="flex gap-1"><Hid intent="entry_void" id={e.id} />
                    <input name="reason" className="field !w-36 !py-0.5 text-xs" placeholder="Lý do hủy" aria-label="Lý do hủy dòng sổ" required />
                    <button className="btn btn-ghost !px-2 !py-0.5 text-xs" disabled={pending} onClick={confirm("Hủy dòng này? Dòng vẫn được giữ lại; hủy sẽ đánh dấu cần xác nhận lại căn cứ phân chia.")}>Hủy</button></form>
                )}
              </li>
            ))}
          </ul>
        )}
        {(current || drafts.length > 0) && (
          <details className="mt-2 rounded-md border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold text-petrol">+ Ghi vốn cam kết / tiền thực nhận / rút vốn</summary>
            <form action={action} className="mt-3 grid gap-3 md:grid-cols-4">
              <input type="hidden" name="intent" value="entry_add" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="request_id" value={p.requestIds.entry} />
              <label><span className="label">Bên góp vốn *</span><select name="party_id" defaultValue="" className="field"><option value="">— Chọn —</option>{activeParties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><Err k="party_id" /></label>
              <label><span className="label">Loại *</span><select name="entry_type" defaultValue="receipt" className="field">{Object.entries(ENTRY_TYPE_LABEL).filter(([k]) => manager || k !== "commitment").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="entry_type" /></label>
              <label><span className="label">Số tiền *</span><input name="amount" className="field" placeholder="100tr" /><Err k="amount" /></label>
              <label><span className="label">Ngày</span><input type="date" name="entry_date" className="field" /><Err k="entry_date" /></label>
              <label className="md:col-span-2"><span className="label">Chứng từ / số tham chiếu</span><input name="reference" className="field" /></label>
              <label className="md:col-span-2"><span className="label">Ghi chú</span><input name="note" className="field" /></label>
              <button className="btn btn-primary md:w-fit" disabled={pending}>Ghi sổ</button>
              <p className="text-xs text-ink-soft md:col-span-4">Bên góp phải có trong điều khoản (bản nháp hoặc đã duyệt). Rút vốn không vượt vốn thực nhận ròng. Ghi sau khi duyệt sẽ yêu cầu xác nhận lại căn cứ phân chia. Vốn cam kết chỉ quản lý ghi.</p>
            </form>
          </details>
        )}
      </div>

      {/* ---- Cho vay ---- */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">Cho vay hưởng lãi <span className="font-normal text-ink-soft">(tách khỏi góp vốn: không chia lãi/lỗ theo tỷ lệ, không tính vào vốn góp)</span></h3>
        {loans.length === 0 ? <p className="text-sm text-ink-soft">Chưa có khoản vay nào.</p> : (
          <ul className="space-y-2">
            {loans.map((l) => (
              <li key={l.id} className={`rounded-md border border-line p-2 text-sm ${l.status === "void" ? "opacity-60" : ""}`}>
                <p><b>{partyName(l.party_id)}</b> cho vay <b className="num">{formatVnd(l.principal)}</b> · nhận {formatDate(l.drawn_date)}{l.due_date ? ` · hạn ${formatDate(l.due_date)}` : ""}{l.status === "void" ? " · ĐÃ HỦY" : ""}</p>
                <p className="text-xs text-ink-soft">Lãi thỏa thuận: {l.interest_terms}{l.reference ? ` · ${l.reference}` : ""}</p>
                <p className="num text-xs">Đã trả gốc {formatVnd(l.principal_paid)} · còn gốc {formatVnd(l.principal_outstanding)} · đã trả lãi {formatVnd(l.interest_paid)}</p>
                {l.payments.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {l.payments.map((x) => (
                      <li key={x.id} className={`flex flex-wrap items-center justify-between gap-2 ${x.status === "void" ? "text-ink-soft line-through" : ""}`}>
                        <span className="num">{formatDate(x.paid_on)} · {LOAN_KIND_LABEL[x.kind]} · {formatVnd(x.amount)}{x.reference ? ` · ${x.reference}` : ""}{x.status === "void" ? " (đã hủy)" : ""}</span>
                        {manager && x.status === "posted" && (
                          <form action={action} className="flex gap-1"><Hid intent="loan_pay_void" id={x.id} />
                            <input name="reason" className="field !w-28 !py-0.5 text-xs" placeholder="Lý do hủy" aria-label="Lý do hủy thanh toán" required />
                            <button className="btn btn-ghost !px-2 !py-0.5 text-xs" disabled={pending}>Hủy</button></form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {l.status === "active" && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <details>
                      <summary className="btn btn-ghost !py-1 cursor-pointer text-sm">Ghi trả gốc / lãi</summary>
                      <form action={action} className="mt-2 grid gap-2 md:grid-cols-4">
                        <input type="hidden" name="intent" value="loan_pay" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="loan_id" value={l.id} /><input type="hidden" name="request_id" value={p.requestIds.loanPay[l.id]} />
                        <label><span className="label">Loại</span><select name="kind" defaultValue="interest" className="field">{Object.entries(LOAN_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                        <label><span className="label">Số tiền *</span><input name="amount" className="field" /><Err k="amount" /></label>
                        <label><span className="label">Ngày</span><input type="date" name="paid_on" className="field" /></label>
                        <label><span className="label">Chứng từ</span><input name="reference" className="field" /></label>
                        <button className="btn btn-primary md:w-fit" disabled={pending}>Ghi</button>
                      </form>
                    </details>
                    {manager && (
                      <details>
                        <summary className="btn btn-ghost !py-1 cursor-pointer text-sm text-sig-red">Hủy khoản vay</summary>
                        <form action={action} className="mt-2 flex gap-2"><Hid intent="loan_void" id={l.id} />
                          <input name="reason" className="field" placeholder="Lý do hủy *" aria-label="Lý do hủy khoản vay" required />
                          <button className="btn btn-danger shrink-0" disabled={pending} onClick={confirm("Hủy khoản vay? Phải hủy hết thanh toán trước; hồ sơ vẫn được giữ.")}>Hủy</button></form>
                      </details>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {manager && (
          <details className="mt-2 rounded-md border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold text-petrol">+ Ghi khoản cho vay</summary>
            <form action={action} className="mt-3 grid gap-3 md:grid-cols-3">
              <input type="hidden" name="intent" value="loan_add" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="request_id" value={p.requestIds.loan} />
              <label><span className="label">Bên cho vay *</span><select name="party_id" defaultValue="" className="field"><option value="">— Chọn —</option>{activeParties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><Err k="party_id" /></label>
              <label><span className="label">Số tiền vay *</span><input name="principal" className="field" placeholder="200tr" /><Err k="principal" /></label>
              <label><span className="label">Ngày nhận tiền *</span><input type="date" name="drawn_date" className="field" /><Err k="drawn_date" /></label>
              <label><span className="label">Hạn trả</span><input type="date" name="due_date" className="field" /><Err k="due_date" /></label>
              <label className="md:col-span-2"><span className="label">Lãi thỏa thuận (nguyên văn) *</span><input name="interest_terms" className="field" placeholder="1,2%/tháng, trả lãi cuối kỳ" /><Err k="interest_terms" /></label>
              <label className="md:col-span-3"><span className="label">Chứng từ / số hợp đồng vay</span><input name="reference" className="field" /></label>
              <button className="btn btn-primary md:w-fit" disabled={pending}>Ghi khoản vay</button>
              <p className="text-xs text-ink-soft md:col-span-3">Hệ thống chưa tự tính lãi vay: lãi ghi theo văn bản thỏa thuận; việc đưa lãi vào kết quả sau lãi vốn làm khi có định nghĩa cách tính.</p>
            </form>
          </details>
        )}
      </div>

      {/* ---- Bên góp vốn ---- */}
      <div>
        <h3 className="mb-1 text-sm font-semibold">Bên góp vốn / cho vay ({parties.length})</h3>
        <p className="text-sm text-ink-soft">{parties.map((x) => `${x.code} ${x.name}${x.is_active ? "" : " (ngừng)"}`).join(" · ") || "Chưa có bên nào."}</p>
        {manager && (
          <details className="mt-2 rounded-md border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold text-petrol">+ Thêm bên góp vốn / cho vay</summary>
            <form action={action} className="mt-3 grid gap-3 md:grid-cols-4">
              <input type="hidden" name="intent" value="party_create" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="request_id" value={p.requestIds.party} />
              <label><span className="label">Tên *</span><input name="name" className="field" /><Err k="name" /></label>
              <label><span className="label">Loại *</span><select name="kind" defaultValue="individual" className="field">{Object.entries(PARTY_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="kind" /></label>
              <label><span className="label">Điện thoại</span><input name="phone" className="field" inputMode="tel" /></label>
              <label><span className="label">Ghi chú</span><input name="note" className="field" /></label>
              <button className="btn btn-primary md:w-fit" disabled={pending}>Thêm</button>
              <p className="text-xs text-ink-soft md:col-span-4">Người góp vốn ngoài công ty chưa có tài khoản đăng nhập. Chọn loại “Công ty / showroom” cho phần showroom tự góp vốn để không đếm trùng với phần vận hành.</p>
            </form>
          </details>
        )}
      </div>
    </div>
  );
}
