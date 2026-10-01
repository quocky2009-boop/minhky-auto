import { describe, expect, it } from "vitest";
import { formatRange, formatVnd, formatVndShort, parseVndInput, toVnd } from "@/lib/money";
import { isPlausibleVnPhone, normalizePhone } from "@/lib/phone";
import { fromLocalInput, formatDate, formatDateTime, todayRangeVN } from "@/lib/dates";

describe("Tiền VND", () => {
  it("đọc cách gõ nhanh của nhân viên", () => {
    expect(parseVndInput("650tr")).toBe(650_000_000n);
    expect(parseVndInput("650 triệu")).toBe(650_000_000n);
    expect(parseVndInput("1,2 tỷ")).toBe(1_200_000_000n);
    expect(parseVndInput("1.25 ty")).toBe(1_250_000_000n);
    expect(parseVndInput("650.000.000")).toBe(650_000_000n);
    expect(parseVndInput("650,000,000 đ")).toBe(650_000_000n);
    expect(parseVndInput("")).toBeNull();
  });
  it("không đoán bừa khi không hiểu", () => {
    expect(() => parseVndInput("khoảng sáu trăm")).toThrow();
    expect(() => parseVndInput("650.5")).toThrow();
    expect(() => parseVndInput("12 xe")).toThrow();
  });
  it("dữ liệu thiếu hiển thị 'Chưa rõ', không thành 0", () => {
    expect(formatVnd(null)).toBe("Chưa rõ");
    expect(formatVnd(0)).toBe("0 ₫");
    expect(formatVnd("650000000")).toBe("650.000.000 ₫");
    expect(formatVndShort(1_250_000_000n)).toBe("1,25 tỷ");
    expect(formatRange(600_000_000, null)).toBe("Từ 600 tr");
    expect(formatRange(null, null)).toBe("Chưa rõ");
  });
  it("từ chối số thực khi đọc tiền", () => {
    expect(() => toVnd(650.5)).toThrow();
  });
});

describe("Số điện thoại", () => {
  it("chuẩn hóa các cách viết về một dạng", () => {
    const forms = ["0912 345 678", "+84 912.345.678", "84912345678", "0912-345-678"];
    expect(new Set(forms.map(normalizePhone))).toEqual(new Set(["0912345678"]));
    expect(isPlausibleVnPhone("0912345678")).toBe(true);
    expect(isPlausibleVnPhone("12345")).toBe(false);
  });
});

describe("Ngày giờ Việt Nam", () => {
  it("hiển thị dd/MM/yyyy theo giờ VN", () => {
    // 2026-09-30T18:30Z = 01:30 ngày 01/10 giờ VN
    expect(formatDate("2026-09-30T18:30:00Z")).toBe("01/10/2026");
    expect(formatDateTime("2026-09-30T18:30:00Z")).toBe("01/10/2026 01:30");
  });
  it("giờ nhập trên form được hiểu là giờ VN", () => {
    expect(fromLocalInput("2026-10-02T09:00")).toBe("2026-10-02T02:00:00.000Z");
  });
  it("'hôm nay' tính theo ngày VN", () => {
    const r = todayRangeVN(new Date("2026-09-30T18:30:00Z"));
    expect(r.start).toBe("2026-09-30T17:00:00.000Z");
    expect(r.end).toBe("2026-10-01T17:00:00.000Z");
  });
});
