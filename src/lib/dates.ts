/** Múi giờ nghiệp vụ: Asia/Ho_Chi_Minh (UTC+7, không có giờ mùa hè). */
export const TZ = "Asia/Ho_Chi_Minh";
const OFFSET = "+07:00";

const dateFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

function parts(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return p as Record<string, string>;
}

/** dd/MM/yyyy */
export function formatDate(v: string | Date | null | undefined, empty = "—"): string {
  if (!v) return empty;
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return empty;
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year}`;
}

/** dd/MM/yyyy HH:mm */
export function formatDateTime(v: string | Date | null | undefined, empty = "—"): string {
  if (!v) return empty;
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return empty;
  const p = parts(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** Giá trị cho <input type="datetime-local"> theo giờ VN */
export function toLocalInput(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** "2026-10-02T09:00" (giờ VN) -> ISO UTC */
export function fromLocalInput(v: string | null | undefined): string | null {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error("Thời gian không hợp lệ");
  return new Date(`${v}:00${OFFSET}`).toISOString();
}

/** Mốc 00:00 hôm nay và 00:00 ngày mai theo giờ VN (dạng ISO UTC) */
export function todayRangeVN(now = new Date()): { start: string; end: string } {
  const p = parts(now);
  const start = new Date(`${p.year}-${p.month}-${p.day}T00:00:00${OFFSET}`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function daysAgo(n: number, now = new Date()): string {
  return new Date(now.getTime() - n * 24 * 3600 * 1000).toISOString();
}

export function relativeDays(v: string | null | undefined, now = new Date()): string {
  if (!v) return "";
  const { start } = todayRangeVN(now);
  const startMs = new Date(start).getTime();
  const t = new Date(v).getTime();
  const day = Math.floor((t - startMs) / (24 * 3600 * 1000));
  if (day === 0) return "hôm nay";
  if (day === 1) return "ngày mai";
  if (day === -1) return "hôm qua";
  return day > 0 ? `${day} ngày nữa` : `${-day} ngày trước`;
}

export { dateFmt, timeFmt };
