/**
 * Chặng 3 (lát 3): chi phí chuẩn bị xe — dự kiến / đã xác nhận / đã thanh toán là ba thông tin khác nhau.
 * Chạy SQL dưới vai trò `authenticated` của từng người (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;

d("Chi phí chuẩn bị xe — chặng 3 lát 3 (database thật)", () => {
  let sys: Client, c: Client, c2: Client;
  let manager: string, accountant: string, sales: string, tech: string;
  let owned: string, consign: string;

  beforeAll(async () => {
    sys = await connect(); c = await connect(); c2 = await connect();
    manager = await createUser(sys, "QL Chi phí", ["manager"]);
    accountant = await createUser(sys, "KT Chi phí", ["accountant"]);
    sales = await createUser(sys, "Sales Chi phí", ["sales"]);
    tech = await createUser(sys, "KTV Chi phí", ["technician"]);
    const mk = (p: Record<string, unknown>) => as(c, manager, async (db) => (await db.query("select public.create_vehicle($1::jsonb) id", [JSON.stringify({ request_id: uuid(), condition: "used", ...p })])).rows[0].id as string);
    owned = await mk({ make: "Toyota", model: "Camry", business_type: "owned", year_made: "2019" });
    consign = await mk({ make: "Honda", model: "Accord", business_type: "consignment", source_type: "individual" });
  });
  afterAll(async () => { await sys.end(); await c.end(); await c2.end(); });

  const ver = async (id: string) => (await sys.query("select version from public.vehicle_costs where id = $1", [id])).rows[0].version as number;
  const createCost = (user: string, vehicle: string, p: Record<string, unknown> = {}) =>
    as(c, user, async (db) => (await db.query("select public.create_vehicle_cost($1::jsonb) id", [JSON.stringify({
      request_id: uuid(), vehicle_id: vehicle, category: "repair", description: "Sơn cản trước", estimated_amount: "5000000", ...p })])).rows[0].id as string);
  const approve = (user: string, id: string) => as(c, user, async (db) => db.query("select public.approve_vehicle_cost($1, $2, true)", [id, await ver(id)]));
  const confirm = (user: string, id: string, amount: string, note = "") =>
    as(c, user, async (db) => db.query("select public.confirm_vehicle_cost($1, $2, $3::jsonb)", [id, await ver(id), JSON.stringify({ confirmed_amount: amount, accepted_note: note })]));
  const voidCost = (user: string, id: string, reason = "Làm sai hạng mục") => as(c, user, async (db) => db.query("select public.void_vehicle_cost($1, $2, $3)", [id, await ver(id), reason]));
  const pay = (user: string, cost: string, amount: string, extra: Record<string, unknown> = {}, client: Client = c) =>
    as(client, user, async (db) => (await db.query("select public.record_cost_payment($1::jsonb) id", [JSON.stringify({ request_id: uuid(), cost_id: cost, amount, ...extra })])).rows[0].id as string);
  const summary = async (user: string, vehicle: string) =>
    as(c, user, async (db) => (await db.query(
      `select line_count::int, open_lines::int, open_lines_no_estimate::int, estimated_showroom::text es, estimated_owner::text eo,
              confirmed_showroom::text cs, confirmed_owner::text co, paid_showroom::text ps, paid_owner::text po
       from public.vehicle_cost_summary where vehicle_id = $1`, [vehicle])).rows[0]);

  it("Phân quyền: chỉ quản lý/kế toán thấy chi phí; sales và kỹ thuật không thấy, không ghi được; anon bị chặn", async () => {
    const id = await createCost(manager, owned);
    const pid = await (async () => { await confirm(manager, id, "4500000"); return pay(manager, id, "1000000"); })();
    expect(await as(c, accountant, async (db) => (await db.query("select count(*)::int n from public.vehicle_costs where id = $1", [id])).rows[0].n)).toBe(1);
    expect(await as(c, accountant, async (db) => (await db.query("select count(*)::int n from public.vehicle_cost_payments where id = $1", [pid])).rows[0].n)).toBe(1);
    for (const u of [sales, tech]) {
      const seen = await as(c, u, async (db) => ({
        costs: (await db.query("select count(*)::int n from public.vehicle_costs")).rows[0].n,
        pays: (await db.query("select count(*)::int n from public.vehicle_cost_payments")).rows[0].n,
        sum: (await db.query("select count(*)::int n from public.vehicle_cost_summary")).rows[0].n,
      }));
      expect(seen).toEqual({ costs: 0, pays: 0, sum: 0 });
      await expect(createCost(u, owned)).rejects.toThrow(/không có quyền ghi chi phí|row-level security/);
      await expect(pay(u, id, "100000")).rejects.toThrow(/row-level security|không có quyền|Không tìm thấy/);
    }
    await expect(as(c, null, (db) => db.query("select count(*) from public.vehicle_costs"))).rejects.toThrow(/permission denied/);
    await expect(sys.query("update public.vehicle_cost_payments set amount = 1 where id = $1", [pid])).rejects.toThrow(/không sửa trực tiếp/);
    await expect(as(c, manager, (db) => db.query("delete from public.vehicle_costs where id = $1", [id]))).rejects.toThrow(/permission denied/);
  });

  it("Ba thông tin tách biệt: dự kiến (chưa xác nhận) ≠ đã xác nhận ≠ đã thanh toán; không cộng dồn", async () => {
    const v = await as(c, manager, async (db) => (await db.query("select public.create_vehicle($1::jsonb) id", [JSON.stringify({ request_id: uuid(), make: "Mazda", model: "3", condition: "used", business_type: "owned" })])).rows[0].id as string);
    const a = await createCost(manager, v, { description: "Sơn", estimated_amount: "5000000" });
    const b = await createCost(manager, v, { category: "detailing", description: "Spa nội thất", estimated_amount: "2000000" });
    let s = await summary(manager, v);
    expect(s).toMatchObject({ line_count: 2, open_lines: 2, es: "7000000", cs: null, ps: null });   // chưa có gì xác nhận/thanh toán -> null, không phải 0
    await confirm(manager, a, "4500000", "Đã nghiệm thu, xe sơn đẹp");
    await pay(manager, a, "1500000");
    await pay(accountant, a, "500000", { method: "transfer", reference: "CK 0912" });
    s = await summary(manager, v);
    expect(s).toMatchObject({ line_count: 2, open_lines: 1, es: "2000000", cs: "4500000", ps: "2000000" });   // dự toán 5tr của khoản đã xác nhận KHÔNG còn tính vào "dự kiến"
    expect(b).toBeTruthy();
  });

  it("Kế toán tạo, xác nhận số thực tế và ghi thanh toán được; chỉ quản lý duyệt/sửa dự toán/hủy", async () => {
    const id = await createCost(accountant, owned, { description: "Đánh bóng", estimated_amount: "1000000" });
    await expect(approve(accountant, id)).rejects.toThrow(/Chỉ quản lý được duyệt dự toán/);
    await expect(as(c, accountant, async (db) => db.query("select public.update_vehicle_cost($1, $2, $3::jsonb)", [id, await ver(id), JSON.stringify({ estimated_amount: "9000000" })])))
      .rejects.toThrow(/Chỉ quản lý được sửa dự toán/);
    await approve(manager, id);
    expect((await sys.query("select approved_by from public.vehicle_costs where id = $1", [id])).rows[0].approved_by).toBe(manager);
    await confirm(accountant, id, "900000");
    await pay(accountant, id, "900000");
    await expect(voidCost(accountant, id)).rejects.toThrow(/Chỉ quản lý được hủy/);
  });

  it("Đổi dự toán sau khi duyệt thì phải duyệt lại", async () => {
    const id = await createCost(manager, owned, { estimated_amount: "3000000" });
    await approve(manager, id);
    expect((await sys.query("select approved_at from public.vehicle_costs where id = $1", [id])).rows[0].approved_at).not.toBeNull();
    await as(c, manager, async (db) => db.query("select public.update_vehicle_cost($1, $2, $3::jsonb)", [id, await ver(id), JSON.stringify({ estimated_amount: "3500000" })]));
    expect((await sys.query("select approved_at, approved_by from public.vehicle_costs where id = $1", [id])).rows[0]).toEqual({ approved_at: null, approved_by: null });
    // duyệt khi chưa có dự toán bị chặn
    const none = await createCost(manager, owned, { estimated_amount: "" });
    await expect(approve(manager, none)).rejects.toThrow(/Chưa có dự toán để duyệt/);
  });

  it("Thanh toán: chỉ cho khoản đã xác nhận, không vượt số đã xác nhận, số tiền phải > 0", async () => {
    const id = await createCost(manager, owned, { estimated_amount: "2000000" });
    await expect(pay(manager, id, "100000")).rejects.toThrow(/chỉ ghi thanh toán cho khoản chi phí đã xác nhận|Chỉ ghi thanh toán/i);
    await confirm(manager, id, "1800000");
    await expect(pay(manager, id, "0")).rejects.toThrow(/check|amount|violates/i);
    await pay(manager, id, "1000000");
    await expect(pay(manager, id, "900000")).rejects.toThrow(/vượt chi phí đã xác nhận/);
    await pay(manager, id, "800000");   // vừa đủ
    await expect(pay(manager, id, "1")).rejects.toThrow(/vượt chi phí đã xác nhận/);
  });

  it("Hai người ghi thanh toán cùng lúc không thể cùng vượt hạn mức (khóa dòng)", async () => {
    const id = await createCost(manager, owned, { estimated_amount: "100000" });
    await confirm(manager, id, "100000");
    const results = await Promise.allSettled([pay(manager, id, "60000", {}, c), pay(accountant, id, "60000", {}, c2)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const total = (await sys.query("select coalesce(sum(amount),0)::text t from public.vehicle_cost_payments where cost_id = $1 and status = 'posted'", [id])).rows[0].t;
    expect(total).toBe("60000");
  });

  it("Chứng từ không sửa/xóa: khoản đã xác nhận phải hủy rồi tạo khoản thay thế; hủy cần lý do và không còn thanh toán", async () => {
    const id = await createCost(manager, owned, { description: "Thay lốp", estimated_amount: "8000000" });
    await confirm(manager, id, "7600000");
    await expect(as(c, manager, async (db) => db.query("select public.update_vehicle_cost($1, $2, $3::jsonb)", [id, await ver(id), JSON.stringify({ estimated_amount: "1" })])))
      .rejects.toThrow(/Chi phí đã xác nhận không sửa trực tiếp/);
    const p1 = await pay(manager, id, "3000000");
    await expect(voidCost(manager, id, "")).rejects.toThrow(/Ghi lý do hủy/);
    await expect(voidCost(manager, id)).rejects.toThrow(/đã có thanh toán/);
    await expect(as(c, manager, (db) => db.query("select public.void_cost_payment($1, '')", [p1]))).rejects.toThrow(/Ghi lý do hủy thanh toán/);
    await as(c, manager, (db) => db.query("select public.void_cost_payment($1, 'Chuyển nhầm tài khoản')", [p1]));
    const paid = (await sys.query("select coalesce(sum(amount),0)::text t from public.vehicle_cost_payments where cost_id = $1 and status = 'posted'", [id])).rows[0].t;
    expect(paid).toBe("0");                                         // thanh toán đã hủy không tính
    await expect(as(c, manager, (db) => db.query("select public.void_cost_payment($1, 'lần 2')", [p1]))).rejects.toThrow(/Không tìm thấy thanh toán đang hiệu lực/);
    await voidCost(manager, id);
    const repl = await createCost(manager, owned, { description: "Thay lốp (thay thế)", estimated_amount: "7600000", replaces_cost_id: id });
    expect((await sys.query("select replaces_cost_id from public.vehicle_costs where id = $1", [repl])).rows[0].replaces_cost_id).toBe(id);
    await expect(createCost(manager, owned, { replaces_cost_id: repl })).rejects.toThrow(/phải là khoản đã hủy của cùng xe/);
    await expect(voidCost(manager, id)).rejects.toThrow(/đã hủy, không sửa/);
    // khoản đã hủy không tính vào tổng
    const v = await as(c, manager, async (db) => (await db.query("select public.create_vehicle($1::jsonb) id", [JSON.stringify({ request_id: uuid(), make: "Kia", model: "K3", condition: "used", business_type: "owned" })])).rows[0].id as string);
    const x = await createCost(manager, v, { estimated_amount: "1000000" });
    await voidCost(manager, x);
    expect(await summary(manager, v)).toMatchObject({ line_count: 0, es: null });
  });

  it("Thiếu số liệu là 'chưa rõ', không phải 0: khoản chưa có dự toán được đếm riêng", async () => {
    const v = await as(c, manager, async (db) => (await db.query("select public.create_vehicle($1::jsonb) id", [JSON.stringify({ request_id: uuid(), make: "Ford", model: "Focus", condition: "used", business_type: "owned" })])).rows[0].id as string);
    await createCost(manager, v, { estimated_amount: "" });
    expect(await summary(manager, v)).toMatchObject({ line_count: 1, open_lines: 1, open_lines_no_estimate: 1, es: null, cs: null });
    await expect(confirm(manager, await createCost(manager, v), "")).rejects.toThrow(/Nhập số tiền thực tế/);
  });

  it("Xe ký gửi bắt buộc nêu bên chịu chi phí; chi phí chủ xe chịu tách khỏi phần showroom; xe sở hữu không có chi phí 'chủ xe chịu'", async () => {
    await expect(createCost(manager, consign)).rejects.toThrow(/chọn bên chịu chi phí/);
    await expect(createCost(manager, owned, { borne_by: "owner" })).rejects.toThrow(/Xe showroom sở hữu: chi phí do showroom chịu/);
    const own = await createCost(manager, consign, { borne_by: "owner", description: "Sửa điều hòa", estimated_amount: "3000000" });
    const shw = await createCost(manager, consign, { borne_by: "showroom", description: "Rửa xe", estimated_amount: "300000" });
    await confirm(manager, own, "2800000"); await confirm(manager, shw, "250000");
    await pay(manager, own, "1000000");
    expect(await summary(manager, consign)).toMatchObject({ co: "2800000", cs: "250000", po: "1000000", ps: null });
  });

  it("Chống lặp khi bấm nhiều lần / thử lại: cùng mã yêu cầu chỉ tạo một khoản và một lần thanh toán", async () => {
    const request_id = uuid();
    const once = () => as(c, manager, async (db) => (await db.query("select public.create_vehicle_cost($1::jsonb) id", [JSON.stringify({ request_id, vehicle_id: owned, category: "other", description: "Phí sang tên", estimated_amount: "500000" })])).rows[0].id as string);
    const id1 = await once(), id2 = await once();
    expect(id2).toBe(id1);
    expect((await sys.query("select count(*)::int n from public.vehicle_costs where client_request_id = $1", [request_id])).rows[0].n).toBe(1);
    await confirm(manager, id1, "500000");
    const prequest = uuid();
    const payOnce = () => as(c, manager, async (db) => (await db.query("select public.record_cost_payment($1::jsonb) id", [JSON.stringify({ request_id: prequest, cost_id: id1, amount: "500000" })])).rows[0].id as string);
    expect(await payOnce()).toBe(await payOnce());
    expect((await sys.query("select count(*)::int n from public.vehicle_cost_payments where client_request_id = $1", [prequest])).rows[0].n).toBe(1);
  });

  it("Chống ghi đè đồng thời khi sửa dự toán", async () => {
    const id = await createCost(manager, owned, { estimated_amount: "1000000" });
    const v0 = await ver(id);
    await as(c, manager, (db) => db.query("select public.update_vehicle_cost($1, $2, $3::jsonb)", [id, v0, JSON.stringify({ description: "Sửa lần 1" })]));
    await expect(as(c, manager, (db) => db.query("select public.update_vehicle_cost($1, $2, $3::jsonb)", [id, v0, JSON.stringify({ description: "Sửa lần 2" })])))
      .rejects.toThrow(/vừa được người khác cập nhật/);
  });

  it("Không giả mạo người xác nhận / người chi / người hủy: database tự điền bằng người đang đăng nhập", async () => {
    const id = await createCost(accountant, owned, { description: "Chống giả mạo", estimated_amount: "700000" });
    // kế toán cố ghi người xác nhận là quản lý bằng SQL trực tiếp
    await as(c, accountant, (db) => db.query("update public.vehicle_costs set status = 'confirmed', confirmed_amount = 650000, confirmed_by = $2, confirmed_at = '2020-01-01' where id = $1", [id, manager]));
    const row = (await sys.query("select confirmed_by, confirmed_at > now() - interval '1 minute' as fresh, created_by from public.vehicle_costs where id = $1", [id])).rows[0];
    expect(row).toEqual({ confirmed_by: accountant, fresh: true, created_by: accountant });
    const pid = await as(c, accountant, async (db) => (await db.query("insert into public.vehicle_cost_payments (cost_id, amount, paid_by) values ($1, 100000, $2) returning id", [id, manager])).rows[0].id as string);
    expect((await sys.query("select paid_by from public.vehicle_cost_payments where id = $1", [pid])).rows[0].paid_by).toBe(accountant);
  });
});
