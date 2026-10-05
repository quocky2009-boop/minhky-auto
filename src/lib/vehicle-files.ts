/**
 * Tệp gắn với xe: loại tệp, giới hạn, tên tệp an toàn, đường dẫn Storage. Thuần TypeScript, kiểm thử được.
 * Database và Storage vẫn là nơi chặn thật (RLS + trigger); kiểm tra ở đây để báo lỗi sớm và dễ hiểu.
 * Chỉ ảnh và video (anh Kỳ 05/10/2026: không cần tải giấy tờ lên). Ai thấy xe thì thấy.
 */
export const MEDIA_CATEGORIES = ["photo", "video"] as const;
export type FileCategory = (typeof MEDIA_CATEGORIES)[number];

export const FILE_CATEGORY_LABEL: Record<string, string> = { photo: "Ảnh xe", video: "Video xe" };

export const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * MB;
export const MAX_VIDEO_BYTES = 50 * MB;   // khớp giới hạn bucket

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];

export const isFileCategory = (c: string): c is FileCategory => c in FILE_CATEGORY_LABEL;

/** Loại tệp người dùng được phép thêm theo vai trò (database vẫn kiểm tra lại). Mọi vai trò nhân viên đều thêm được ảnh/video xe mình thấy. */
export function allowedCategories(roles: string[]): FileCategory[] {
  const staff = roles.some((r) => ["admin", "manager", "accountant", "sales", "technician"].includes(r));
  return staff ? [...MEDIA_CATEGORIES] : [];
}

/** Trả về thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ. */
export function validateUpload(category: string, mime: string, size: number): string | null {
  if (!isFileCategory(category)) return "Loại tệp không hợp lệ.";
  if (!Number.isFinite(size) || size <= 0) return "Tệp rỗng.";
  const m = mime.toLowerCase();
  if (category === "photo") {
    if (!IMAGE_TYPES.includes(m)) return "Ảnh phải là JPG, PNG, WEBP hoặc HEIC.";
    return size > MAX_IMAGE_BYTES ? "Ảnh lớn hơn 20 MB." : null;
  }
  if (!VIDEO_TYPES.includes(m)) return "Video phải là MP4 hoặc MOV.";
  return size > MAX_VIDEO_BYTES ? "Video lớn hơn 50 MB." : null;
}

/** Bỏ dấu, chỉ giữ chữ-số-._-, tối đa 80 ký tự cuối (giữ đuôi tệp). */
export function safeFileName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+/, "").slice(-80) || "tep";
}

/** <vehicle_id>/<loại>/<uuid>-<tên an toàn> — đúng dạng chính sách Storage yêu cầu. */
export function buildStoragePath(vehicleId: string, category: string, uniqueId: string, fileName: string): string {
  return `${vehicleId}/${category}/${uniqueId}-${safeFileName(fileName)}`;
}
