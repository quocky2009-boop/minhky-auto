import { describe, expect, it } from "vitest";
import { MB, allowedCategories, buildStoragePath, isDocumentCategory, safeFileName, validateUpload } from "@/lib/vehicle-files";

const VID = "22222222-2222-4222-8222-222222222222", UID = "33333333-3333-4333-8333-333333333333";

describe("Tệp gắn với xe — kiểm tra trước khi tải lên", () => {
  it("ảnh: chỉ định dạng ảnh, tối đa 20 MB", () => {
    expect(validateUpload("photo", "image/jpeg", 5 * MB)).toBeNull();
    expect(validateUpload("photo", "image/heic", 3 * MB)).toBeNull();
    expect(validateUpload("photo", "application/pdf", 1 * MB)).toMatch(/Ảnh phải là/);
    expect(validateUpload("photo", "image/jpeg", 21 * MB)).toMatch(/20 MB/);
  });
  it("video: MP4/MOV, tối đa 50 MB (khớp giới hạn bucket)", () => {
    expect(validateUpload("video", "video/mp4", 49 * MB)).toBeNull();
    expect(validateUpload("video", "video/quicktime", 10 * MB)).toBeNull();
    expect(validateUpload("video", "image/png", 1 * MB)).toMatch(/Video phải là/);
    expect(validateUpload("video", "video/mp4", 51 * MB)).toMatch(/50 MB/);
  });
  it("giấy tờ: ảnh chụp hoặc PDF, không nhận video", () => {
    expect(validateUpload("registration", "application/pdf", 2 * MB)).toBeNull();
    expect(validateUpload("consignment", "image/jpeg", 2 * MB)).toBeNull();
    expect(validateUpload("inspection", "video/mp4", 2 * MB)).toMatch(/ảnh chụp hoặc PDF/);
  });
  it("tệp rỗng, loại lạ, kích thước không hợp lệ bị từ chối", () => {
    expect(validateUpload("photo", "image/jpeg", 0)).toMatch(/rỗng/);
    expect(validateUpload("photo", "image/jpeg", Number.NaN)).toMatch(/rỗng/);
    expect(validateUpload("loai-la", "image/jpeg", 1)).toMatch(/không hợp lệ/);
  });
});

describe("Đường dẫn và tên tệp", () => {
  it("tên tệp bỏ dấu, bỏ ký tự lạ, giữ đuôi", () => {
    expect(safeFileName("Ảnh trước Đẹp (1).JPG")).toBe("Anh-truoc-Dep-1-.JPG");
    expect(safeFileName("../../etc/passwd")).toBe("..-..-etc-passwd".replace(/^-+/, ""));
    expect(safeFileName("///")).toBe("tep");
    expect(safeFileName("a".repeat(200) + ".png")).toHaveLength(80);
    expect(safeFileName("a".repeat(200) + ".png").endsWith(".png")).toBe(true);
  });
  it("đường dẫn đúng dạng <xe>/<loại>/<uuid>-<tên>, không thể thoát khỏi thư mục xe", () => {
    const p = buildStoragePath(VID, "photo", UID, "../../x.jpg");
    expect(p).toBe(`${VID}/photo/${UID}-..-..-x.jpg`);
    expect(p.split("/")).toHaveLength(3);
    expect(buildStoragePath(VID, "registration", UID, "cà vẹt.pdf").split("/")).toHaveLength(3);
  });
});

describe("Quyền thêm tệp theo vai trò (giao diện; database mới là nơi chặn thật)", () => {
  it("sales/kỹ thuật chỉ thêm ảnh và video; quản lý/kế toán thêm cả giấy tờ", () => {
    expect(allowedCategories(["sales"])).toEqual(["photo", "video"]);
    expect(allowedCategories(["technician"])).toEqual(["photo", "video"]);
    expect(allowedCategories(["accountant"])).toContain("registration");
    expect(allowedCategories(["manager"])).toHaveLength(6);
    expect(allowedCategories([])).toEqual([]);
  });
  it("nhận diện nhóm giấy tờ", () => {
    expect(isDocumentCategory("consignment")).toBe(true);
    expect(isDocumentCategory("photo")).toBe(false);
  });
});
