/**
 * Gợi ý ghép nhu cầu mua ↔ xe/nguồn xe — bản 1 dùng QUY TẮC RÕ RÀNG, không AI.
 * Kết quả: "match" (phù hợp) | "near" (gần phù hợp) | "verify" (cần xác minh) | "excluded".
 *  - Tiêu chí bắt buộc lệch -> loại (không bao giờ bỏ qua).
 *  - Tiêu chí linh hoạt lệch -> gần phù hợp (ngân sách chỉ trong biên độ BUDGET_TOLERANCE).
 *  - Thiếu dữ liệu ở bên nào -> cần xác minh (không coi thiếu là 0 hay là phù hợp).
 *  - Màu khách đã loại trừ -> luôn loại.
 *  - Nguồn xe chưa thu mua không bao giờ được gắn nhãn sẵn giao.
 */
import { normText } from "./text";

export const BUDGET_TOLERANCE_PERCENT = 10n; // biên độ "gần phù hợp" khi ngân sách không bắt buộc

export type Criterion = "model" | "year" | "budget" | "color" | "odo" | "fuel" | "seats" | "condition";

export type VehicleOption = { makeId: string; modelId?: string | null; variantId?: string | null; label?: string };

export type BuyCriteria = {
  options: VehicleOption[];
  yearMin: number | null;
  yearMax: number | null;
  budgetMin: bigint | null;
  budgetMax: bigint | null;
  odoMax: number | null;
  fuelTypes: string[];
  seats: number[];
  condition: "new" | "used" | "any" | null;
  colorsAccepted: string[];
  colorsRejected: string[];
  strict: Criterion[];
  /** Nhu cầu lâu chưa cập nhật -> không tự coi còn hiệu lực */
  stale?: boolean;
};

export type Availability = "in_stock" | "consignment" | "held" | "source_not_acquired";

export type CandidateVehicle = {
  makeId: string;
  modelId: string | null;
  variantId: string | null;
  year: number | null;
  color: string | null;
  fuelType: string | null;
  seats: number | null;
  odo: number | null;
  price: bigint | null;
  condition: "new" | "used" | null;
  availability: Availability;
};

export type Outcome = "match" | "mismatch" | "unknown";
export type Check = { criterion: Criterion; outcome: Outcome; strict: boolean; message: string; withinTolerance?: boolean };
export type MatchLevel = "match" | "near" | "verify" | "excluded";

export type MatchResult = {
  level: MatchLevel;
  checks: Check[];
  reasons: string[];
  availabilityLabel: string;
  readyToDeliver: boolean;
  score: number;
};

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  in_stock: "Xe trong kho — sẵn bán",
  consignment: "Xe ký gửi — sẵn bán",
  held: "Xe đang được giữ cho khách khác",
  source_not_acquired: "Nguồn xe khách đang chào bán — chưa thu mua",
};

const fmtTr = (v: bigint) => `${(v / 1_000_000n).toString()} tr`;

function checkModel(c: BuyCriteria, v: CandidateVehicle): Check | null {
  if (c.options.length === 0) return null;
  const strict = c.strict.includes("model");
  const sameMake = c.options.filter((o) => o.makeId === v.makeId);
  if (sameMake.length === 0) return { criterion: "model", outcome: "mismatch", strict, message: "Khác hãng xe mong muốn" };
  for (const o of sameMake) {
    if (!o.modelId) return { criterion: "model", outcome: "match", strict, message: "Đúng hãng mong muốn" };
    if (v.modelId === null) return { criterion: "model", outcome: "unknown", strict, message: "Chưa rõ model của xe" };
    if (o.modelId === v.modelId) {
      if (!o.variantId) return { criterion: "model", outcome: "match", strict, message: "Đúng model mong muốn" };
      if (v.variantId === null) return { criterion: "model", outcome: "unknown", strict, message: "Đúng model, chưa rõ phiên bản" };
      if (o.variantId === v.variantId) return { criterion: "model", outcome: "match", strict, message: "Đúng model và phiên bản" };
    }
  }
  const sameModel = sameMake.some((o) => o.modelId && o.modelId === v.modelId);
  return {
    criterion: "model", outcome: "mismatch", strict,
    message: sameModel ? "Đúng model nhưng khác phiên bản" : "Khác model mong muốn",
  };
}

function checkYear(c: BuyCriteria, v: CandidateVehicle): Check | null {
  if (c.yearMin === null && c.yearMax === null) return null;
  const strict = c.strict.includes("year");
  if (v.year === null) return { criterion: "year", outcome: "unknown", strict, message: "Chưa rõ năm sản xuất" };
  if (c.yearMin !== null && v.year < c.yearMin) return { criterion: "year", outcome: "mismatch", strict, message: `Đời ${v.year} cũ hơn mong muốn (từ ${c.yearMin})` };
  if (c.yearMax !== null && v.year > c.yearMax) return { criterion: "year", outcome: "mismatch", strict, message: `Đời ${v.year} mới hơn khoảng mong muốn (đến ${c.yearMax})` };
  return { criterion: "year", outcome: "match", strict, message: `Đời ${v.year} trong khoảng mong muốn` };
}

/** Khoảng giá: thiếu một đầu = khoảng mở. Thiếu giá xe = cần xác minh. */
export function checkBudget(c: Pick<BuyCriteria, "budgetMin" | "budgetMax" | "strict">, price: bigint | null): Check | null {
  if (c.budgetMin === null && c.budgetMax === null) return null;
  const strict = c.strict.includes("budget");
  if (price === null) return { criterion: "budget", outcome: "unknown", strict, message: "Xe chưa có giá chào" };
  if (c.budgetMax !== null && price > c.budgetMax) {
    const within = price * 100n <= c.budgetMax * (100n + BUDGET_TOLERANCE_PERCENT);
    return { criterion: "budget", outcome: "mismatch", strict, withinTolerance: within, message: `Giá ${fmtTr(price)} vượt ngân sách tối đa ${fmtTr(c.budgetMax)}` };
  }
  if (c.budgetMin !== null && price < c.budgetMin) {
    const within = price * 100n >= c.budgetMin * (100n - BUDGET_TOLERANCE_PERCENT);
    return { criterion: "budget", outcome: "mismatch", strict, withinTolerance: within, message: `Giá ${fmtTr(price)} thấp hơn ngân sách tối thiểu ${fmtTr(c.budgetMin)}` };
  }
  return { criterion: "budget", outcome: "match", strict, message: `Giá ${fmtTr(price)} trong ngân sách` };
}

function checkColor(c: BuyCriteria, v: CandidateVehicle): Check | null {
  const accepted = c.colorsAccepted.map(normText).filter(Boolean);
  const rejected = c.colorsRejected.map(normText).filter(Boolean);
  if (accepted.length === 0 && rejected.length === 0) return null;
  const strict = c.strict.includes("color");
  const color = normText(v.color);
  if (!color) return { criterion: "color", outcome: "unknown", strict, message: "Chưa rõ màu xe" };
  if (rejected.includes(color)) return { criterion: "color", outcome: "mismatch", strict: true, message: `Màu ${v.color} khách không muốn` };
  if (accepted.length > 0 && !accepted.includes(color)) return { criterion: "color", outcome: "mismatch", strict, message: `Màu ${v.color} không nằm trong màu khách chọn` };
  return { criterion: "color", outcome: "match", strict, message: `Màu ${v.color} phù hợp` };
}

function checkOdo(c: BuyCriteria, v: CandidateVehicle): Check | null {
  if (c.odoMax === null) return null;
  const strict = c.strict.includes("odo");
  if (v.odo === null) return { criterion: "odo", outcome: "unknown", strict, message: "Chưa rõ ODO" };
  if (v.odo > c.odoMax) return { criterion: "odo", outcome: "mismatch", strict, message: `ODO ${v.odo.toLocaleString("vi-VN")} km vượt mức tối đa` };
  return { criterion: "odo", outcome: "match", strict, message: "ODO trong mức mong muốn" };
}

function checkList<T extends string | number>(criterion: Criterion, wanted: T[], actual: T | null, label: string, c: BuyCriteria): Check | null {
  if (wanted.length === 0) return null;
  const strict = c.strict.includes(criterion);
  if (actual === null) return { criterion, outcome: "unknown", strict, message: `Chưa rõ ${label}` };
  if (!wanted.includes(actual)) return { criterion, outcome: "mismatch", strict, message: `Khác ${label} mong muốn` };
  return { criterion, outcome: "match", strict, message: `Đúng ${label}` };
}

function checkCondition(c: BuyCriteria, v: CandidateVehicle): Check | null {
  if (!c.condition || c.condition === "any") return null;
  const strict = c.strict.includes("condition");
  if (v.condition === null) return { criterion: "condition", outcome: "unknown", strict, message: "Chưa rõ tình trạng mới/cũ" };
  if (v.condition !== c.condition) return { criterion: "condition", outcome: "mismatch", strict, message: c.condition === "new" ? "Khách cần xe mới" : "Khách cần xe đã qua sử dụng" };
  return { criterion: "condition", outcome: "match", strict, message: "Đúng tình trạng mong muốn" };
}

export function evaluateMatch(c: BuyCriteria, v: CandidateVehicle): MatchResult {
  const checks = [
    checkModel(c, v),
    checkYear(c, v),
    checkBudget(c, v.price),
    checkColor(c, v),
    checkOdo(c, v),
    checkList("fuel", c.fuelTypes, v.fuelType, "nhiên liệu", c),
    checkList("seats", c.seats, v.seats, "số chỗ", c),
    checkCondition(c, v),
  ].filter((x): x is Check => x !== null);

  const mismatches = checks.filter((x) => x.outcome === "mismatch");
  const unknowns = checks.filter((x) => x.outcome === "unknown");
  const hardFail = mismatches.some((x) => x.strict || (x.criterion === "budget" && !x.withinTolerance));

  let level: MatchLevel;
  if (hardFail) level = "excluded";
  else if (mismatches.length > 0) level = "near";
  else if (unknowns.length > 0) level = "verify";
  else level = "match";

  const reasons = checks.map((x) => x.message);
  if (c.stale && level === "match") {
    level = "verify";
    reasons.push("Nhu cầu lâu chưa cập nhật — cần xác minh lại với khách");
  }
  if (v.availability === "held") reasons.push("Xe đang được giữ cho khách khác");

  const rank: Record<MatchLevel, number> = { match: 300, verify: 200, near: 100, excluded: 0 };
  const score = rank[level] + checks.filter((x) => x.outcome === "match").length * 10 - unknowns.length * 3 - mismatches.length * 5
    - (v.availability === "source_not_acquired" ? 1 : 0);

  return {
    level,
    checks,
    reasons,
    availabilityLabel: AVAILABILITY_LABEL[v.availability],
    readyToDeliver: v.availability === "in_stock" || v.availability === "consignment",
    score,
  };
}

export const MATCH_LEVEL_LABEL: Record<MatchLevel, string> = {
  match: "Phù hợp",
  near: "Gần phù hợp",
  verify: "Cần xác minh",
  excluded: "Không phù hợp",
};
