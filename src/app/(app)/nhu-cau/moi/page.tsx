import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { getCatalog, getSellers, getSources } from "@/lib/demands/data";
import { PageHeader } from "@/components/ui";
import { DemandForm } from "../demand-form";

export const metadata = { title: "Thêm nhu cầu" };

export default async function NewDemandPage({ searchParams }: { searchParams: Promise<{ khach?: string; loai?: string }> }) {
  const user = await requireModule("demands");
  const sp = await searchParams;
  const [catalog, sources, sellers] = await Promise.all([getCatalog(), getSources(), getSellers()]);
  let preset: { id: string; name: string; phone: string | null } | null = null;
  if (sp.khach && /^[0-9a-f-]{36}$/i.test(sp.khach)) {
    const supabase = await createClient();
    const { data } = await supabase.from("customers").select("id, full_name, phone").eq("id", sp.khach).maybeSingle();
    if (data) preset = { id: data.id, name: data.full_name, phone: data.phone };
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Thêm nhu cầu" sub="Nhập nhanh từ tin nhắn khách. Chỉ tên khách là bắt buộc; thông tin chưa biết để trống." />
      <DemandForm mode="create" requestId={randomUUID()} initial={{ kind: sp.loai === "sell" ? "sell" : "buy" }} catalog={catalog}
        sources={sources} sellers={sellers} canAssign={isManager(user.roles)} me={user.id} presetCustomer={preset} />
    </div>
  );
}
