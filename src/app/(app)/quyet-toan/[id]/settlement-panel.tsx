"use client";

import Link from "next/link";
import { useActionState } from "react";
import { settlementAction } from "../actions";
import type { ActionState } from "../../nhu-cau/actions";
import { LINE_KIND_LABEL, LINE_PURPOSE } from "@/lib/settlements";
import { formatVnd } from "@/lib/money";
import type { LineRow, SettlementRow } from "../load";

type Props = { s: SettlementRow; lines: LineRow[]; blockers: string[]; stale: boolean; manager: boolean; requestId: string };

export function SettlementPanel({ s, lines, blockers, stale, manager, requestId }: Props) {
  const [st, action, pending] = useActionState<ActionState, FormData>(settlementAction, null);
  const fe = st?.fieldErrors ?? {};
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="mt-1 block text-xs text-sig-red">{fe[k]}</span> : null);
  const confirm = (msg: string) => (e: React.MouseEvent) => { if (!window.confirm(msg)) e.preventDefault(); };
  const Hid = ({ intent }: { intent: string }) => <><input type="hidden" name="intent" value={intent} /><input type="hidden" name="id" value={s.id} /><input type="hidden" name="version" value={s.version} /></>;
  const open = s.status === "provisional" || s.status === "checked";
  const lossLines = lines.filter((l) => l.kind === "capital_return");
  return (
    <div className="space-y-4">
      {st?.message && <p role={st.ok ? "status" : "alert"} className={`text-sm ${st.ok ? "text-sig-green" : "text-sig-red"}`}>{st.message}</p>}

      <section className="panel p-4">
        <h2 className="mb-2 font-semibold">Các khoản của quyết toán</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-ink-soft"><th className="p-2">Khoản</th><th className="p-2">Bên</th><th className="p-2 text-right">Số tiền</th><th className="p-2 text-right">Đã chi/thu</th><th className="p-2 text-right">Còn lại</th><th className="p-2" /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-line/60 align-top">
                  <td className="p-2">{LINE_KIND_LABEL[l.kind]}{l.note ? <div className="text-xs text-ink-soft">{l.note}</div> : null}</td>
                  <td className="p-2">{l.label}</td>
                  <td className="num p-2 text-right font-semibold">{formatVnd(l.amount)}</td>
                  <td className="num p-2 text-right">{l.direction === "none" ? "—" : l.paid === null ? "—" : formatVnd(l.paid)}</td>
                  <td className="num p-2 text-right">{l.direction === "none" ? <span className="text-xs text-ink-soft">không có phiếu</span> : l.remaining === null ? "—" : formatVnd(l.remaining)}</td>
                  <td className="p-2 text-xs">
                    {s.status === "approved" && l.direction !== "none" && Number(l.remaining) > 0 && LINE_PURPOSE[l.kind] && (
                      <Link href={`/thu-chi?lap=${LINE_PURPOSE[l.kind]}&dl=${l.id}`} className="text-petrol hover:underline">{l.direction === "out" ? "Lập phiếu chi" : "Lập phiếu thu"}</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft">Tách bạch: hoàn vốn, chia lợi nhuận, đã chi/thu và còn phải chi/thu. Lợi nhuận không đồng nghĩa tiền mặt sẵn có: chi chỉ khi tài khoản đủ tiền thực có. Dòng “không có phiếu” là phần ghi nhận/nội bộ của công ty.</p>
      </section>

      {stale && (
        <section className="panel border-[#e5d3a3] bg-[#fdf7e6] p-4 text-sm text-[#8a6100]">
          <b>Số liệu đã thay đổi sau khi phê duyệt</b> (ví dụ có chi phí xác nhận muộn). Quyết toán đã duyệt không tự sửa — quản lý lập <b>điều chỉnh</b> bên dưới.
        </section>
      )}
      {open && blockers.length > 0 && (
        <section className="panel border-[#e5b4ae] bg-[#fdf3f2] p-4 text-sm text-sig-red">
          <b>Chưa đủ điều kiện {s.status === "provisional" ? "kiểm tra/phê duyệt" : "phê duyệt"}:</b>
          <ul className="ml-4 list-disc">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </section>
      )}

      {s.result === "no_profit" && s.status === "provisional" && manager && (
        <section className="panel p-4">
          <h2 className="mb-2 font-semibold">Xe hòa vốn/lỗ — cách xử lý</h2>
          <form action={action} className="grid gap-3 md:grid-cols-2"><Hid intent="loss" />
            <label className="md:col-span-2"><span className="label">Cách xử lý đã thống nhất *</span><input name="decision" defaultValue={s.loss_decision ?? ""} className="field" placeholder="Ví dụ: hoàn vốn trừ lỗ theo tỷ lệ góp vốn" /><Err k="decision" /></label>
            {lossLines.map((l) => (
              <label key={l.id}><span className="label">Hoàn vốn cho {l.label} (tối đa vốn thực nhận) *</span>
                <input type="hidden" name="party_id" value={l.party_id ?? ""} /><input name={`returns_${l.party_id}`} className="field" placeholder="0" /><Err k={`returns_${l.party_id}`} /></label>
            ))}
            <button className="btn btn-primary md:w-fit" disabled={pending}>Ghi cách xử lý</button>
            <p className="text-xs text-ink-soft md:col-span-2">Xe hòa vốn/lỗ không áp công thức chia lãi. Điều khoản góp vốn của xe cũng phải đã có cách xử lý hòa vốn/lỗ.</p>
          </form>
        </section>
      )}

      <section className="panel p-4">
        <h2 className="mb-2 font-semibold">Quy trình</h2>
        <div className="flex flex-wrap gap-2">
          {s.status === "provisional" && <form action={action}><Hid intent="check" /><button className="btn btn-primary" disabled={pending} onClick={confirm("Xác nhận đã kiểm tra số liệu quyết toán?")}>Kiểm tra xong</button></form>}
          {s.status === "checked" && manager && <form action={action}><Hid intent="approve" /><button className="btn btn-primary" disabled={pending} onClick={confirm("Phê duyệt quyết toán? Sau khi duyệt không sửa; chi phí muộn phải lập điều chỉnh.")}>Phê duyệt</button></form>}
          {s.status === "checked" && !manager && <p className="text-sm text-ink-soft">Đã kiểm tra. Chờ quản lý/admin phê duyệt.</p>}
        </div>
        {(open || (s.status === "approved" && manager)) && (
          <details className="mt-3"><summary className="cursor-pointer text-sm text-sig-red">Hủy quyết toán</summary>
            <form action={action} className="mt-2 flex gap-2"><Hid intent="cancel" />
              <input name="reason" className="field" placeholder="Lý do hủy *" aria-label="Lý do hủy quyết toán" required />
              <button className="btn btn-danger shrink-0" disabled={pending} onClick={confirm("Hủy quyết toán? Đã có phiếu chi/thu thì phải hủy phiếu trước.")}>Hủy</button></form></details>
        )}
        {s.status === "approved" && manager && (
          <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-petrol">Lập điều chỉnh (chi phí muộn / sai sót)</summary>
            <form action={action} className="mt-2 grid gap-2 md:grid-cols-2"><input type="hidden" name="intent" value="revise" /><input type="hidden" name="id" value={s.id} /><input type="hidden" name="request_id" value={requestId} />
              <label className="md:col-span-2"><span className="label">Lý do điều chỉnh *</span><input name="reason" className="field" placeholder="Ví dụ: chi phí sơn phát sinh muộn" /><Err k="reason" /></label>
              <button className="btn btn-primary md:w-fit" disabled={pending}>Lập điều chỉnh</button>
              <p className="text-xs text-ink-soft md:col-span-2">Bản đã duyệt giữ nguyên. Điều chỉnh là bản tính lại; khi được duyệt, bản cũ thành “đã được điều chỉnh thay thế” và số đã chi được chuyển sang bản mới.</p>
            </form></details>
        )}
      </section>
    </div>
  );
}
