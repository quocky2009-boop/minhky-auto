import { describe, expect, it } from "vitest";
import { computeProfitSplit, parseRatio } from "@/lib/profit-split";

const tr = (n: number) => BigInt(n) * 1_000_000n;

describe("§12.6: công thức chia lợi nhuận (dữ liệu test)", () => {
  it("P = 40tr, c = 20%, góp 60/40 → công ty 8tr; hai bên 19,2tr và 12,8tr", () => {
    const r = computeProfitSplit({
      distributable: tr(40), companyRate: "20%", termsApproved: true,
      participants: [{ id: "a", label: "Bên A", ratio: "0.6" }, { id: "b", label: "Bên B", ratio: "0.4" }],
    });
    if (!r.ok) throw new Error(r.message);
    expect(r.companyOperatingShare).toBe(8_000_000n);
    expect(r.shares.map((s) => s.amount)).toEqual([19_200_000n, 12_800_000n]);
    expect(r.companyTotal).toBe(8_000_000n);
  });
});

describe("§12.7: công ty cũng góp vốn", () => {
  it("nhận đủ phần vận hành + phần vốn góp, không đếm trùng", () => {
    const r = computeProfitSplit({
      distributable: tr(40), companyRate: "0.2", termsApproved: true,
      participants: [
        { id: "cty", label: "Công ty", ratio: "0.5", isCompany: true },
        { id: "a", label: "Bên A", ratio: "0.5" },
      ],
    });
    if (!r.ok) throw new Error(r.message);
    expect(r.companyOperatingShare).toBe(8_000_000n);
    expect(r.shares.find((s) => s.id === "cty")!.amount).toBe(16_000_000n);
    expect(r.companyTotal).toBe(24_000_000n);
    const paidOut = r.companyOperatingShare + r.shares.reduce((a, s) => a + s.amount, 0n);
    expect(paidOut).toBe(tr(40)); // tổng chi = P, không có tiền "đếm hai lần"
  });
});

describe("§12.8: thiếu điều khoản hoặc lỗ", () => {
  const ok = { distributable: tr(40), companyRate: "0.2", termsApproved: true,
    participants: [{ id: "a", label: "A", ratio: "1" }] };
  it("không có tỷ lệ công ty → từ chối, không dùng mặc định", () => {
    expect(computeProfitSplit({ ...ok, companyRate: null })).toMatchObject({ ok: false, error: "missing_company_rate" });
  });
  it("điều khoản chưa duyệt → từ chối", () => {
    expect(computeProfitSplit({ ...ok, termsApproved: false })).toMatchObject({ ok: false, error: "terms_not_approved" });
  });
  it("hòa vốn hoặc lỗ → không áp công thức chia lãi", () => {
    expect(computeProfitSplit({ ...ok, distributable: 0n })).toMatchObject({ ok: false, error: "not_profitable" });
    expect(computeProfitSplit({ ...ok, distributable: -tr(5) })).toMatchObject({ ok: false, error: "not_profitable" });
  });
  it("tổng tỷ lệ góp khác 100% → từ chối", () => {
    expect(computeProfitSplit({ ...ok, participants: [{ id: "a", label: "A", ratio: "0.6" }, { id: "b", label: "B", ratio: "0.3" }] }))
      .toMatchObject({ ok: false, error: "ratios_not_100" });
  });
  it("tỷ lệ công ty > 100% → từ chối", () => {
    expect(computeProfitSplit({ ...ok, companyRate: "120%" })).toMatchObject({ ok: false, error: "invalid_company_rate" });
  });
});

describe("§12.8: làm tròn, tổng phân bổ khớp tuyệt đối", () => {
  it("chia 3 bên 1/3 với số lẻ: tổng đúng bằng P", () => {
    const third = "0.333333333333333333";
    const r = computeProfitSplit({
      distributable: 10_000_001n, companyRate: "0.15", termsApproved: true,
      participants: [
        { id: "a", label: "A", ratio: third }, { id: "b", label: "B", ratio: third },
        { id: "c", label: "C", ratio: "0.333333333333333334" },
      ],
    });
    if (!r.ok) throw new Error(r.message);
    const total = r.companyOperatingShare + r.shares.reduce((a, s) => a + s.amount, 0n);
    expect(total).toBe(10_000_001n);
  });
  it("nhiều bộ số ngẫu nhiên: tổng luôn khớp, mỗi phần lệch tối đa 1 đồng so với lý thuyết", () => {
    let seed = 42;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let k = 0; k < 500; k++) {
      const P = BigInt(1 + rnd(900_000_000));
      const parts = 1 + rnd(5);
      const weights = Array.from({ length: parts }, () => 1 + rnd(97));
      const sum = weights.reduce((a, b) => a + b, 0);
      // tỷ lệ dạng % có 4 chữ số thập phân, ép tổng = 100%
      const bp = weights.map((w) => Math.floor((w * 1_000_000) / sum));
      bp[bp.length - 1] += 1_000_000 - bp.reduce((a, b) => a + b, 0);
      const r = computeProfitSplit({
        distributable: P, companyRate: `${rnd(10001) / 100}%`, termsApproved: true,
        participants: bp.map((b, i) => ({ id: String(i), label: String(i), ratio: `${(b / 10000).toFixed(4)}%` })),
      });
      if (!r.ok) throw new Error(r.message);
      const total = r.companyOperatingShare + r.shares.reduce((a, s) => a + s.amount, 0n);
      expect(total).toBe(P);
      r.shares.forEach((s, i) => {
        const ratio = parseRatio(`${(bp[i] / 10000).toFixed(4)}%`);
        const exactTimesDen = r.remainder * ratio.num;
        const diff = s.amount * ratio.den - exactTimesDen;
        expect(diff < 0n ? -diff : diff).toBeLessThan(ratio.den);
      });
    }
  });
});
