import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { isManager } from "@/lib/modules";
import { getCatalog } from "@/lib/demands/data";
import { getLocations } from "@/lib/vehicles/data";
import { ErrorBox, PageHeader } from "@/components/ui";
import { VehicleForm } from "../vehicle-form";

export const metadata = { title: "Nhập xe" };

export default async function NewVehiclePage() {
  const user = await requireModule("inventory");
  if (!isManager(user.roles)) return <ErrorBox message="Chỉ quản lý được nhập xe vào kho." />;
  const [catalog, locations] = await Promise.all([getCatalog(), getLocations()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nhập xe vào kho" sub="Xe khách chào bán thì nhập từ trang nhu cầu bán (có liên kết nguồn gốc). Dùng form này cho xe mới về hoặc xe nhập trực tiếp." />
      <VehicleForm mode="create" requestId={randomUUID()} initial={{}} catalog={catalog} locations={locations} showFinance />
    </div>
  );
}
