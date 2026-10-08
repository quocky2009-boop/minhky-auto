import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { formatVnd } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { SCOPE_LABEL } from "@/lib/commissions";
import { todayVn } from "@/lib/cashbook";
import { Empty, PageHeader } from "@/components/ui";
import { loadRules } from "../load";
import { RulePanel } from "./rule-panel";

export const metadata = { title: "Quy tắc hoa hồng" };

export default async function RulesPage() {
  const user = await requireModule("commission");
  const manager = isManager(user.roles);
  const d = await loadRules(await createClient());
  return (
    <>
      <PageHeader title="Quy tắc hoa hồng" sub="Số tiền theo từng đầu xe: xe mới theo hãng/model, xe cũ theo đúng số VIN · không sửa, đổi mức = thêm quy tắc mới có ngày hiệu lực mới">
        <Link href="/hoa-hong" className="btn btn-ghost">← Hoa hồng</Link>
      </PageHeader>
      {manager && <RulePanel makes={d.makes} models={d.models} today={todayVn()} requestId={randomUUID()} rules={d.rules.map((r) => ({ id: r.id, version: r.version, active: r.status === "active" }))} />}
      <section className="panel mt-4 overflow-x-auto">
        {d.rules.length === 0 ? <Empty title="Chưa có quy tắc hoa hồng nào. Xe bán ra sẽ ở trạng thái “chưa có quy tắc” cho đến khi quản lý thêm quy tắc." /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-ink-soft"><th className="p-2">Mã</th><th className="p-2">Đối tượng</th><th className="p-2 text-right">Số tiền</th><th className="p-2">Hiệu lực từ</th><th className="p-2">Trạng thái</th></tr></thead>
            <tbody>
              {d.rules.map((r) => (
                <tr key={r.id} className={`border-b border-line/60 ${r.status === "void" ? "text-ink-soft line-through" : ""}`}>
                  <td className="p-2">{r.code}</td>
                  <td className="p-2">{SCOPE_LABEL[r.scope]}: {r.scope === "vin" ? r.vin : `${r.make?.name ?? "—"} ${r.model?.name ?? "(cả hãng)"}`}</td>
                  <td className="num p-2 text-right">{formatVnd(r.amount)}</td>
                  <td className="p-2">{formatDate(r.effective_from)}</td>
                  <td className="p-2">{r.status === "active" ? "Hiệu lực" : `Đã hủy: ${r.void_reason}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
