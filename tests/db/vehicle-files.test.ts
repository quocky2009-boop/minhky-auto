/**
 * Chặng 3: ảnh / video / giấy tờ gắn với xe. Chạy SQL dưới vai trò `authenticated` của từng người.
 * Media (ảnh, video): ai thấy xe thì thấy. Giấy tờ: chỉ quản lý/kế toán. Không xóa tệp, chỉ lưu trữ có lý do.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;

d("Tệp gắn với xe — database thật", () => {
  let sys: Client, c: Client, c2: Client;
  let manager: string, accountant: string, sales: string, tech: string;
  let listed: string, hidden: string;   // listed: đang bán (sales thấy); hidden: chưa chào bán (sales không thấy)

  beforeAll(async () => {
    sys = await connect(); c = await connect(); c2 = await connect();
    manager = await createUser(sys, "QL Tệp", ["manager"]);
    accountant = await createUser(sys, "KT Tệp", ["accountant"]);
    sales = await createUser(sys, "Sales Tệp", ["sales"]);
    tech = await createUser(sys, "KTV Tệp", ["technician"]);
    const mk = () => as(c, manager, async (db) => (await db.query("select public.create_vehicle($1::jsonb) id", [JSON.stringify({
      request_id: uuid(), condition: "used", make: "Mazda", model: "CX-5", business_type: "owned", year_made: "2021" })])).rows[0].id as string);
    listed = await mk(); hidden = await mk();
    await as(c, manager, async (db) => {
      const v = (await db.query("select version from public.vehicles where id = $1", [listed])).rows[0].version;
      return db.query("select public.update_vehicle($1, $2, '{\"sale_status\":\"available\"}'::jsonb)", [listed, v]);
    });
  });
  afterAll(async () => { await sys.end(); await c.end(); await c2.end(); });

  const path = (vehicle: string, category: string) => `${vehicle}/${category}/${uuid()}-anh.jpg`;
  const putObject = (user: string, name: string) => as(c, user, (db) => db.query("insert into storage.objects (bucket_id, name) values ('vehicle-files', $1)", [name]));
  const seeObject = (user: string, name: string) => as(c, user, async (db) => (await db.query("select 1 from storage.objects where bucket_id = 'vehicle-files' and name = $1", [name])).rowCount);
  const register = (user: string, vehicle: string, category: string, name: string, extra: Record<string, unknown> = {}, client: Client = c) =>
    as(client, user, async (db) => (await db.query("select public.register_vehicle_file($1::jsonb) id", [JSON.stringify({
      request_id: uuid(), vehicle_id: vehicle, category, storage_path: name, file_name: "anh.jpg", mime_type: "image/jpeg", size_bytes: 12345, ...extra })])).rows[0].id as string);
  const upload = async (user: string, vehicle: string, category: string, extra: Record<string, unknown> = {}) => {
    const name = path(vehicle, category);
    await putObject(user, name);
    return { name, id: await register(user, vehicle, category, name, extra) };
  };

  it("Ảnh/video: quản lý, kế toán, kỹ thuật tải lên được; sales chỉ với xe mình thấy được", async () => {
    for (const u of [manager, accountant, tech]) await upload(u, listed, "photo");
    await upload(sales, listed, "photo");
    await upload(manager, listed, "video", { mime_type: "video/mp4", file_name: "quay.mp4" });
    // xe chưa chào bán: sales không thấy xe nên không thêm/xem được tệp
    await expect(putObject(sales, path(hidden, "photo"))).rejects.toThrow(/row-level security/);
    const hiddenPhoto = await upload(manager, hidden, "photo");
    expect(await seeObject(sales, hiddenPhoto.name)).toBe(0);
    expect(await as(c, sales, async (db) => (await db.query("select count(*)::int n from public.vehicle_files where vehicle_id = $1", [hidden])).rows[0].n)).toBe(0);
    expect(await seeObject(tech, hiddenPhoto.name)).toBe(1);   // kỹ thuật thấy xe chưa bán
  });

  it("Giấy tờ (cà vẹt, biên bản, scan hợp đồng): chỉ quản lý/kế toán; sales và kỹ thuật không thấy, không tải lên, không đọc bằng đường dẫn trực tiếp", async () => {
    const reg = await upload(manager, listed, "registration", { mime_type: "application/pdf", file_name: "cavet.pdf" });
    const con = await upload(accountant, listed, "consignment", { mime_type: "application/pdf", file_name: "hop-dong.pdf" });
    for (const u of [sales, tech]) {
      expect(await seeObject(u, reg.name)).toBe(0);
      expect(await seeObject(u, con.name)).toBe(0);
      expect(await as(c, u, async (db) => (await db.query("select count(*)::int n from public.vehicle_files where category in ('registration','consignment')")).rows[0].n)).toBe(0);
      await expect(putObject(u, path(listed, "registration"))).rejects.toThrow(/row-level security/);
      await expect(register(u, listed, "inspection", reg.name)).rejects.toThrow(/Đường dẫn tệp không khớp|không có quyền|row-level security/);
    }
    expect(await seeObject(accountant, reg.name)).toBe(1);
    // người không đăng nhập bị chặn
    await expect(as(c, null, (db) => db.query("select count(*) from public.vehicle_files"))).rejects.toThrow(/permission denied/);
  });

  it("Đường dẫn Storage phải đúng dạng <xe>/<loại>/<tệp>; sai dạng bị chặn kể cả với quản lý", async () => {
    for (const bad of [`${listed}/${uuid()}.jpg`, `${listed}/photo/sub/${uuid()}.jpg`, `khong-phai-uuid/photo/x.jpg`, `${listed}/loai-la/x.jpg`, `${uuid()}/photo/x.jpg`, "x.jpg"]) {
      await expect(putObject(manager, bad)).rejects.toThrow(/row-level security/);
    }
  });

  it("Ghi tệp: phải có tệp thật trong Storage, đường dẫn khớp xe + loại, đúng loại tệp; gửi lặp không sinh trùng", async () => {
    const name = path(listed, "photo");
    await expect(register(manager, listed, "photo", name)).rejects.toThrow(/Chưa thấy tệp trong kho lưu trữ/);
    await putObject(manager, name);
    await expect(register(manager, listed, "photo", name, { category: "video" })).rejects.toThrow(/Đường dẫn tệp không khớp/);
    await expect(register(manager, hidden, "photo", name)).rejects.toThrow(/Đường dẫn tệp không khớp/);
    await expect(register(manager, listed, "photo", name, { mime_type: "application/pdf" })).rejects.toThrow(/Ảnh phải là tệp ảnh/);
    await expect(register(manager, listed, "photo", name, { size_bytes: 0 })).rejects.toThrow(/size_bytes/);
    const req = uuid();
    const [a, b] = await Promise.all([register(manager, listed, "photo", name, { request_id: req }), register(manager, listed, "photo", name, { request_id: req }, c2)]);
    expect(a).toBe(b);
    // cùng đường dẫn nhưng request khác → trả lại bản ghi cũ, không tạo thêm
    expect(await register(manager, listed, "photo", name)).toBe(a);
    expect((await sys.query("select count(*)::int n from public.vehicle_files where storage_path = $1", [name])).rows[0].n).toBe(1);
    const vid = path(listed, "video"); await putObject(manager, vid);
    await expect(register(manager, listed, "video", vid, { mime_type: "image/png" })).rejects.toThrow(/Video phải là tệp video/);
    const doc = path(listed, "inspection"); await putObject(manager, doc);
    await expect(register(manager, listed, "inspection", doc, { mime_type: "video/mp4" })).rejects.toThrow(/Giấy tờ chỉ nhận ảnh chụp hoặc PDF/);
  });

  it("Không xóa, không đổi tệp; chỉ quản lý được lưu trữ (có lý do); người tải lên do database ghi, không giả mạo", async () => {
    const f = await upload(tech, listed, "photo");
    expect((await sys.query("select uploaded_by from public.vehicle_files where id = $1", [f.id])).rows[0].uploaded_by).toBe(tech);
    await expect(as(c, manager, (db) => db.query("delete from public.vehicle_files where id = $1", [f.id]))).rejects.toThrow(/permission denied/);
    await expect(as(c, manager, (db) => db.query("delete from storage.objects where name = $1", [f.name]))).resolves.toBeTruthy();   // không có policy xóa → 0 dòng
    expect(await seeObject(manager, f.name)).toBe(1);
    await expect(as(c, manager, (db) => db.query("update public.vehicle_files set storage_path = 'x', file_name = 'y' where id = $1", [f.id]))).rejects.toThrow(/Không đổi thông tin tệp|vehicle_files_path_prefix/);
    // kỹ thuật/sales không lưu trữ được
    for (const u of [tech, sales, accountant]) {
      await expect(as(c, u, (db) => db.query("select public.archive_vehicle_file($1, 'thử')", [f.id]))).rejects.toThrow(/không có quyền|Không tìm thấy/);
    }
    await expect(as(c, manager, (db) => db.query("select public.archive_vehicle_file($1, '  ')", [f.id]))).rejects.toThrow(/lý do/);
    await as(c, manager, (db) => db.query("select public.archive_vehicle_file($1, 'Ảnh chụp nhầm xe')", [f.id]));
    const row = (await sys.query("select archived_by, archived_at is not null as at, archive_reason from public.vehicle_files where id = $1", [f.id])).rows[0];
    expect(row).toMatchObject({ archived_by: manager, at: true, archive_reason: "Ảnh chụp nhầm xe" });
    expect(await seeObject(manager, f.name)).toBe(1);   // tệp gốc vẫn còn trong Storage
    await expect(as(c, manager, (db) => db.query("select public.archive_vehicle_file($1, 'lại')", [f.id]))).rejects.toThrow(/Không tìm thấy tệp đang dùng/);
    await expect(as(c, manager, (db) => db.query("update public.vehicle_files set caption = 'sửa' where id = $1", [f.id]))).rejects.toThrow(/đã lưu trữ, không sửa/);
  });
});
