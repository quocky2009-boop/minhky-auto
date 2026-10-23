import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULES, canUse } from "@/lib/modules";

describe("Menu (registry modules)", () => {
  it("mọi mục menu trỏ tới một trang có thật (không có nút giả / mục 'chưa triển khai')", () => {
    for (const m of MODULES) {
      expect(m.href.startsWith("/"), m.key).toBe(true);
      expect(existsSync(path.join(process.cwd(), "src/app/(app)", m.href, "page.tsx")), `${m.key} → ${m.href}`).toBe(true);
    }
  });
  it("khóa và đường dẫn không trùng", () => {
    expect(new Set(MODULES.map((m) => m.key)).size).toBe(MODULES.length);
    expect(new Set(MODULES.map((m) => m.href)).size).toBe(MODULES.length);
  });
  it("sales không thấy Thu chi, Quyết toán, Báo cáo; thấy Hoa hồng và Hậu mãi; kế toán thấy Thu chi/Quyết toán/Báo cáo", () => {
    for (const k of ["cashbook", "settlement", "reports"]) { expect(canUse(["sales"], k), k).toBe(false); expect(canUse(["accountant"], k), k).toBe(true); }
    for (const k of ["commission", "aftersales"]) expect(canUse(["sales"], k), k).toBe(true);
    expect(canUse(["technician"], "commission")).toBe(false);
  });
  it("Hướng dẫn Sales: sales/quản lý/admin thấy, kế toán và thẩm định không; bản đóng gói khớp HTML nguồn", async () => {
    expect(canUse(["sales"], "guide")).toBe(true);
    expect(canUse(["manager"], "guide")).toBe(true);
    expect(canUse(["accountant"], "guide")).toBe(false);
    expect(canUse(["technician"], "guide")).toBe(false);
    const { SALES_GUIDE_HTML } = await import("@/content/sales-guide");
    const src = readFileSync(path.join(process.cwd(), "docs/huong-dan-sales/huong-dan-sales.html"), "utf8");
    expect(SALES_GUIDE_HTML, "chạy: node scripts/build-guide.mjs").toBe(src);
  });
});
