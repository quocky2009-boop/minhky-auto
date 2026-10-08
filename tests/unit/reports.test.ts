import { describe, expect, it } from "vitest";
import { csvCell, defaultPeriod, inventoryToCsv, parsePeriod, resultsToCsv, totalsWarnings, type InventoryRow, type ResultRow, type Totals } from "@/lib/reports";

const NOW = new Date("2026-10-08T05:00:00Z");   // 12:00 giờ Việt Nam

describe("Kỳ báo cáo", () => {
  it("mặc định là tháng hiện tại theo giờ Việt Nam", () => {
    expect(defaultPeriod(NOW)).toEqual({ from: "2026-10-01", to: "2026-10-08" });
    expect(defaultPeriod(new Date("2026-09-30T18:00:00Z"))).toEqual({ from: "2026-10-01", to: "2026-10-01" });   // 01:00 ngày 01/10 giờ VN
  });
  it("ngày sai, ngày không tồn tại hoặc đảo đầu cuối → về mặc định và báo đã chỉnh, không nhận giá trị lạ", () => {
    expect(parsePeriod("2026-10-05", "2026-10-07", NOW)).toEqual({ from: "2026-10-05", to: "2026-10-07", adjusted: false });
    for (const [a, b] of [["2026-10-09", "2026-10-01"], ["abc", "2026-10-01"], ["2026-02-30", "2026-03-01"], ["2026-10-01", undefined]] as const) {
      expect(parsePeriod(a, b, NOW)).toMatchObject({ from: "2026-10-01", to: "2026-10-08", adjusted: true });
    }
    expect(parsePeriod(undefined, undefined, NOW).adjusted).toBe(false);
  });
});

describe("CSV", () => {
  it("chặn chèn công thức Excel ở ô chữ, bọc nháy khi có dấu phẩy/nháy/xuống dòng", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+84 912")).toBe("'+84 912");
    expect(csvCell("Kia, Seltos")).toBe("\"Kia, Seltos\"");
    expect(csvCell(null)).toBe("");
    expect(csvCell("Mazda CX-5")).toBe("Mazda CX-5");
  });
  const base: ResultRow = {
    line_id: "l", order_id: "o", order_code: "DB00001", sold_on: "2026-10-03", vehicle_id: "v", vehicle_code: "XE00001", vehicle_label: "=Kia Seltos 2021",
    business_type: "owned", sale_price: "640000000", purchase_price: null, gross_profit: null, costs_confirmed: "0", open_cost_lines: 0, result_after_costs: null,
    settlement_id: null, settlement_code: null, settlement_status: null, distributable: null, company_operating: null, fee_amount: null,
  };
  it("kết quả xe: giá trị thiếu là ô TRỐNG (không phải 0); ngày dd/MM/yyyy; có BOM", () => {
    const csv = resultsToCsv([base, { ...base, order_code: "DB00002", purchase_price: "600000000", gross_profit: "40000000", result_after_costs: "30000000", costs_confirmed: "10000000" }]);
    expect(csv.startsWith("﻿")).toBe(true);
    const rows = csv.trim().split("\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe("DB00001,03/10/2026,XE00001,'=Kia Seltos 2021,Sở hữu,640000000,,,0,,,,,,");
    expect(rows[2].split(",").slice(5, 10)).toEqual(["640000000", "600000000", "40000000", "10000000", "30000000"]);
  });
  it("tồn kho: xe ký gửi không có cột vốn sở hữu", () => {
    const r: InventoryRow = { vehicle_id: "v", code: "XE00002", business_type: "consignment", sale_status: "available", label: "Honda Accord", age_days: 12,
      purchase_price: null, costs_confirmed_showroom: 0, open_cost_lines: 1, capital_tied: null, external_capital: 0, loan_outstanding: 0 };
    expect(inventoryToCsv([r]).trim().split("\r\n")[1]).toBe("XE00002,Honda Accord,Ký gửi,available,12,,,,,,1");
  });
});

describe("Cảnh báo dữ liệu chưa đủ", () => {
  const t: Totals = { lines: 3, owned_lines: 3, consignment_lines: 0, sale_total_owned: "0", gross_profit: "0", gross_unknown: 0, result_after_costs: "0", open_cost_lines: 0, distributable: "0",
    company_operating: "0", owned_unsettled: 0, consignment_fee: "0", consignment_unsettled: 0, general_expense: "0", other_expense: "0", other_income: "0", showroom_result: "0" };
  it("không cảnh báo khi đủ dữ liệu; cảnh báo từng thiếu sót khi có", () => {
    expect(totalsWarnings(t)).toEqual([]);
    const w = totalsWarnings({ ...t, gross_unknown: 2, open_cost_lines: 1, owned_unsettled: 1, consignment_unsettled: 4 });
    expect(w).toHaveLength(4);
    expect(w[0]).toMatch(/2 xe sở hữu chưa có giá mua/);
  });
});
