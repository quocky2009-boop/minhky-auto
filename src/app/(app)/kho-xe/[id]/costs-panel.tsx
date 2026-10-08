"use client";

import { AccountSelect, type AccountOption } from "./account-select";
import { useActionState } from "react";
import { costAction } from "../cost-actions";
import type { ActionState } from "../../nhu-cau/actions";
import { BORNE_BY_LABEL, COST_CATEGORY_CHOICES, COST_CATEGORY_LABEL, COST_STATUS_LABEL, PAYMENT_METHOD_LABEL, outstanding } from "@/lib/costs";
import { formatVnd, toVnd } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { CostLine, CostSummary } from "./cost-load";

type Props = {
  vehicleId: string; businessType: string; costs: CostLine[]; summary: CostSummary;
  manager: boolean; addRequestId: string; payRequestIds: Record<string, string>; accounts: AccountOption[];
};

const money = (v: unknown, empty = "Chưa có") => (toVnd(v) === null ? empty : formatVnd(v));
const STATUS_STYLE: Record<string, string> = { estimated: "bg-[#fdf7e6] text-[#8a6100]", confirmed: "bg-[#e6f2ea] text-sig-green", void: "bg-floor text-ink-soft line-through" };

export function CostsPanel({ vehicleId, businessType, costs, summary, manager, addRequestId, payRequestIds, accounts }: Props) {
  const [s, action, pending] = useActionState<ActionState, FormData>(costAction, null);
  const fe = s?.fieldErrors ?? {};
  const consignment = businessType === "consignment";
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const confirm = (msg: string) => (e: React.MouseEvent) => { if (!window.confirm(msg)) e.preventDefault(); };
  const voided = costs.filter((c) => c.status === "void");

  const confirmedShowroom = toVnd(summary?.confirmed_showroom), paidShowroom = toVnd(summary?.paid_showroom);
  const confirmedOwner = toVnd(summary?.confirmed_owner), paidOwner = toVnd(summary?.paid_owner);
  const dueShowroom = outstanding(confirmedShowroom, paidShowroom), dueOwner = outstanding(confirmedOwner, paidOwner);

  const Cell = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-md border border-line bg-surface p-3"><p className="text-xs text-ink-soft">{label}</p><p className="num mt-0.5 text-lg font-semibold">{value}</p>{sub && <p className="text-xs text-ink-soft">{sub}</p>}</div>
  );

  return (
    <div className="space-y-4">
      {s?.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "text-sig-green" : "text-sig-red"}`}>{s.message}</p>}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Cell label="Dự kiến (chưa xác nhận)" value={money(summary?.estimated_showroom)}
          sub={summary?.open_lines_no_estimate ? `+ ${summary.open_lines_no_estimate} khoản chưa có dự toán` : consignment && toVnd(summary?.estimated_owner) !== null ? `Chủ xe: ${formatVnd(summary?.estimated_owner)}` : undefined} />
        <Cell label="Đã xác nhận (thực tế)" value={money(summary?.confirmed_showroom)} sub={consignment && confirmedOwner !== null ? `Chủ xe chịu: ${formatVnd(summary?.confirmed_owner)}` : undefined} />
        <Cell label="Đã thanh toán" value={money(summary?.paid_showroom)} sub={consignment && paidOwner !== null ? `Phần chủ xe: ${formatVnd(summary?.paid_owner)}` : undefined} />
        <Cell label="Còn phải trả" value={dueShowroom === null ? "Chưa có" : formatVnd(dueShowroom)} sub={consignment && dueOwner !== null ? `Phần chủ xe: ${formatVnd(dueOwner)}` : undefined} />
      </div>
      <p className="text-xs text-ink-soft">
        Ba con số tách riêng, không cộng dồn: <b>dự kiến</b> là kế hoạch, <b>đã xác nhận</b> là số thực tế đã nghiệm thu, <b>đã thanh toán</b> là tiền đã chi. Khoản đã xác nhận không còn tính vào “dự kiến”.
        {consignment
          ? " Xe ký gửi: chi phí không làm tăng giá vốn tồn kho của showroom; phần chủ xe chịu được tách riêng. Chi phí phát sinh không cần chủ xe duyệt."
          : confirmedShowroom !== null && ` Chi phí đã xác nhận (${formatVnd(confirmedShowroom)}) được tính vào giá vốn xe.`}
      </p>

      <ul className="space-y-2">
        {costs.map((c) => {
          const paid = c.payments.filter((p) => p.status === "posted").reduce((t, p) => t + (toVnd(p.amount) ?? BigInt(0)), BigInt(0));
          const due = c.status === "confirmed" ? outstanding(toVnd(c.confirmed_amount), paid) : null;
          return (
            <li key={c.id} className={`rounded-md border border-line p-3 ${c.status === "void" ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm"><span className="font-semibold">{c.code}</span> · {COST_CATEGORY_LABEL[c.category]} · <span className={c.status === "void" ? "line-through" : ""}>{c.description}</span></p>
                  <p className="text-xs text-ink-soft">{c.vendor ? `Đơn vị thực hiện: ${c.vendor} · ` : ""}{BORNE_BY_LABEL[c.borne_by]}{c.replaces_cost_id ? " · thay thế khoản đã hủy" : ""}</p>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[c.status]}`}>{COST_STATUS_LABEL[c.status]}{c.status === "estimated" && c.approved_at ? " · đã duyệt dự toán" : ""}</span>
              </div>
              <dl className="num mt-2 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-ink-soft">Dự toán</dt><dd>{money(c.estimated_amount)}</dd></div>
                <div><dt className="text-xs text-ink-soft">Thực tế đã xác nhận</dt><dd>{c.status === "confirmed" ? money(c.confirmed_amount) : <span className="text-ink-soft">Chưa xác nhận</span>}</dd></div>
                <div><dt className="text-xs text-ink-soft">Đã thanh toán / còn lại</dt><dd>{c.status === "confirmed" ? `${formatVnd(paid)} / ${due === null ? "—" : formatVnd(due)}` : <span className="text-ink-soft">—</span>}</dd></div>
              </dl>
              {c.accepted_note && <p className="mt-1 text-xs text-ink-soft">Nghiệm thu: {c.accepted_note}</p>}
              {c.status === "void" && <p className="mt-1 text-xs text-ink-soft">Lý do hủy: {c.void_reason}</p>}

              {c.payments.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
                  {c.payments.map((p) => (
                    <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 ${p.status === "void" ? "text-ink-soft line-through" : ""}`}>
                      <span className="num">{formatDate(p.paid_at)} · {formatVnd(p.amount)} · {PAYMENT_METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}{p.status === "void" ? ` (đã hủy: ${p.void_reason})` : ""}</span>
                      {p.status === "posted" && (
                        <form action={action} className="flex gap-1">
                          <input type="hidden" name="intent" value="void_payment" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="payment_id" value={p.id} />
                          <input name="reason" placeholder="Lý do hủy" className="field !w-32 !py-0.5 text-xs" aria-label="Lý do hủy thanh toán" required />
                          <button className="btn btn-ghost !px-2 !py-0.5 text-xs" disabled={pending} onClick={confirm("Hủy khoản thanh toán này? Dòng thanh toán vẫn được giữ lại để đối chiếu.")}>Hủy</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {c.status !== "void" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.status === "estimated" && manager && (
                    <form action={action}>
                      <input type="hidden" name="intent" value={c.approved_at ? "unapprove" : "approve"} /><input type="hidden" name="vehicle_id" value={vehicleId} />
                      <input type="hidden" name="cost_id" value={c.id} /><input type="hidden" name="version" value={c.version} />
                      <button className="btn btn-ghost !py-1 text-sm" disabled={pending || (!c.approved_at && toVnd(c.estimated_amount) === null)}>{c.approved_at ? "Bỏ duyệt dự toán" : "Duyệt dự toán"}</button>
                    </form>
                  )}
                  {c.status === "estimated" && (
                    <details className="w-full md:w-auto">
                      <summary className="btn btn-primary !py-1 cursor-pointer text-sm">Xác nhận số thực tế</summary>
                      <form action={action} className="mt-2 grid gap-2 md:grid-cols-[10rem_1fr_auto]">
                        <input type="hidden" name="intent" value="confirm" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="cost_id" value={c.id} /><input type="hidden" name="version" value={c.version} />
                        <label><span className="label">Thực tế *</span><input name="confirmed_amount" className="field" placeholder="4,5tr" /><Err k="confirmed_amount" /></label>
                        <label><span className="label">Ghi chú nghiệm thu</span><input name="accepted_note" className="field" /></label>
                        <button className="btn btn-primary self-end" disabled={pending} onClick={confirm("Xác nhận số thực tế? Sau khi xác nhận không sửa trực tiếp được (chỉ hủy và tạo khoản thay thế).")}>Xác nhận</button>
                      </form>
                    </details>
                  )}
                  {c.status === "estimated" && manager && (
                    <details className="w-full md:w-auto">
                      <summary className="btn btn-ghost !py-1 cursor-pointer text-sm">Sửa dự toán</summary>
                      <form action={action} className="mt-2 grid gap-2 md:grid-cols-2">
                        <input type="hidden" name="intent" value="update" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="cost_id" value={c.id} /><input type="hidden" name="version" value={c.version} />
                        <label><span className="label">Loại</span><select name="category" defaultValue={c.category} className="field">{Object.entries(c.category === "after_sales" ? COST_CATEGORY_LABEL : COST_CATEGORY_CHOICES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                        <label><span className="label">Dự toán</span><input name="estimated_amount" defaultValue={toVnd(c.estimated_amount)?.toString() ?? ""} className="field" /><Err k="estimated_amount" /></label>
                        <label className="md:col-span-2"><span className="label">Mô tả</span><input name="description" defaultValue={c.description} className="field" /><Err k="description" /></label>
                        <label><span className="label">Đơn vị thực hiện</span><input name="vendor" defaultValue={c.vendor ?? ""} className="field" /></label>
                        {consignment && <label><span className="label">Bên chịu chi phí</span><select name="borne_by" defaultValue={c.borne_by} className="field">{Object.entries(BORNE_BY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
                        <p className="text-xs text-ink-soft md:col-span-2">Đổi số dự toán thì phải duyệt lại.</p>
                        <button className="btn btn-ghost md:col-span-2 md:w-fit" disabled={pending}>Lưu</button>
                      </form>
                    </details>
                  )}
                  {c.status === "confirmed" && due !== null && due > BigInt(0) && (
                    <details className="w-full md:w-auto">
                      <summary className="btn btn-primary !py-1 cursor-pointer text-sm">Ghi thanh toán</summary>
                      <form action={action} className="mt-2 grid gap-2 md:grid-cols-4">
                        <input type="hidden" name="intent" value="pay" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="cost_id" value={c.id} /><input type="hidden" name="request_id" value={payRequestIds[c.id]} />
                        <label><span className="label">Số tiền *</span><input name="amount" defaultValue={due.toString()} className="field" /><Err k="amount" /></label>
                        <label><span className="label">Hình thức</span><select name="method" defaultValue="cash" className="field">{Object.entries(PAYMENT_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                        <label><span className="label">Ngày chi</span><input type="date" name="paid_at" className="field" /><Err k="paid_at" /></label>
                        <AccountSelect accounts={accounts} hint="tài khoản chi tiền, bắt buộc" error={s?.fieldErrors?.account_id} />
                        <label><span className="label">Chứng từ / số tham chiếu</span><input name="reference" className="field" /></label>
                        <label className="md:col-span-3"><span className="label">Ghi chú</span><input name="note" className="field" /></label>
                        <button className="btn btn-primary self-end" disabled={pending}>Ghi thanh toán</button>
                      </form>
                    </details>
                  )}
                  {manager && (
                    <details className="w-full md:w-auto">
                      <summary className="btn btn-ghost !py-1 cursor-pointer text-sm text-sig-red">{c.status === "confirmed" ? "Hủy (đảo) khoản" : "Hủy khoản"}</summary>
                      <form action={action} className="mt-2 flex gap-2">
                        <input type="hidden" name="intent" value="void" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="cost_id" value={c.id} /><input type="hidden" name="version" value={c.version} />
                        <input name="reason" className="field" placeholder="Lý do hủy *" aria-label="Lý do hủy khoản" required />
                        <button className="btn btn-danger shrink-0" disabled={pending} onClick={confirm("Hủy khoản chi phí này? Khoản hủy vẫn được giữ lại trong lịch sử; phải hủy hết thanh toán trước.")}>Hủy khoản</button>
                      </form>
                    </details>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {costs.length === 0 && <li className="text-sm text-ink-soft">Chưa có khoản chi phí nào cho xe này.</li>}
      </ul>

      <details className="rounded-md border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold text-petrol">+ Thêm khoản chi phí (dự kiến)</summary>
        <form action={action} className="mt-3 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="intent" value="add" /><input type="hidden" name="vehicle_id" value={vehicleId} /><input type="hidden" name="request_id" value={addRequestId} />
          <label><span className="label">Loại *</span>
            <select name="category" defaultValue="repair" className="field">{Object.entries(COST_CATEGORY_CHOICES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="category" /></label>
          <label><span className="label">Dự toán (để trống nếu chưa rõ)</span><input name="estimated_amount" className="field" placeholder="5tr" /><Err k="estimated_amount" /></label>
          <label className="md:col-span-2"><span className="label">Mô tả công việc / khoản chi *</span><input name="description" className="field" placeholder="Sơn lại cản trước, đánh bóng" /><Err k="description" /></label>
          <label><span className="label">Đơn vị thực hiện</span><input name="vendor" className="field" placeholder="Gara Minh Kỳ / Spa Tùng Kỳ / bên ngoài" /></label>
          {consignment ? (
            <label><span className="label">Bên chịu chi phí *</span>
              <select name="borne_by" defaultValue="" className="field"><option value="" disabled>— Chọn —</option>{Object.entries(BORNE_BY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err k="borne_by" /></label>
          ) : <p className="self-end text-xs text-ink-soft">Xe showroom sở hữu: showroom chịu chi phí.</p>}
          {voided.length > 0 && (
            <label className="md:col-span-2"><span className="label">Thay thế cho khoản đã hủy (nếu có)</span>
              <select name="replaces_cost_id" defaultValue="" className="field"><option value="">Không</option>{voided.map((v) => <option key={v.id} value={v.id}>{v.code} — {v.description}</option>)}</select></label>
          )}
          <button className="btn btn-primary md:w-fit" disabled={pending}>Thêm khoản chi phí</button>
          <p className="text-xs text-ink-soft md:col-span-2">Khoản mới luôn ở trạng thái “dự kiến”. Quản lý duyệt dự toán; sau khi làm xong, nhập số thực tế để xác nhận; rồi mới ghi thanh toán.</p>
        </form>
      </details>
    </div>
  );
}
