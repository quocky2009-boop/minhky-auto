/**
 * Test database thật (RLS, constraint, RPC). Chạy khi có TEST_DATABASE_URL trỏ tới database đã áp migrations
 * (scripts/db-local-reset.sh). Gọi SQL trực tiếp với role authenticated = tương đương gọi Data API, không qua UI.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;

d("Nhu cầu mua/bán — database", () => {
  let sys: Client, cA: Client, cB: Client;
  let manager: string, salesA: string, salesB: string, tech: string, accountant: string;

  const newDemand = (c: Client, user: string, payload: Record<string, unknown>) =>
    as(c, user, async (db) => (await db.query("select public.create_demand($1::jsonb) as id", [JSON.stringify(payload)])).rows[0].id as string);

  beforeAll(async () => {
    sys = await connect(); cA = await connect(); cB = await connect();
    await createUser(sys, "Admin", ["admin"]); // có mặt admin để kiểm tra không ảnh hưởng quyền người khác
    manager = await createUser(sys, "Quản lý", ["manager"]);
    salesA = await createUser(sys, "Sales A", ["sales"]);
    salesB = await createUser(sys, "Sales B", ["sales"]);
    tech = await createUser(sys, "Kỹ thuật", ["technician"]);
    accountant = await createUser(sys, "Kế toán", ["accountant"]);
  });
  afterAll(async () => { await Promise.all([sys, cA, cB].map((c) => c.end())); });

  it("§12.1 một khách vừa có nhu cầu mua vừa có nhu cầu bán, không tạo trùng khách", async () => {
    const buyId = await newDemand(cA, salesA, {
      request_id: uuid(), kind: "buy", customer: { full_name: "Nguyễn Văn Bình", phone: "0912 000 111" },
      options: [{ make: "VinFast", model: "VF 8" }], budget_min: "600000000", budget_max: "700000000",
    });
    // Nhân viên gõ SĐT theo cách khác -> hệ thống tìm ra khách cũ
    const dup = await as(cA, salesA, async (db) => (await db.query("select * from public.find_customers_by_phone('+84 912-000-111')")).rows);
    expect(dup).toHaveLength(1);
    const sellId = await newDemand(cA, salesA, {
      request_id: uuid(), kind: "sell", customer_id: dup[0].customer_id,
      sell_offer: { make: "vinfast", model: "vf 8", year_made: "2022", asking_price: "620000000", sale_mode: "trade_in" },
    });
    const rows = await as(cA, salesA, async (db) => (await db.query(
      "select kind, customer_id from public.demands where id = any($1::uuid[]) order by kind", [[buyId, sellId]])).rows);
    expect(rows.map((r) => r.kind)).toEqual(["buy", "sell"]);
    expect(rows[0].customer_id).toBe(rows[1].customer_id);
    const cnt = (await sys.query("select count(*)::int n from public.customers where phone_normalized = '0912000111'")).rows[0].n;
    expect(cnt).toBe(1);
    // Danh mục không bị tạo trùng do khác hoa/thường/khoảng trắng
    const makes = (await sys.query("select count(*)::int n from public.vehicle_makes where private.norm_text(name) = 'vinfast'")).rows[0].n;
    expect(makes).toBe(1);
  });

  it("Gửi lại cùng một yêu cầu (bấm 2 lần / retry) không tạo bản ghi trùng — kể cả chạy song song", async () => {
    const req = uuid();
    const payload = { request_id: req, kind: "buy", customer: { full_name: "Khách Retry", phone: "0988777666" }, options: [{ make: "MG", model: "MG5" }] };
    const [x, y] = await Promise.all([newDemand(cA, salesA, payload), newDemand(cB, salesA, payload)]);
    expect(x).toBe(y);
    const again = await newDemand(cA, salesA, payload);
    expect(again).toBe(x);
    const n = (await sys.query("select (select count(*) from public.demands where client_request_id = $1)::int d, (select count(*) from public.customers where phone_normalized = '0988777666')::int c", [req])).rows[0];
    expect(n).toEqual({ d: 1, c: 1 });
  });

  it("§12.3 đang xử lý thì bắt buộc có việc tiếp theo + hạn; nhu cầu luôn có người phụ trách", async () => {
    const id = await newDemand(cA, salesA, { request_id: uuid(), kind: "buy", customer: { full_name: "Khách C" } });
    // Chuyển sang "Đã xác minh" mà không hẹn việc tiếp theo -> bị chặn
    await expect(as(cA, salesA, (db) => db.query("update public.demands set status = 'verified' where id = $1", [id])))
      .rejects.toThrow(/demands_next_action_required/);
    // Ghi nhật ký kèm việc tiếp theo + chuyển trạng thái -> được
    await as(cA, salesA, (db) => db.query(
      "select public.log_demand_activity($1, $2, 'call', 'Đã gọi, khách xác nhận cần mua', null, 'Gửi ảnh xe', now() - interval '1 hour', 'verified')",
      [id, uuid()]));
    const row = (await sys.query("select status, next_action, verified_at is not null v, last_contact_at is not null c from public.demands where id = $1", [id])).rows[0];
    expect(row).toMatchObject({ status: "verified", next_action: "Gửi ảnh xe", v: true, c: true });
    // Quá hạn: xuất hiện trong danh sách quá hạn
    const overdue = await as(cA, salesA, async (db) => (await db.query(
      "select id from public.demands where next_action_due < now() and status not in ('closed','won','acquired','paused')")).rows.map((r) => r.id));
    expect(overdue).toContain(id);
    // Không thể bỏ trống người phụ trách khi nhu cầu còn hoạt động
    await expect(sys.query("update public.demands set owner_id = null where id = $1", [id])).rejects.toThrow(/demands_owner_required/);
    // Việc tiếp theo phải có hạn đi kèm
    await expect(as(cA, salesA, (db) => db.query(
      "select public.log_demand_activity($1, $2, 'call', 'abc', null, 'Gọi lại', null)", [id, uuid()]))).rejects.toThrow(/đi cùng nhau/);
  });

  it("Đóng nhu cầu phải có lý do; sales không tự mở lại, quản lý mở lại về bước xác minh", async () => {
    const id = await newDemand(cA, salesA, { request_id: uuid(), kind: "sell", customer: { full_name: "Khách D" }, sell_offer: { make: "Toyota", model: "Vios" } });
    await expect(as(cA, salesA, (db) => db.query("update public.demands set status = 'closed' where id = $1", [id])))
      .rejects.toThrow(/demands_close_reason/);
    await as(cA, salesA, (db) => db.query("select public.log_demand_activity($1, $2, 'call', 'Khách đã bán nơi khác', null, null, null, 'closed', 'Đã bán cho bên khác')", [id, uuid()]));
    await expect(as(cA, salesA, (db) => db.query("update public.demands set status = 'new' where id = $1", [id])))
      .rejects.toThrow(/Chỉ quản lý được mở lại/);
    await as(cA, manager, (db) => db.query("update public.demands set status = 'new' where id = $1", [id]));
    const r = (await sys.query("select status, closed_reason from public.demands where id = $1", [id])).rows[0];
    expect(r).toEqual({ status: "new", closed_reason: null });
  });

  it("Chuyển trạng thái sai luồng bị chặn ở database", async () => {
    const id = await newDemand(cA, salesA, { request_id: uuid(), kind: "buy", customer: { full_name: "Khách E" } });
    await expect(as(cA, salesA, (db) => db.query("update public.demands set status = 'won' where id = $1", [id])))
      .rejects.toThrow(/Không thể chuyển trạng thái/);
    await expect(as(cA, salesA, (db) => db.query("update public.demands set status = 'acquired' where id = $1", [id])))
      .rejects.toThrow(/demands_status_valid|Không thể chuyển/);
  });

  it("§12.11 sales không đọc được nhu cầu/khách của sales khác qua truy vấn trực tiếp", async () => {
    const id = await newDemand(cA, salesA, { request_id: uuid(), kind: "buy", customer: { full_name: "Khách riêng của A", phone: "0901234567", address: "12 Phố X" } });
    const seenByB = await as(cB, salesB, async (db) => (await db.query("select id from public.demands where id = $1", [id])).rowCount);
    expect(seenByB).toBe(0);
    const custByB = await as(cB, salesB, async (db) => (await db.query("select id from public.customers where phone_normalized = '0901234567'")).rowCount);
    expect(custByB).toBe(0);
    const actsByB = await as(cB, salesB, async (db) => (await db.query("select id from public.demand_activities where demand_id = $1", [id])).rowCount);
    expect(actsByB).toBe(0);
    // B không sửa được (0 dòng), không ghi nhật ký được
    const upd = await as(cB, salesB, async (db) => (await db.query("update public.demands set notes = 'x' where id = $1", [id])).rowCount);
    expect(upd).toBe(0);
    await expect(as(cB, salesB, (db) => db.query("insert into public.demand_activities (demand_id, content) values ($1, 'x')", [id])))
      .rejects.toThrow(/row-level security/);
    // B thấy khách đã tồn tại khi kiểm tra trùng SĐT nhưng chỉ tên rút gọn, không mở được hồ sơ
    const dup = await as(cB, salesB, async (db) => (await db.query("select * from public.find_customers_by_phone('0901234567')")).rows);
    expect(dup).toHaveLength(1);
    expect(dup[0].display_name).toBe("…A");
    expect(dup[0].can_open).toBe(false);
    expect(Object.keys(dup[0])).not.toContain("address");
    // Kỹ thuật và kế toán không đọc được nhu cầu
    for (const u of [tech, accountant]) {
      const n = await as(cB, u, async (db) => (await db.query("select count(*)::int n from public.demands")).rows[0].n);
      expect(n).toBe(0);
    }
    // Quản lý thấy
    expect(await as(cB, manager, async (db) => (await db.query("select id from public.demands where id = $1", [id])).rowCount)).toBe(1);
  });

  it("Sales không tự đổi người phụ trách; quản lý đổi được và có audit log", async () => {
    const id = await newDemand(cA, salesA, { request_id: uuid(), kind: "buy", customer: { full_name: "Khách F" } });
    await expect(as(cA, salesA, (db) => db.query("update public.demands set owner_id = $2 where id = $1", [id, salesB])))
      .rejects.toThrow(/Chỉ quản lý được đổi người phụ trách/);
    await as(cA, manager, (db) => db.query("update public.demands set owner_id = $2 where id = $1", [id, salesB]));
    const log = (await sys.query("select actor_id, changed_fields from public.audit_logs where table_name = 'demands' and record_id = $1 and action = 'UPDATE' order by id desc limit 1", [id])).rows[0];
    expect(log.actor_id).toBe(manager);
    expect(log.changed_fields).toContain("owner_id");
    // Sales không đọc/sửa được audit log
    expect(await as(cA, salesA, async (db) => (await db.query("select * from public.audit_logs")).rowCount)).toBe(0);
    await expect(as(cA, salesA, (db) => db.query("delete from public.audit_logs"))).rejects.toThrow(/permission denied/);
    // Nhật ký liên hệ không sửa/xóa được
    await expect(as(cA, salesA, (db) => db.query("update public.demand_activities set content = 'sửa' "))).rejects.toThrow(/permission denied/);
  });

  it("Nhu cầu được chia sẻ: người được chia sẻ xem và ghi nhật ký, nhưng không sửa tiêu chí", async () => {
    const id = await newDemand(cA, salesA, { request_id: uuid(), kind: "buy", customer: { full_name: "Khách G" } });
    await as(cA, salesA, (db) => db.query("insert into public.demand_shares (demand_id, user_id) values ($1, $2)", [id, salesB]));
    expect(await as(cB, salesB, async (db) => (await db.query("select id from public.demands where id = $1", [id])).rowCount)).toBe(1);
    await as(cB, salesB, (db) => db.query("select public.log_demand_activity($1, $2, 'zalo', 'Đã gửi ảnh xe giúp A')", [id, uuid()]));
    expect(await as(cB, salesB, async (db) => (await db.query("update public.demands set budget_max = 1 where id = $1", [id])).rowCount)).toBe(0);
  });

  it("Nguồn ghép không làm lộ thông tin liên hệ khách", async () => {
    const pool = await as(cB, salesB, async (db) => (await db.query("select * from public.match_pool_sell_offers()")).rows);
    expect(pool.length).toBeGreaterThan(0);
    for (const r of pool) {
      expect(Object.keys(r)).not.toEqual(expect.arrayContaining(["phone", "customer_id", "address", "plate", "vin"]));
    }
    const notMine = pool.filter((r) => r.owner_id === salesA);
    expect(notMine.every((r) => r.can_open === false)).toBe(true);
    // Kỹ thuật không gọi được nguồn ghép
    expect(await as(cB, tech, async (db) => (await db.query("select * from public.match_pool_buy_demands()")).rowCount)).toBe(0);
  });

  it("anon (chưa đăng nhập) không đọc được bảng nào", async () => {
    await expect(as(cA, null, (db) => db.query("select * from public.customers"))).rejects.toThrow(/permission denied/);
    await expect(as(cA, null, (db) => db.query("select public.create_demand('{}'::jsonb)"))).rejects.toThrow(/permission denied/);
  });

  it("§12.12 thu hồi vai trò / khóa tài khoản có hiệu lực ngay ở database (không phụ thuộc giao diện)", async () => {
    const u = await createUser(sys, "Sales sắp nghỉ", ["sales"]);
    const id = await newDemand(cA, u, { request_id: uuid(), kind: "buy", customer: { full_name: "Khách của người sắp nghỉ" } });
    expect(await as(cA, u, async (db) => (await db.query("select id from public.demands where id = $1", [id])).rowCount)).toBe(1);
    // Khóa tài khoản: mất mọi quyền dù phiên đăng nhập (JWT) vẫn còn hạn
    await sys.query("update public.profiles set is_active = false where id = $1", [u]);
    expect(await as(cA, u, async (db) => (await db.query("select id from public.demands where id = $1", [id])).rowCount)).toBe(0);
    await expect(as(cA, u, (db) => db.query("select public.create_demand($1::jsonb)", [JSON.stringify({ request_id: uuid(), kind: "buy", customer: { full_name: "X" } })])))
      .rejects.toThrow(/row-level security/);
    // Mở lại nhưng gỡ vai trò sales: vẫn không còn quyền
    await sys.query("update public.profiles set is_active = true where id = $1", [u]);
    await sys.query("delete from public.user_roles where user_id = $1", [u]);
    expect(await as(cA, u, async (db) => (await db.query("select count(*)::int n from public.demands")).rows[0].n)).toBe(0);
    expect(await as(cA, u, async (db) => (await db.query("select public.my_roles() r")).rows[0].r)).toBe("{}");
    // Quản lý vẫn thấy nhu cầu để giao lại cho người khác
    expect(await as(cB, manager, async (db) => (await db.query("select id from public.demands where id = $1", [id])).rowCount)).toBe(1);
  });

  it("Không dùng user_metadata để cấp quyền", async () => {
    const u = await createUser(sys, "Người lạ", []);
    await sys.query("update auth.users set raw_user_meta_data = '{\"role\":\"admin\"}' where id = $1", [u]);
    expect(await as(cA, u, async (db) => (await db.query("select count(*)::int n from public.demands")).rows[0].n)).toBe(0);
    expect(await as(cA, u, async (db) => (await db.query("select public.my_roles() r")).rows[0].r)).toBe("{}");
    await expect(as(cA, u, (db) => db.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [u])))
      .rejects.toThrow(/row-level security/);
  });

  it("§12.11 dữ liệu tài chính xe tách riêng: sales/kỹ thuật không đọc được giá vốn, giá sàn", async () => {
    const mk = (await sys.query("select id from public.vehicle_makes where private.norm_text(name) = 'vinfast'")).rows[0].id;
    const v = (await sys.query(
      "insert into public.vehicles (make_id, condition, business_type, sale_status, year_made, color) values ($1, 'used', 'owned', 'available', 2023, 'trắng') returning id", [mk])).rows[0].id;
    await sys.query("insert into public.vehicle_listings (vehicle_id, asking_price) values ($1, 650000000)", [v]);
    await sys.query("insert into public.vehicle_financials (vehicle_id, purchase_price, floor_price) values ($1, 560000000, 620000000)", [v]);
    const hidden = (await sys.query("insert into public.vehicles (make_id, condition, business_type, sale_status) values ($1, 'used', 'owned', 'not_listed') returning id", [mk])).rows[0].id;

    const salesView = await as(cA, salesA, async (db) => ({
      fin: (await db.query("select * from public.vehicle_financials")).rowCount,
      listing: (await db.query("select asking_price from public.vehicle_listings where vehicle_id = $1", [v])).rows,
      hidden: (await db.query("select id from public.vehicles where id = $1", [hidden])).rowCount,
    }));
    expect(salesView.fin).toBe(0);
    expect(salesView.listing).toHaveLength(1);
    expect(salesView.hidden).toBe(0);
    const techView = await as(cA, tech, async (db) => ({
      fin: (await db.query("select * from public.vehicle_financials")).rowCount,
      listing: (await db.query("select * from public.vehicle_listings")).rowCount,
      car: (await db.query("select id from public.vehicles where id = $1", [v])).rowCount,
    }));
    expect(techView).toEqual({ fin: 0, listing: 0, car: 1 });
    expect(await as(cA, accountant, async (db) => (await db.query("select * from public.vehicle_financials where vehicle_id = $1", [v])).rowCount)).toBe(1);
    // Sales không sửa được giá chào
    expect(await as(cA, salesA, async (db) => (await db.query("update public.vehicle_listings set asking_price = 1 where vehicle_id = $1", [v])).rowCount)).toBe(0);
    // VIN duy nhất khi đã biết
    await sys.query("update public.vehicles set vin = 'RLLV1234567890ABC' where id = $1", [v]);
    await expect(sys.query("update public.vehicles set vin = 'rllv1234567890abc' where id = $1", [hidden])).rejects.toThrow(/vehicles_vin_key/);
  });

  it("§12.11 tệp riêng tư: người ngoài quyền không đọc/ghi được tệp của nhu cầu", async () => {
    const id = await newDemand(cA, salesA, { request_id: uuid(), kind: "buy", customer: { full_name: "Khách có tệp" } });
    const path = `${id}/tin-nhan-zalo.png`;
    await as(cA, salesA, (db) => db.query("insert into storage.objects (bucket_id, name) values ('demand-files', $1)", [path]));
    expect(await as(cB, salesB, async (db) => (await db.query("select * from storage.objects where name = $1", [path])).rowCount)).toBe(0);
    expect(await as(cB, tech, async (db) => (await db.query("select * from storage.objects where name = $1", [path])).rowCount)).toBe(0);
    await expect(as(cB, salesB, (db) => db.query("insert into storage.objects (bucket_id, name) values ('demand-files', $1)", [`${id}/chen.png`])))
      .rejects.toThrow(/row-level security/);
    await expect(as(cB, salesB, (db) => db.query("insert into storage.objects (bucket_id, name) values ('demand-files', 'khong-phai-uuid/x.png')")))
      .rejects.toThrow(/row-level security/);
    expect(await as(cA, salesA, async (db) => (await db.query("select * from storage.objects where name = $1", [path])).rowCount)).toBe(1);
    expect(await as(cA, salesA, async (db) => (await db.query("delete from storage.objects where name = $1", [path])).rowCount)).toBe(0);
  });
});

d("Cập nhật đồng thời", () => {
  it("hai người cùng sửa một nhu cầu: người sau bị từ chối, không ghi đè âm thầm", async () => {
    const sys = await connect(); const c1 = await connect(); const c2 = await connect();
    const s = await createUser(sys, "Sales sửa", ["sales"]);
    const m = await createUser(sys, "QL sửa", ["manager"]);
    const id = await as(c1, s, async (db) => (await db.query("select public.create_demand($1::jsonb) id",
      [JSON.stringify({ request_id: uuid(), kind: "buy", customer: { full_name: "K" }, options: [{ make: "Kia", model: "Seltos" }] })])).rows[0].id);
    const v = (await sys.query("select version from public.demands where id = $1", [id])).rows[0].version;
    await as(c1, s, (db) => db.query("select public.update_demand($1, $2, $3::jsonb)", [id, v, JSON.stringify({ budget_max: "700000000", options: [{ make: "Kia", model: "Seltos" }], strict_criteria: ["model"] })]));
    await expect(as(c2, m, (db) => db.query("select public.update_demand($1, $2, $3::jsonb)", [id, v, JSON.stringify({ budget_max: "500000000", options: [] })])))
      .rejects.toThrow(/vừa được người khác cập nhật/);
    const row = (await sys.query("select budget_max::text b, (select count(*)::int from public.demand_vehicle_options where demand_id = $1) n from public.demands where id = $1", [id])).rows[0];
    expect(row).toEqual({ b: "700000000", n: 1 });
    await Promise.all([sys, c1, c2].map((x) => x.end()));
  });
});
