import { describe, expect, it } from "vitest";
import { evaluateMatch, type BuyCriteria, type CandidateVehicle } from "@/lib/matching";

const VF = "make-vinfast", VF8 = "model-vf8", PLUS = "var-plus", ECO = "var-eco";
const MG = "make-mg", MG5 = "model-mg5";

const base: BuyCriteria = {
  options: [{ makeId: VF, modelId: VF8 }],
  yearMin: null, yearMax: null, budgetMin: null, budgetMax: null, odoMax: null,
  fuelTypes: [], seats: [], condition: null, colorsAccepted: [], colorsRejected: [], strict: ["model"],
};
const car = (o: Partial<CandidateVehicle> = {}): CandidateVehicle => ({
  makeId: VF, modelId: VF8, variantId: PLUS, year: 2023, color: "Trắng", fuelType: "ev", seats: 5, odo: 15000,
  price: 650_000_000n, condition: "used", availability: "in_stock", ...o,
});

describe("§12.2: khoảng ngân sách", () => {
  it("ngân sách 600–700 triệu ghép được xe 650 triệu", () => {
    const r = evaluateMatch({ ...base, budgetMin: 600_000_000n, budgetMax: 700_000_000n }, car());
    expect(r.level).toBe("match");
  });
  it("chỉ có trần ngân sách: khoảng mở phía dưới", () => {
    expect(evaluateMatch({ ...base, budgetMax: 700_000_000n }, car({ price: 300_000_000n })).level).toBe("match");
  });
  it("chỉ có sàn ngân sách: khoảng mở phía trên", () => {
    expect(evaluateMatch({ ...base, budgetMin: 600_000_000n }, car({ price: 900_000_000n })).level).toBe("match");
  });
  it("xe chưa có giá: cần xác minh, không tự coi là phù hợp", () => {
    expect(evaluateMatch({ ...base, budgetMax: 700_000_000n }, car({ price: null })).level).toBe("verify");
  });
  it("vượt trần trong biên độ khi ngân sách linh hoạt: gần phù hợp", () => {
    expect(evaluateMatch({ ...base, budgetMax: 700_000_000n }, car({ price: 740_000_000n })).level).toBe("near");
  });
  it("vượt trần quá biên độ: loại", () => {
    expect(evaluateMatch({ ...base, budgetMax: 700_000_000n }, car({ price: 900_000_000n })).level).toBe("excluded");
  });
  it("ngân sách bắt buộc: vượt 1 đồng cũng loại", () => {
    const r = evaluateMatch({ ...base, budgetMax: 700_000_000n, strict: ["model", "budget"] }, car({ price: 700_000_001n }));
    expect(r.level).toBe("excluded");
  });
});

describe("§12.2: lọc kết hợp hãng/model/đời/màu/ngân sách", () => {
  const c: BuyCriteria = {
    ...base, yearMin: 2022, yearMax: 2024, budgetMin: 600_000_000n, budgetMax: 700_000_000n,
    colorsAccepted: ["trắng", "đen"], strict: ["model", "year", "color", "budget"],
  };
  const pool: Array<[string, CandidateVehicle]> = [
    ["ok", car()],
    ["sai hãng", car({ makeId: MG, modelId: MG5 })],
    ["đời cũ", car({ year: 2021 })],
    ["sai màu", car({ color: "Đỏ" })],
    ["quá ngân sách", car({ price: 720_000_000n })],
    ["màu có dấu khác cách viết", car({ color: "  ĐEN " })],
  ];
  it("chỉ trả đúng các xe thỏa mọi tiêu chí bắt buộc", () => {
    const passed = pool.filter(([, v]) => evaluateMatch(c, v).level !== "excluded").map(([k]) => k);
    expect(passed).toEqual(["ok", "màu có dấu khác cách viết"]);
  });
  it("không bỏ qua tiêu chí bắt buộc khi các tiêu chí khác rất khớp", () => {
    expect(evaluateMatch(c, car({ year: 2019 })).level).toBe("excluded");
  });
  it("màu khách không muốn luôn bị loại", () => {
    expect(evaluateMatch({ ...base, colorsRejected: ["đỏ"] }, car({ color: "Đỏ" })).level).toBe("excluded");
  });
  it("model đúng nhưng khác phiên bản, model không bắt buộc: gần phù hợp và nêu lý do", () => {
    const r = evaluateMatch({ ...base, options: [{ makeId: VF, modelId: VF8, variantId: ECO }], strict: [] }, car());
    expect(r.level).toBe("near");
    expect(r.reasons).toContain("Đúng model nhưng khác phiên bản");
  });
  it("chấp nhận nhiều phương án xe", () => {
    const r = evaluateMatch({ ...base, options: [{ makeId: MG, modelId: MG5 }, { makeId: VF, modelId: VF8 }] }, car());
    expect(r.level).toBe("match");
  });
  it("thiếu ODO khi khách có yêu cầu ODO: cần xác minh", () => {
    expect(evaluateMatch({ ...base, odoMax: 30000 }, car({ odo: null })).level).toBe("verify");
  });
});

describe("§12.3: nguồn xe chưa thu mua", () => {
  it("không bao giờ được coi là sẵn giao", () => {
    const r = evaluateMatch(base, car({ availability: "source_not_acquired" }));
    expect(r.level).toBe("match");
    expect(r.readyToDeliver).toBe(false);
    expect(r.availabilityLabel).toMatch(/chưa thu mua/);
  });
  it("xe trong kho và xe ký gửi là sẵn bán", () => {
    expect(evaluateMatch(base, car({ availability: "in_stock" })).readyToDeliver).toBe(true);
    expect(evaluateMatch(base, car({ availability: "consignment" })).readyToDeliver).toBe(true);
  });
});

describe("Nhu cầu lâu chưa cập nhật", () => {
  it("không tự coi còn hiệu lực: hạ xuống cần xác minh", () => {
    const r = evaluateMatch({ ...base, stale: true }, car());
    expect(r.level).toBe("verify");
  });
});
