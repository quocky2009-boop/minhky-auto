import { describe, expect, it } from "vitest";
import { MB } from "@/lib/vehicle-files";
import { buildAttachmentPath, validateAttachment } from "@/lib/attachments";

describe("Tệp đính kèm nhu cầu", () => {
  it("nhận ảnh, video, PDF đến 20 MB — kể cả loại lớn hơn giới hạn 4,5 MB của Vercel vì tải thẳng lên Storage", () => {
    expect(validateAttachment("image/jpeg", 8 * MB)).toBeNull();
    expect(validateAttachment("video/mp4", 19 * MB)).toBeNull();
    expect(validateAttachment("application/pdf", 20 * MB)).toBeNull();
  });
  it("từ chối tệp rỗng, quá 20 MB, hoặc loại khác", () => {
    expect(validateAttachment("image/png", 0)).toMatch(/rỗng/);
    expect(validateAttachment("image/png", 20 * MB + 1)).toMatch(/20 MB/);
    expect(validateAttachment("application/zip", 1 * MB)).toMatch(/ảnh, video hoặc PDF/);
    expect(validateAttachment("text/html", 1 * MB)).toMatch(/ảnh, video hoặc PDF/);
  });
  it("đường dẫn đúng dạng <nhu cầu>/<uuid>-<tên>, không thoát thư mục", () => {
    const d = "11111111-1111-4111-8111-111111111111", u = "22222222-2222-4222-8222-222222222222";
    const p = buildAttachmentPath(d, u, "../Tin nhắn Zalo.png");
    expect(p).toBe(`${d}/${u}-..-Tin-nhan-Zalo.png`);
    expect(p.split("/")).toHaveLength(2);
  });
});
