import { requireModule } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Hướng dẫn sử dụng" };

export default async function GuidePage() {
  await requireModule("guide");
  return (
    <>
      <PageHeader title="Hướng dẫn sử dụng" sub="Dành cho nhân viên Sales. Hình trong tài liệu là minh họa với dữ liệu mẫu." />
      <iframe
        src="/huong-dan/noi-dung"
        title="Hướng dẫn sử dụng cho Sales"
        className="h-[75dvh] w-full rounded-lg border border-line bg-surface"
      />
      <p className="mt-2 text-sm"><a className="text-petrol underline-offset-2 hover:underline" href="/huong-dan/noi-dung" target="_blank" rel="noreferrer">Mở toàn màn hình trong thẻ mới</a></p>
    </>
  );
}
