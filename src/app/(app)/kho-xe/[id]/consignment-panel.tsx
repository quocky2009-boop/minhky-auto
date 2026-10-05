"use client";

import { useActionState } from "react";
import { consignmentAction } from "../consignment-actions";
import type { ActionState } from "../../nhu-cau/actions";
import {
  CONTRACT_STATUS_LABEL, DISCOUNT_TYPE_LABEL, FEE_TYPE_LABEL, PARTY_LABEL, activationGaps, computeConsignmentFee, effectiveTerms, type TermsRow,
} from "@/lib/consignment";
import { formatVnd, toVnd } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { ContractRow } from "./consignment-load";

type Props = {
  vehicleId: string; contract: ContractRow | null; terms: TermsRow[]; earlier: ContractRow[]; manager: boolean;
  createRequestId: string; termsRequestId: string;
  /** Chi phí chủ xe chịu của xe (từ phần chi phí) — để nhắc khi trả xe. */
  ownerCostConfirmed: unknown; ownerCostPaid: unknown; openCostLines: number;
};

const STATUS_STYLE: Record<string, string> = { draft: "bg-[#fdf7e6] text-[#8a6100]", active: "bg-[#e6f2ea] text-sig-green", returned: "bg-floor text-ink-soft", cancelled: "bg-floor text-ink-soft line-through" };
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[10rem_1fr] gap-2 border-b border-line/70 py-1.5 text-sm last:border-0"><dt className="text-ink-soft">{label}</dt><dd>{children}</dd></div>
);
const unknown = <span className="text-ink-soft">Chưa ghi</span>;
const orUnknown = (v: React.ReactNode) => (v === null || v === undefined || v === "" ? unknown : v);

function feeText(t: TermsRow): string {
  if (t.fee_type === "fixed") return `${formatVnd(t.fee_fixed_amount)} (cố định)`;
  return `${String(t.fee_percent)}% trên giá bán`;
}
function discountText(t: TermsRow): string {
  if (t.discount_limit_type === "amount") return `Tối đa ${formatVnd(t.discount_limit_amount)}`;
  if (t.discount_limit_type === "percent") return `Tối đa ${String(t.discount_limit_percent)}% giá chào`;
  return "Không được giảm — phải hỏi chủ xe";
}

export function ConsignmentPanel(p: Props) {
  const { vehicleId, contract, terms, earlier, manager } = p;
  const [s, action, pending] = useActionState<ActionState, FormData>(consignmentAction, null);
  const fe = s?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const confirm = (msg: string) => (e: React.MouseEvent) => { if (!window.confirm(msg)) e.preventDefault(); };
  const Hidden = ({ intent }: { intent: string }) => (
    <>
      <input type="hidden" name="intent" value={intent} /><input type="hidden" name="vehicle_id" value={vehicleId} />
      {contract && <><input type="hidden" name="contract_id" value={contract.id} /><input type="hidden" name="version" value={contract.version} /></>}
    </>
  );

  const message = s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>;

  /** Ô nhập thông tin hợp đồng (dùng cho lập mới và sửa). */
  const ContractFields = ({ c }: { c: ContractRow | null }) => (
    <div className="grid gap-3 md:grid-cols-2">
      <label><span className="label">Họ tên chủ xe *</span><input name="owner_name" defaultValue={c?.owner_name ?? ""} className="field" /><Err k="owner_name" /></label>
      <label><span className="label">Điện thoại chủ xe (bắt buộc để kích hoạt)</span><input name="owner_phone" defaultValue={c?.owner_phone ?? ""} className="field" inputMode="tel" /></label>
      <label><span className="label">Số CCCD/giấy tờ chủ xe</span><input name="owner_id_number" defaultValue={c?.owner_id_number ?? ""} className="field" /></label>
      <div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="acts_by_proxy" defaultChecked={c?.acts_by_proxy ?? false} /> Người ký gửi là người được ủy quyền</label>
        <input name="proxy_note" defaultValue={c?.proxy_note ?? ""} className="field mt-1" placeholder="Số giấy ủy quyền, người ủy quyền" aria-label="Thông tin ủy quyền" /><Err k="proxy_note" />
      </div>
      <label><span className="label">Hiệu lực từ ngày</span><input type="date" name="start_date" defaultValue={c?.start_date ?? ""} className="field" disabled={c?.status === "active"} /><Err k="start_date" /></label>
      <label><span className="label">Đến ngày</span><input type="date" name="end_date" defaultValue={c?.end_date ?? ""} className="field" /><Err k="end_date" /></label>
      <fieldset className="grid gap-3 rounded-md border border-line p-3 md:col-span-2 md:grid-cols-2" disabled={c?.status === "active"}>
        <legend className="px-1 text-sm font-semibold">Biên bản nhận xe</legend>
        <label><span className="label">Ngày nhận xe</span><input type="date" name="received_at" defaultValue={c?.received_at ?? ""} className="field" /><Err k="received_at" /></label>
        <label><span className="label">Số chìa khóa nhận (nhập 0 nếu không có)</span><input name="keys_count" defaultValue={c?.keys_count ?? ""} className="field" inputMode="numeric" /><Err k="keys_count" /></label>
        <label className="md:col-span-2"><span className="label">Giấy tờ đã nhận</span><input name="documents_received" defaultValue={c?.documents_received ?? ""} className="field" placeholder="Cà vẹt bản gốc, sổ bảo hành…" /></label>
        <label className="md:col-span-2"><span className="label">Tình trạng xe khi nhận</span><textarea name="condition_at_receipt" defaultValue={c?.condition_at_receipt ?? ""} rows={2} className="field" placeholder="Trầy xước, hư hỏng, nội thất, ODO…" /></label>
        <label className="md:col-span-2"><span className="label">Ghi chú biên bản</span><input name="receipt_note" defaultValue={c?.receipt_note ?? ""} className="field" /></label>
        {c?.status === "active" && <p className="text-xs text-ink-soft md:col-span-2">Biên bản nhận xe đã chốt khi kích hoạt hợp đồng, không sửa.</p>}
      </fieldset>
    </div>
  );

  // ----- Chưa có hợp đồng -----
  if (!contract) {
    return (
      <div className="space-y-3">
        {message}
        <p className="text-sm">Xe ký gửi <b>chưa có hợp đồng ký gửi</b>. Xe chưa thể chào bán cho đến khi hợp đồng được ký xác nhận và kích hoạt.</p>
        {earlier.length > 0 && <p className="text-xs text-ink-soft">Có {earlier.length} hợp đồng cũ đã kết thúc.</p>}
        {manager ? (
          <details className="rounded-md border border-line p-3" open>
            <summary className="cursor-pointer text-sm font-semibold text-petrol">+ Lập hợp đồng ký gửi</summary>
            <form action={action} className="mt-3 space-y-3">
              <input type="hidden" name="intent" value="create" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="request_id" value={p.createRequestId} />
              <ContractFields c={null} />
              <p className="text-xs text-ink-soft">Chỉ họ tên chủ xe là bắt buộc để lưu nháp. Giá, phí ký gửi và quyền giảm giá nhập ở bước “thỏa thuận” sau khi lưu.</p>
              <button className="btn btn-primary" disabled={pending}>Lưu hợp đồng nháp</button>
            </form>
          </details>
        ) : <p className="text-xs text-ink-soft">Chỉ quản lý được lập hợp đồng ký gửi.</p>}
      </div>
    );
  }

  const c = contract;
  const eff = effectiveTerms(terms);
  const gaps = c.status === "draft" ? activationGaps(c, terms) : [];
  const open = c.status === "draft" || c.status === "active";
  const unsigned = terms.filter((t) => !t.signed_on);

  // Ví dụ phí và số chủ xe nhận nếu bán đúng giá chào — ƯỚC TÍNH, không phải quyết toán.
  const listPrice = eff ? toVnd(eff.list_price) : null;
  const fee = eff && listPrice !== null ? computeConsignmentFee(eff, listPrice) : null;
  const expected = eff ? toVnd(eff.owner_expected_amount) : null;
  const ownerNet = fee !== null && listPrice !== null ? listPrice - fee : null;

  const ownerCostConfirmed = toVnd(p.ownerCostConfirmed) ?? BigInt(0);
  const ownerCostUnpaid = ownerCostConfirmed - (toVnd(p.ownerCostPaid) ?? BigInt(0));

  return (
    <div className="space-y-4">
      {message}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{c.code}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[c.status]}`}>{CONTRACT_STATUS_LABEL[c.status]}</span>
        {c.activated_at && <span className="text-xs text-ink-soft">Kích hoạt {formatDate(c.activated_at)}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <dl>
          <Row label="Chủ xe">{c.owner_name}{c.acts_by_proxy ? <span className="text-ink-soft"> (người ủy quyền: {c.proxy_note})</span> : null}</Row>
          <Row label="Điện thoại">{orUnknown(c.owner_phone)}</Row>
          <Row label="Giấy tờ chủ xe">{orUnknown(c.owner_id_number)}</Row>
          <Row label="Thời hạn ký gửi">{c.start_date && c.end_date ? `${formatDate(c.start_date)} – ${formatDate(c.end_date)}` : unknown}</Row>
          <Row label="Nhận xe">{c.received_at ? formatDate(c.received_at) : unknown}</Row>
          <Row label="Chìa khóa nhận">{c.keys_count === null ? unknown : `${c.keys_count} chiếc`}</Row>
          <Row label="Giấy tờ nhận">{orUnknown(c.documents_received)}</Row>
          <Row label="Tình trạng khi nhận">{orUnknown(c.condition_at_receipt)}</Row>
          {c.receipt_note && <Row label="Ghi chú biên bản">{c.receipt_note}</Row>}
        </dl>

        <div>
          <h3 className="mb-1 text-sm font-semibold">Thỏa thuận đang hiệu lực</h3>
          {eff ? (
            <dl>
              <Row label="Phiên bản">v{eff.version_no} · chủ xe ký {formatDate(eff.signed_on)}{eff.agreement_ref ? ` · ${eff.agreement_ref}` : ""}</Row>
              <Row label="Chủ xe muốn nhận"><span className="num font-semibold">{formatVnd(eff.owner_expected_amount)}</span></Row>
              <Row label="Giá chào thỏa thuận"><span className="num font-semibold">{formatVnd(eff.list_price)}</span></Row>
              <Row label="Quyền giảm giá">{discountText(eff)}</Row>
              <Row label="Phí ký gửi (showroom hưởng)">{feeText(eff)}</Row>
              <Row label="Bên ký hợp đồng mua bán">{PARTY_LABEL[eff.buyer_contract_party]}</Row>
              <Row label="Bên thu tiền người mua">{PARTY_LABEL[eff.payment_collector]}</Row>
              {eff.other_terms && <Row label="Điều khoản khác">{eff.other_terms}</Row>}
            </dl>
          ) : <p className="text-sm text-ink-soft">Chưa có thỏa thuận nào được chủ xe ký xác nhận. Bản chưa ký chỉ là đề xuất, chưa có hiệu lực.</p>}
          {eff && fee !== null && listPrice !== null && ownerNet !== null && (
            <p className="mt-2 rounded-md bg-floor p-2 text-xs text-ink-soft">
              Ước tính nếu bán đúng giá chào {formatVnd(listPrice)}: phí showroom <b className="num">{formatVnd(fee)}</b>, chủ xe nhận <b className="num">{formatVnd(ownerNet)}</b> (chưa trừ chi phí chủ xe chịu).
              {expected !== null && ownerNet < expected && <span className="text-sig-red"> Thấp hơn số chủ xe muốn nhận ({formatVnd(expected)}) — cần rà lại giá chào hoặc phí.</span>}
              {" "}Đây chỉ là ước tính; quyết toán thật làm ở chặng bán hàng.
            </p>
          )}
        </div>
      </div>

      {open && gaps.length > 0 && (
        <div className="rounded-md border border-[#e6c97a] bg-[#fdf7e6] p-3 text-sm">
          <p className="font-semibold text-[#8a6100]">Còn thiếu để kích hoạt hợp đồng:</p>
          <ul className="ml-5 list-disc">{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      )}

      {c.status === "returned" && (
        <div className="rounded-md border border-line p-3">
          <h3 className="mb-1 text-sm font-semibold">Biên bản trả xe</h3>
          <dl>
            <Row label="Ngày trả">{formatDate(c.return_date)}</Row>
            <Row label="Lý do">{orUnknown(c.return_reason)}</Row>
            <Row label="Tình trạng khi trả">{orUnknown(c.return_condition)}</Row>
            <Row label="Chìa khóa trả lại">{c.return_keys_count === null ? unknown : `${c.return_keys_count} chiếc`}</Row>
            <Row label="Giấy tờ trả lại">{orUnknown(c.return_documents)}</Row>
            <Row label="Chi phí chủ xe chịu">{formatVnd(c.return_owner_cost_confirmed)} đã xác nhận · còn chưa thanh toán {formatVnd(c.return_owner_cost_unpaid)}</Row>
            {c.return_cost_note && <Row label="Xử lý chi phí">{c.return_cost_note}</Row>}
          </dl>
          <p className="mt-2 text-xs text-ink-soft">Hồ sơ xe và hợp đồng được giữ lại; xe đã kết thúc vòng ký gửi.</p>
        </div>
      )}
      {c.status === "cancelled" && <p className="text-sm text-ink-soft">Đã hủy: {c.cancel_reason}</p>}

      <div>
        <h3 className="mb-1 text-sm font-semibold">Lịch sử thỏa thuận ({terms.length} phiên bản)</h3>
        {terms.length === 0 ? <p className="text-sm text-ink-soft">Chưa có phiên bản thỏa thuận nào.</p> : (
          <ul className="space-y-1 text-sm">
            {terms.map((t) => (
              <li key={t.id} className="rounded-md border border-line p-2">
                <span className="font-semibold">v{t.version_no}</span> · {formatDate(t.created_at)} · nhận {formatVnd(t.owner_expected_amount)} · chào {formatVnd(t.list_price)} · phí {feeText(t)} · {DISCOUNT_TYPE_LABEL[t.discount_limit_type].split(" (")[0]}
                {" · "}{t.signed_on ? <span className="text-sig-green">đã ký {formatDate(t.signed_on)}</span> : <span className="text-[#8a6100]">chưa ký</span>}
                {manager && open && !t.signed_on && (
                  <form action={action} className="mt-1 flex flex-wrap items-end gap-2">
                    <Hidden intent="sign_terms" /><input type="hidden" name="terms_id" value={t.id} />
                    <label><span className="label">Ngày chủ xe ký</span><input type="date" name="signed_on" className="field !py-0.5" /><Err k="signed_on" /></label>
                    <label><span className="label">Số hợp đồng giấy</span><input name="agreement_ref" className="field !py-0.5" /></label>
                    <button className="btn btn-ghost !py-1 text-sm" disabled={pending} onClick={confirm("Ghi chủ xe đã ký phiên bản này? Sau đó không sửa được nội dung, chỉ thêm phiên bản mới.")}>Ghi đã ký</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {manager && open && (
        <div className="flex flex-col gap-2">
          <details className="rounded-md border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold text-petrol">+ Thêm phiên bản thỏa thuận (giá, phí, quyền giảm giá)</summary>
            <form action={action} className="mt-3 grid gap-3 md:grid-cols-2">
              <Hidden intent="add_terms" /><input type="hidden" name="request_id" value={p.termsRequestId} />
              <label><span className="label">Chủ xe muốn nhận (thực nhận) *</span><input name="owner_expected_amount" className="field" placeholder="600tr" /><Err k="owner_expected_amount" /></label>
              <label><span className="label">Giá chào thỏa thuận *</span><input name="list_price" className="field" placeholder="650tr" /><Err k="list_price" /></label>
              <label><span className="label">Cách tính phí ký gửi *</span>
                <select name="fee_type" defaultValue="" className="field"><option value="" disabled>— Chọn —</option>{Object.entries(FEE_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="fee_type" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label><span className="label">Phí cố định</span><input name="fee_fixed_amount" className="field" placeholder="20tr" /><Err k="fee_fixed_amount" /></label>
                <label><span className="label">Phí % giá bán</span><input name="fee_percent" className="field" placeholder="3" inputMode="decimal" /><Err k="fee_percent" /></label>
              </div>
              <p className="text-xs text-ink-soft md:col-span-2">Chỉ nhập ô ứng với cách tính đã chọn. Không có mức mặc định: mỗi xe phải nhập rõ.</p>
              <label><span className="label">Quyền giảm giá không cần hỏi chủ xe *</span>
                <select name="discount_limit_type" defaultValue="" className="field"><option value="" disabled>— Chọn —</option>{Object.entries(DISCOUNT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="discount_limit_type" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label><span className="label">Giảm tối đa (tiền)</span><input name="discount_limit_amount" className="field" placeholder="5tr" /><Err k="discount_limit_amount" /></label>
                <label><span className="label">Giảm tối đa (% giá chào)</span><input name="discount_limit_percent" className="field" placeholder="1" inputMode="decimal" /><Err k="discount_limit_percent" /></label>
              </div>
              <label><span className="label">Bên ký hợp đồng mua bán với người mua *</span>
                <select name="buyer_contract_party" defaultValue="" className="field"><option value="" disabled>— Chọn —</option>{Object.entries(PARTY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="buyer_contract_party" /></label>
              <label><span className="label">Bên thu tiền từ người mua *</span>
                <select name="payment_collector" defaultValue="" className="field"><option value="" disabled>— Chọn —</option>{Object.entries(PARTY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="payment_collector" /></label>
              <label className="md:col-span-2"><span className="label">Điều khoản khác</span><input name="other_terms" className="field" /></label>
              <label><span className="label">Ngày chủ xe ký (để trống nếu chưa ký)</span><input type="date" name="signed_on" className="field" /><Err k="signed_on" /></label>
              <label><span className="label">Số hợp đồng giấy</span><input name="agreement_ref" className="field" /></label>
              <p className="text-xs text-ink-soft md:col-span-2">Phiên bản không sửa sau khi lưu; muốn đổi giá/phí thì thêm phiên bản mới. Chỉ phiên bản đã có ngày chủ xe ký mới có hiệu lực. Chi phí phát sinh của xe ký gửi không cần chủ xe duyệt.</p>
              <button className="btn btn-primary md:w-fit" disabled={pending}>Lưu phiên bản thỏa thuận</button>
            </form>
          </details>

          <details className="rounded-md border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold text-petrol">Sửa thông tin chủ xe / thời hạn / biên bản</summary>
            <form action={action} className="mt-3 space-y-3">
              <Hidden intent="update" />
              <ContractFields c={c} />
              <button className="btn btn-ghost" disabled={pending}>Lưu thay đổi</button>
            </form>
          </details>

          <div className="flex flex-wrap gap-2">
            {c.status === "draft" && (
              <form action={action}>
                <Hidden intent="activate" />
                <button className="btn btn-primary" disabled={pending || gaps.length > 0} title={gaps.length ? "Còn thiếu thông tin — xem khung cảnh báo" : undefined}
                  onClick={confirm("Kích hoạt hợp đồng? Biên bản nhận xe sẽ được chốt và xe có thể chào bán.")}>Kích hoạt hợp đồng</button>
              </form>
            )}
            {c.status === "draft" && (
              <details>
                <summary className="btn btn-ghost cursor-pointer text-sig-red">Hủy hợp đồng nháp</summary>
                <form action={action} className="mt-2 flex gap-2">
                  <Hidden intent="cancel" />
                  <input name="reason" className="field" placeholder="Lý do hủy *" aria-label="Lý do hủy hợp đồng" required />
                  <button className="btn btn-danger shrink-0" disabled={pending} onClick={confirm("Hủy hợp đồng nháp này? Hồ sơ vẫn được giữ lại.")}>Hủy hợp đồng</button>
                </form>
              </details>
            )}
          </div>

          {c.status === "active" && (
            <details className="rounded-md border border-line p-3">
              <summary className="cursor-pointer text-sm font-semibold text-sig-red">Trả / rút xe cho chủ xe</summary>
              <form action={action} className="mt-3 grid gap-3 md:grid-cols-2">
                <Hidden intent="return" />
                {p.openCostLines > 0 && <p className="rounded-md bg-[#fdf7e6] p-2 text-sm text-[#8a6100] md:col-span-2">Còn {p.openCostLines} khoản chi phí chưa xác nhận hoặc hủy — phải xử lý trước khi trả xe.</p>}
                {ownerCostConfirmed > BigInt(0) && (
                  <p className="rounded-md bg-floor p-2 text-sm md:col-span-2">
                    Chi phí chủ xe chịu đã xác nhận: <b className="num">{formatVnd(ownerCostConfirmed)}</b>, còn chưa thanh toán: <b className="num">{formatVnd(ownerCostUnpaid)}</b>.
                    {ownerCostUnpaid > BigInt(0) && " Bắt buộc ghi cách xử lý bên dưới."}
                  </p>
                )}
                <label><span className="label">Ngày trả xe *</span><input type="date" name="return_date" className="field" /><Err k="return_date" /></label>
                <label><span className="label">Số chìa khóa trả lại * (0 nếu không có)</span><input name="return_keys_count" className="field" inputMode="numeric" /><Err k="return_keys_count" /></label>
                <label className="md:col-span-2"><span className="label">Lý do trả/rút xe *</span><input name="return_reason" className="field" /><Err k="return_reason" /></label>
                <label className="md:col-span-2"><span className="label">Tình trạng xe khi trả *</span><textarea name="return_condition" rows={2} className="field" /><Err k="return_condition" /></label>
                <label className="md:col-span-2"><span className="label">Giấy tờ trả lại *</span><input name="return_documents" className="field" placeholder="Cà vẹt bản gốc… hoặc “không có”" /><Err k="return_documents" /></label>
                <label className="md:col-span-2"><span className="label">Xử lý chi phí (chủ xe hoàn trả, trừ vào đâu…){ownerCostUnpaid > BigInt(0) ? " *" : ""}</span><textarea name="return_cost_note" rows={2} className="field" /></label>
                <button className="btn btn-danger md:w-fit" disabled={pending}
                  onClick={confirm("Lập biên bản trả xe cho chủ xe? Xe sẽ kết thúc vòng ký gửi và không mở lại được (hồ sơ vẫn được giữ).")}>Lập biên bản trả xe</button>
              </form>
            </details>
          )}
          {unsigned.length > 0 && c.status === "draft" && <p className="text-xs text-ink-soft">Có {unsigned.length} phiên bản chưa ký; chỉ phiên bản đã ký mới có hiệu lực.</p>}
        </div>
      )}

      {earlier.length > 0 && (
        <p className="text-xs text-ink-soft">Hợp đồng trước đó của xe này: {earlier.map((e) => `${e.code} (${CONTRACT_STATUS_LABEL[e.status]})`).join(", ")}.</p>
      )}
    </div>
  );
}
