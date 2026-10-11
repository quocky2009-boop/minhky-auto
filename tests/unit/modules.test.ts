import { existsSync } from "node:fs";
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
});
