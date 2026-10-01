/**
 * Tiền VND: luôn dùng bigint (đồng). Không dùng number/float cho tính toán tiền.
 * Database lưu numeric(18,0); khi đọc qua API có thể là number hoặc string -> dùng toVnd().
 */
export type Vnd = bigint;

export function toVnd(v: unknown): Vnd | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || !Number.isInteger(v)) throw new Error("Giá trị tiền không hợp lệ");
    if (!Number.isSafeInteger(v)) throw new Error("Giá trị tiền vượt giới hạn an toàn");
    return BigInt(v);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!/^-?\d+(\.0+)?$/.test(s)) throw new Error("Giá trị tiền không hợp lệ");
    return BigInt(s.split(".")[0]);
  }
  throw new Error("Giá trị tiền không hợp lệ");
}

const UNITS: Array<[RegExp, bigint]> = [
  [/^(ty|tỷ|tỉ|ti|b)$/, 1_000_000_000n],
  [/^(trieu|triệu|tr|m)$/, 1_000_000n],
  [/^(k|nghin|nghìn|ngan|ngàn)$/, 1_000n],
];

/**
 * Đọc số tiền người dùng gõ nhanh: "650tr", "650 triệu", "1,2 tỷ", "1.25 ty", "650.000.000", "650000000".
 * Trả null nếu rỗng; ném lỗi nếu không hiểu được (không đoán bừa).
 */
export function parseVndInput(raw: string | null | undefined): Vnd | null {
  const s = (raw ?? "").trim().toLowerCase().replace(/đ|₫|vnd|vnđ/g, "").trim();
  if (!s) return null;
  const m = s.match(/^([\d.,\s]+?)\s*([a-zà-ỹ]*)$/i);
  if (!m) throw new Error(`Không hiểu số tiền "${raw}"`);
  const numPart = m[1].replace(/\s/g, "");
  const unitPart = m[2];
  let unit: bigint | null = null;
  if (unitPart) {
    for (const [re, mult] of UNITS) if (re.test(unitPart)) unit = mult;
    if (unit === null) throw new Error(`Không hiểu đơn vị "${unitPart}"`);
  }
  if (unit === null) {
    // Không có đơn vị: dấu . và , chỉ là phân cách hàng nghìn.
    if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(numPart)) throw new Error(`Không hiểu số tiền "${raw}"`);
    return BigInt(numPart.replace(/[.,]/g, ""));
  }
  // Có đơn vị: cho phép một dấu thập phân (, hoặc .)
  if (!/^\d+([.,]\d+)?$/.test(numPart)) throw new Error(`Không hiểu số tiền "${raw}"`);
  const [intS, fracS = ""] = numPart.split(/[.,]/);
  const scale = 10n ** BigInt(fracS.length);
  const total = (BigInt(intS) * scale + BigInt(fracS || "0")) * unit;
  if (total % scale !== 0n) throw new Error(`Số tiền "${raw}" lẻ dưới 1 đồng`);
  return total / scale;
}

function groupThousands(n: bigint): string {
  const neg = n < 0n;
  const s = (neg ? -n : n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return neg ? "-" + s : s;
}

/** 650000000 -> "650.000.000 ₫"; null -> "Chưa rõ" (không bao giờ hiển thị thành 0). */
export function formatVnd(v: unknown, unknownLabel = "Chưa rõ"): string {
  const n = toVnd(v);
  if (n === null) return unknownLabel;
  return `${groupThousands(n)} ₫`;
}

/** Dạng gọn cho bảng/thẻ: "650 tr", "1,25 tỷ". */
export function formatVndShort(v: unknown, unknownLabel = "Chưa rõ"): string {
  const n = toVnd(v);
  if (n === null) return unknownLabel;
  const abs = n < 0n ? -n : n;
  const sign = n < 0n ? "-" : "";
  const fmt = (unit: bigint, label: string) => {
    const whole = abs / unit;
    const rem = abs % unit;
    const frac = ((rem * 100n) / unit).toString().padStart(2, "0").replace(/0+$/, "");
    return `${sign}${whole}${frac ? "," + frac : ""} ${label}`;
  };
  if (abs >= 1_000_000_000n) return fmt(1_000_000_000n, "tỷ");
  if (abs >= 1_000_000n) return fmt(1_000_000n, "tr");
  return `${sign}${groupThousands(abs)} ₫`;
}

export function formatRange(min: unknown, max: unknown): string {
  const a = toVnd(min);
  const b = toVnd(max);
  if (a === null && b === null) return "Chưa rõ";
  if (a !== null && b !== null) return a === b ? formatVndShort(a) : `${formatVndShort(a)} – ${formatVndShort(b)}`;
  if (a !== null) return `Từ ${formatVndShort(a)}`;
  return `Đến ${formatVndShort(b)}`;
}
