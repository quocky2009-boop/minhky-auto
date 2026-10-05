/**
 * Tệp đính kèm nhu cầu (ảnh/video/PDF ≤ 20 MB, khớp giới hạn bucket demand-files). Thuần TypeScript, kiểm thử được.
 * Tải thẳng từ trình duyệt lên Storage bằng URL ký (Vercel giới hạn thân yêu cầu ~4,5 MB nên không đi qua Server Action).
 */
import { MB, safeFileName } from "@/lib/vehicle-files";

export const MAX_ATTACHMENT_BYTES = 20 * MB;
const ALLOWED = /^(image\/|video\/|application\/pdf$)/;

/** Trả về thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ. */
export function validateAttachment(mime: string, size: number): string | null {
  if (!Number.isFinite(size) || size <= 0) return "Tệp rỗng.";
  if (size > MAX_ATTACHMENT_BYTES) return "Tệp lớn hơn 20 MB.";
  if (!ALLOWED.test(mime.toLowerCase())) return "Chỉ nhận ảnh, video hoặc PDF.";
  return null;
}

/** <demand_id>/<uuid>-<tên an toàn> — đúng dạng chính sách Storage yêu cầu. */
export function buildAttachmentPath(demandId: string, uniqueId: string, fileName: string): string {
  return `${demandId}/${uniqueId}-${safeFileName(fileName)}`;
}
