/**
 * Chuẩn hóa số điện thoại Việt Nam để phát hiện trùng.
 * PHẢI khớp với hàm SQL private.normalize_phone (migration 0100).
 */
export function normalizePhone(input: string | null | undefined): string | null {
  const d = (input ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("84") && (d.length === 11 || d.length === 12)) return "0" + d.slice(2);
  return d;
}

export function isPlausibleVnPhone(input: string | null | undefined): boolean {
  const n = normalizePhone(input);
  return !!n && /^0\d{9,10}$/.test(n);
}

export function formatPhone(input: string | null | undefined): string {
  const n = normalizePhone(input);
  if (!n) return "";
  if (n.length === 10) return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
  return n;
}
