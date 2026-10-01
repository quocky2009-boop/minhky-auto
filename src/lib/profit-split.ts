/**
 * Phân chia lợi nhuận xe góp vốn — CÔNG THỨC ĐÃ CHỐT (CLAUDE.md mục 7.1):
 *   Phần công ty cho vận hành = P × c
 *   Phần còn lại              = P − phần công ty cho vận hành
 *   Lợi nhuận bên i           = phần còn lại × rᵢ
 * Nếu công ty cũng góp vốn: công ty nhận thêm phần theo vốn góp (báo cáo tách 2 dòng, không đếm trùng).
 *
 * Quy tắc làm tròn: đơn vị 1 đồng.
 *   - Phần công ty vận hành: làm tròn nửa lên (half-up).
 *   - Phần còn lại chia theo phương pháp phần dư lớn nhất (largest remainder):
 *     mỗi bên nhận phần nguyên, số đồng dư cấp lần lượt cho bên có phần lẻ lớn nhất;
 *     bằng nhau thì theo thứ tự nhập. => Tổng chi trả luôn bằng đúng P.
 *
 * KHÔNG có giá trị mặc định cho c. Thiếu điều khoản / tỷ lệ sai / không có lãi => từ chối, không tự chia.
 */
export type Ratio = { num: bigint; den: bigint };

/** "0.2" | "20%" | "0,6" -> phân số chính xác. Không nhận số thực JS. */
export function parseRatio(input: string): Ratio {
  const s = input.trim().replace(",", ".");
  const pct = s.endsWith("%");
  const body = pct ? s.slice(0, -1).trim() : s;
  if (!/^\d+(\.\d+)?$/.test(body)) throw new Error(`Tỷ lệ không hợp lệ: "${input}"`);
  const [i, f = ""] = body.split(".");
  let num = BigInt(i + f);
  let den = 10n ** BigInt(f.length);
  if (pct) den *= 100n;
  const g = gcd(num, den);
  if (g > 1n) { num /= g; den /= g; }
  return { num, den };
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function roundHalfUp(num: bigint, den: bigint): bigint {
  // num >= 0, den > 0
  return (num * 2n + den) / (2n * den);
}

export type Participant = { id: string; label: string; ratio: string; isCompany?: boolean };

export type SplitInput = {
  /** P: lợi nhuận được phân chia (đồng) sau khi trừ giá mua và chi phí được thỏa thuận */
  distributable: bigint;
  /** c: tỷ lệ công ty cho vận hành, theo điều khoản RIÊNG của xe. null = chưa có điều khoản. */
  companyRate: string | null;
  participants: Participant[];
  /** Điều khoản của xe đã được duyệt */
  termsApproved: boolean;
};

export type SplitError =
  | "terms_not_approved"
  | "missing_company_rate"
  | "invalid_company_rate"
  | "no_participants"
  | "invalid_ratio"
  | "ratios_not_100"
  | "duplicate_participant"
  | "not_profitable";

export type SplitResult =
  | {
      ok: true;
      distributable: bigint;
      companyOperatingShare: bigint;
      remainder: bigint;
      shares: Array<{ id: string; label: string; isCompany: boolean; amount: bigint }>;
      /** Tổng công ty nhận = phần vận hành + phần theo vốn góp (nếu có) */
      companyTotal: bigint;
    }
  | { ok: false; error: SplitError; message: string };

const MESSAGES: Record<SplitError, string> = {
  terms_not_approved: "Điều khoản góp vốn của xe chưa được duyệt.",
  missing_company_rate: "Chưa có tỷ lệ dành cho công ty theo thỏa thuận riêng của xe.",
  invalid_company_rate: "Tỷ lệ công ty phải nằm trong khoảng 0% – 100%.",
  no_participants: "Chưa có bên góp vốn nào.",
  invalid_ratio: "Có tỷ lệ góp vốn không hợp lệ (phải > 0% và ≤ 100%).",
  ratios_not_100: "Tổng tỷ lệ góp vốn phải đúng 100%.",
  duplicate_participant: "Một bên góp vốn bị nhập trùng.",
  not_profitable: "Xe hòa vốn hoặc lỗ: không áp dụng công thức chia lãi. Cần phương án xử lý được duyệt.",
};

const fail = (error: SplitError): SplitResult => ({ ok: false, error, message: MESSAGES[error] });

export function computeProfitSplit(input: SplitInput): SplitResult {
  if (!input.termsApproved) return fail("terms_not_approved");
  if (input.companyRate === null || input.companyRate.trim() === "") return fail("missing_company_rate");
  let c: Ratio;
  try { c = parseRatio(input.companyRate); } catch { return fail("invalid_company_rate"); }
  if (c.num > c.den) return fail("invalid_company_rate");
  if (input.participants.length === 0) return fail("no_participants");
  if (new Set(input.participants.map((p) => p.id)).size !== input.participants.length) return fail("duplicate_participant");

  let ratios: Ratio[];
  try { ratios = input.participants.map((p) => parseRatio(p.ratio)); } catch { return fail("invalid_ratio"); }
  if (ratios.some((r) => r.num <= 0n || r.num > r.den)) return fail("invalid_ratio");
  // Tổng tỷ lệ phải đúng bằng 1 (so sánh phân số chính xác)
  const commonDen = ratios.reduce((acc, r) => (acc * r.den) / gcd(acc, r.den), 1n);
  const sumNum = ratios.reduce((acc, r) => acc + r.num * (commonDen / r.den), 0n);
  if (sumNum !== commonDen) return fail("ratios_not_100");

  const P = input.distributable;
  if (P <= 0n) return fail("not_profitable");

  const companyOps = roundHalfUp(P * c.num, c.den);
  const remainder = P - companyOps;

  // Largest remainder trên mẫu số chung
  const exact = ratios.map((r) => remainder * r.num * (commonDen / r.den)); // = share * commonDen
  const floors = exact.map((e) => e / commonDen);
  let leftover = remainder - floors.reduce((a, b) => a + b, 0n);
  const order = exact
    .map((e, i) => ({ i, frac: e % commonDen }))
    .sort((a, b) => (a.frac === b.frac ? a.i - b.i : a.frac > b.frac ? -1 : 1));
  const amounts = [...floors];
  for (let k = 0; leftover > 0n; k++, leftover--) amounts[order[k % order.length].i] += 1n;

  const shares = input.participants.map((p, i) => ({
    id: p.id, label: p.label, isCompany: !!p.isCompany, amount: amounts[i],
  }));
  const companyInvest = shares.filter((s) => s.isCompany).reduce((a, s) => a + s.amount, 0n);
  return {
    ok: true,
    distributable: P,
    companyOperatingShare: companyOps,
    remainder,
    shares,
    companyTotal: companyOps + companyInvest,
  };
}
