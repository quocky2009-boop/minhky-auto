import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { loadOrderOptions } from "../load";
import { OrderForm } from "../order-form";

export const metadata = { title: "Lập đơn bán" };

export default async function NewOrderPage() {
  const user = await requireModule("sales");
  if (!user.roles.some((r) => r === "admin" || r === "manager" || r === "sales")) redirect("/don-ban");
  const supabase = await createClient();
  const o = await loadOrderOptions(supabase);
  return (
    <>
      <PageHeader title="Lập đơn bán" sub="Một đơn có thể gồm nhiều xe của cùng một khách. Đơn được lưu nháp; xác nhận khi đã ký hợp đồng bán." />
      <div className="panel p-4"><OrderForm mode="create" requestId={randomUUID()} demands={o.demands} vehicles={o.vehicles} quotes={o.quotes} /></div>
    </>
  );
}
