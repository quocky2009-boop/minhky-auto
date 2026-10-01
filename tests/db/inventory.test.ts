/**
 * Chặng 3 (lát 1): kho xe, vòng sở hữu theo VIN, nhập kho từ nhu cầu bán, tìm kiếm kho.
 * Chạy SQL trực tiếp dưới vai trò `authenticated` của từng người dùng (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;

d("Kho xe — chặng 3 lát 1 (database thật)", () => {
  let sys: Client, c: Client;
  let manager: string, salesA: string, tech: string, accountant: string;

  beforeAll(async () => {
    sys = await connect(); c = await connect();
    manager = await createUser(sys, "QL Kho", ["manager"]);
    salesA = await createUser(sys, "Sales Kho", ["sales"]);
    tech = await createUser(sys, "KTV Kho", ["technician"]);
    accountant = await createUser(sys, "KT Kho", ["accountant"]);
  });
  afterAll(async () => { await sys.end(); await c.end(); });

  const createVehicle = (user: string, p: Record<string, unknown>) =>
    as(c, user, async (db) => (await db.query("select public.create_vehicle($1::jsonb) id", [JSON.stringify({ request_id: uuid(), ...p })])).rows[0].id as string);
  const updateVehicle = (user: string, id: string, version: number, p: Record<string, unknown>) =>
    as(c, user, async (db) => (await db.query("select public.update_vehicle($1, $2, $3::jsonb) v", [id, version, JSON.stringify(p)])).rows[0].v as number);
  const version = async (id: string) => (await sys.query("select version from public.vehicles where id = $1", [id])).rows[0].version as number;

  it("Quản lý nhập xe: giá chào, giá mua, giá sàn vào đúng bảng; gửi lại cùng mã yêu cầu không tạo trùng", async () => {
    const request_id = uuid();
    const body = { request_id, make: "VinFast", model: "VF 6", variant: "Plus", condition: "new", business_type: "owned", source_type: "distributor",
      year_made: "2026", color: "Trắng", asking_price: "780000000", purchase_price: "700000000", floor_price: "740000000", intake_date: "2026-09-01" };
    const id1 = await as(c, manager, async (db) => (await db.query("select public.create_vehicle($1::jsonb) id", [JSON.stringify(body)])).rows[0].id as string);
    const id2 = await as(c, manager, async (db) => (await db.query("select public.create_vehicle($1::jsonb) id", [JSON.stringify(body)])).rows[0].id as string);
    expect(id2).toBe(id1);
    expect((await sys.query("select count(*)::int n from public.vehicles where client_request_id = $1", [request_id])).rows[0].n).toBe(1);
    const fin = (await sys.query("select purchase_price::text p, floor_price::text f from public.vehicle_financials where vehicle_id = $1", [id1])).rows[0];
    expect(fin).toEqual({ p: "700000000", f: "740000000" });
    expect((await sys.query("select asking_price::text a from public.vehicle_listings where vehicle_id = $1", [id1])).rows[0].a).toBe("780000000");
    expect((await sys.query("select color from public.vehicles where id = $1", [id1])).rows[0].color).toBe("trắng");
  });

  it("Chỉ quản lý nhập/sửa xe; dữ liệu thiếu hoặc sai bị từ chối rõ ràng", async () => {
    await expect(createVehicle(salesA, { make: "MG", condition: "new" })).rejects.toThrow(/Chỉ quản lý được nhập xe/);
    await expect(createVehicle(tech, { make: "MG", condition: "new" })).rejects.toThrow(/Chỉ quản lý được nhập xe/);
    await expect(createVehicle(manager, { make: "MG" })).rejects.toThrow(/Chọn xe mới hoặc xe đã qua sử dụng/);
    await expect(createVehicle(manager, { make: "", condition: "new" })).rejects.toThrow(/Thiếu tên hãng/);
    await expect(createVehicle(manager, { make: "MG", condition: "used", business_type: "consignment", purchase_price: "500000000" }))
      .rejects.toThrow(/Xe ký gửi không có giá mua/);
    const ok = await createVehicle(manager, { make: "MG", model: "ZS", condition: "used", business_type: "consignment", source_type: "individual" });
    expect((await sys.query("select count(*)::int n from public.vehicle_financials where vehicle_id = $1", [ok])).rows[0].n).toBe(0); // thiếu giá mua ≠ 0
  });

  it("Phân quyền đọc: sales thấy xe đang bán + giá chào, KHÔNG thấy giá mua/giá sàn; kỹ thuật không thấy giá; kế toán thấy tài chính", async () => {
    const id = await createVehicle(manager, { make: "Toyota", model: "Vios", condition: "used", business_type: "owned", source_type: "individual",
      year_made: "2021", asking_price: "420000000", purchase_price: "360000000", floor_price: "395000000" });
    // chưa niêm yết: sales không thấy xe
    expect(await as(c, salesA, async (db) => (await db.query("select count(*)::int n from public.vehicles where id = $1", [id])).rows[0].n)).toBe(0);
    await updateVehicle(manager, id, await version(id), { sale_status: "available" });
    const s = await as(c, salesA, async (db) => ({
      v: (await db.query("select count(*)::int n from public.vehicles where id = $1", [id])).rows[0].n,
      listing: (await db.query("select asking_price::text a from public.vehicle_listings where vehicle_id = $1", [id])).rows[0]?.a,
      fin: (await db.query("select count(*)::int n from public.vehicle_financials where vehicle_id = $1", [id])).rows[0].n,
    }));
    expect(s).toEqual({ v: 1, listing: "420000000", fin: 0 });
    const t = await as(c, tech, async (db) => ({
      v: (await db.query("select count(*)::int n from public.vehicles where id = $1", [id])).rows[0].n,
      listing: (await db.query("select count(*)::int n from public.vehicle_listings where vehicle_id = $1", [id])).rows[0].n,
      fin: (await db.query("select count(*)::int n from public.vehicle_financials where vehicle_id = $1", [id])).rows[0].n,
    }));
    expect(t).toEqual({ v: 1, listing: 0, fin: 0 });
    const a = await as(c, accountant, async (db) => (await db.query("select purchase_price::text p from public.vehicle_financials where vehicle_id = $1", [id])).rows[0].p);
    expect(a).toBe("360000000");
    // sales không ghi được giá mua dù biết id
    await expect(as(c, salesA, (db) => db.query("update public.vehicle_financials set purchase_price = 1 where vehicle_id = $1", [id]))).resolves.toMatchObject({ rowCount: 0 });
    expect((await sys.query("select purchase_price::text p from public.vehicle_financials where vehicle_id = $1", [id])).rows[0].p).toBe("360000000");
  });

  it("Sửa xe: chống ghi đè đồng thời; không đặt tay trạng thái giữ/cọc/bán; không đổi hình thức sở hữu", async () => {
    const id = await createVehicle(manager, { make: "Kia", model: "Seltos", condition: "used", business_type: "owned", year_made: "2022" });
    const v0 = await version(id);
    const v1 = await updateVehicle(manager, id, v0, { odo: "18000", color: "Đen", asking_price: "650000000", sale_status: "available" });
    expect(v1).toBeGreaterThan(v0);
    await expect(updateVehicle(manager, id, v0, { odo: "99999" })).rejects.toThrow(/vừa được người khác cập nhật/);
    expect((await sys.query("select odo from public.vehicles where id = $1", [id])).rows[0].odo).toBe(18000);
    await expect(updateVehicle(manager, id, v1, { sale_status: "sold" })).rejects.toThrow(/chỉ được đặt qua nghiệp vụ/);
    await expect(updateVehicle(manager, id, v1, { sale_status: "held" })).rejects.toThrow(/chỉ được đặt qua nghiệp vụ/);
    await expect(sys.query("update public.vehicles set business_type = 'consignment' where id = $1", [id])).rejects.toThrow(/Không đổi được hình thức/);
    // có mặt + rỗng = xóa về "chưa rõ" (null), không thành 0
    const v2 = await updateVehicle(manager, id, v1, { odo: "" });
    expect(v2).toBeGreaterThan(v1);
    expect((await sys.query("select odo from public.vehicles where id = $1", [id])).rows[0].odo).toBeNull();
    // khóa không có mặt thì giữ nguyên
    expect((await sys.query("select color from public.vehicles where id = $1", [id])).rows[0].color).toBe("đen");
  });

  it("VIN: không trùng giữa hồ sơ đang hoạt động; xe quay lại tạo vòng mới liên kết vòng cũ, không ghi đè", async () => {
    const vin = "RLLVN0000000TEST1";
    const first = await createVehicle(manager, { make: "VinFast", model: "VF 8", condition: "used", business_type: "owned", vin: vin.toLowerCase(), year_made: "2023", purchase_price: "800000000" });
    await expect(createVehicle(manager, { make: "VinFast", model: "VF 8", condition: "used", vin })).rejects.toThrow(/đang có trong kho \(mã XE\d+\)/);
    // vòng 1 kết thúc (nghiệp vụ bán/bàn giao do chặng 5 thực hiện — ở đây mô phỏng bằng quyền hệ thống)
    await sys.query("update public.vehicles set sale_status = 'available' where id = $1", [first]);
    await sys.query("update public.vehicles set sale_status = 'sold' where id = $1", [first]);
    await sys.query("update public.vehicles set sale_status = 'delivered' where id = $1", [first]);
    const second = await createVehicle(manager, { make: "VinFast", model: "VF 8", condition: "used", business_type: "owned", vin, year_made: "2023", purchase_price: "600000000" });
    expect(second).not.toBe(first);
    expect((await sys.query("select previous_vehicle_id from public.vehicles where id = $1", [second])).rows[0].previous_vehicle_id).toBe(first);
    // vòng cũ giữ nguyên giá mua cũ và trạng thái đã giao
    expect((await sys.query("select purchase_price::text p from public.vehicle_financials where vehicle_id = $1", [first])).rows[0].p).toBe("800000000");
    expect((await sys.query("select sale_status from public.vehicles where id = $1", [first])).rows[0].sale_status).toBe("delivered");
    // vòng đã kết thúc không "sống lại"
    await expect(updateVehicle(manager, first, await version(first), { sale_status: "available" })).rejects.toThrow(/kết thúc một vòng sở hữu/);
    // lịch sử vòng sở hữu
    const hist = await as(c, manager, async (db) => (await db.query("select code, depth from public.vehicle_history($1)", [second])).rows);
    expect(hist.map((h) => h.depth)).toEqual([0, 1]);
  });

  it("Xe ký gửi chỉ được trả chủ khi là xe ký gửi", async () => {
    const own = await createVehicle(manager, { make: "Honda", model: "City", condition: "used", business_type: "owned" });
    await expect(updateVehicle(manager, own, await version(own), { sale_status: "returned_to_owner" })).rejects.toThrow(/Chỉ xe ký gửi mới trả lại chủ xe/);
    const cons = await createVehicle(manager, { make: "Honda", model: "Civic", condition: "used", business_type: "consignment", source_type: "individual" });
    await updateVehicle(manager, cons, await version(cons), { sale_status: "returned_to_owner" });
    expect((await sys.query("select sale_status from public.vehicles where id = $1", [cons])).rows[0].sale_status).toBe("returned_to_owner");
  });

  describe("Nhập kho từ nhu cầu bán", () => {
    const newSellDemand = async (offer: Record<string, unknown>) =>
      as(c, salesA, async (db) => (await db.query("select public.create_demand($1::jsonb) id", [JSON.stringify({
        request_id: uuid(), kind: "sell", customer: { full_name: "Khách bán " + uuid().slice(0, 4) }, sell_offer: offer })])).rows[0].id as string);
    const moveTo = (id: string, status: string) =>
      as(c, salesA, (db) => db.query("select public.log_demand_activity($1, $2, 'call', 'cập nhật', null, 'Việc tiếp theo', now() + interval '1 day', $3, null, null)", [id, uuid(), status]));
    /** Thẩm định đạt toàn bộ mục + duyệt mua (quản lý). max = giá mua tối đa được duyệt. */
    const approve = async (demand: string, max = "900000000") => {
      const tpl = (await sys.query("select key, requires_note_on_pass from public.appraisal_templates where is_active and not ev_only")).rows;
      const items = Object.fromEntries(tpl.map((t) => [t.key, { result: "pass", note: t.requires_note_on_pass ? "đã đo" : "" }]));
      await as(c, manager, (db) => db.query("select public.save_appraisal($1, $2::jsonb)", [demand, JSON.stringify({ items, proposed_price: max })]));
      await as(c, manager, (db) => db.query("select public.decide_appraisal($1, 'approve', $2::jsonb)", [demand, JSON.stringify({ approved_max_price: max })]));
    };
    const acquire = (user: string, demand: string, p: Record<string, unknown> = {}, request = uuid()) =>
      as(c, user, async (db) => (await db.query("select public.acquire_from_demand($1, $2, $3::jsonb) id", [demand, request, JSON.stringify(p)])).rows[0].id as string);

    it("Chỉ nhập khi đã thẩm định/thương lượng, chỉ quản lý, phải có giá mua; liên kết nguồn gốc; không tạo trùng xe", async () => {
      const dem = await newSellDemand({ make: "Mazda", model: "CX-5", year_made: "2020", color: "Xanh dương", odo: "45000", vin: "JM3KE0000000ACQ01", asking_price: "700000000", sale_mode: "outright" });
      await expect(acquire(manager, dem, { purchase_price: "650000000" })).rejects.toThrow(/Cần thẩm định và duyệt mua/);
      await approve(dem, "700000000");
      await expect(acquire(manager, dem, { purchase_price: "650000000" })).rejects.toThrow(/Đã thẩm định/);   // đã duyệt nhưng nhu cầu còn ở trạng thái Mới
      await moveTo(dem, "appraised");
      await expect(acquire(salesA, dem, { purchase_price: "650000000" })).rejects.toThrow(/Chỉ quản lý/);
      await expect(acquire(manager, dem)).rejects.toThrow(/Nhập giá mua thực tế/);
      await expect(acquire(manager, dem, { purchase_price: "720000000" })).rejects.toThrow(/vượt giá tối đa đã duyệt/);
      const req = uuid();
      const v1 = await acquire(manager, dem, { purchase_price: "650000000", odo: "45500", location_id: "" }, req);
      const v2 = await acquire(manager, dem, { purchase_price: "650000000" }, uuid());     // bấm lại / thử lại
      expect(v2).toBe(v1);
      expect((await sys.query("select count(*)::int n from public.vehicles where source_demand_id = $1", [dem])).rows[0].n).toBe(1);

      const v = (await sys.query("select * from public.vehicles where id = $1", [v1])).rows[0];
      expect(v).toMatchObject({ business_type: "owned", source_type: "individual", condition: "used", year_made: 2020, color: "xanh dương",
        odo: 45500, vin: "JM3KE0000000ACQ01", sale_status: "not_listed", prep_status: "pending", paperwork_status: "incomplete", source_demand_id: dem });
      expect((await sys.query("select purchase_price::text p from public.vehicle_financials where vehicle_id = $1", [v1])).rows[0].p).toBe("650000000");
      const offer = (await sys.query("select converted_vehicle_id, odo from public.sell_offers where demand_id = $1", [dem])).rows[0];
      expect(offer.converted_vehicle_id).toBe(v1);
      expect(offer.odo).toBe(45000);                       // thông tin khách khai giữ nguyên; xe lưu số đã kiểm tra
      expect((await sys.query("select status from public.demands where id = $1", [dem])).rows[0].status).toBe("acquired");
      const log = (await sys.query("select content from public.demand_activities where demand_id = $1 and channel = 'system'", [dem])).rows;
      expect(log.some((l) => /Đã nhập kho thành xe XE\d+/.test(l.content))).toBe(true);
      // nhu cầu bán đã nhập kho thì không còn là "nguồn chưa thu mua" trong gợi ý
      const pool = await as(c, salesA, async (db) => (await db.query("select count(*)::int n from public.match_pool_sell_offers() where demand_id = $1", [dem])).rows[0].n);
      expect(pool).toBe(0);
    });

    it("Ký gửi: không có giá mua, hình thức tách khỏi sở hữu; thu cũ đổi mới ghi nguồn trade_in; chưa chọn hình thức thì chặn", async () => {
      const cons = await newSellDemand({ make: "Hyundai", model: "Accent", year_made: "2019", sale_mode: "consignment" });
      await moveTo(cons, "negotiating");
      await approve(cons);
      await expect(acquire(manager, cons, { purchase_price: "300000000" })).rejects.toThrow(/Xe ký gửi không có giá mua/);
      const vc = await acquire(manager, cons);
      const row = (await sys.query("select business_type from public.vehicles where id = $1", [vc])).rows[0];
      expect(row.business_type).toBe("consignment");
      expect((await sys.query("select count(*)::int n from public.vehicle_financials where vehicle_id = $1", [vc])).rows[0].n).toBe(0);

      const ti = await newSellDemand({ make: "Toyota", model: "Camry", year_made: "2018", sale_mode: "trade_in" });
      await moveTo(ti, "appraised");
      await approve(ti);
      const vt = await acquire(manager, ti, { purchase_price: "500000000" });
      expect((await sys.query("select source_type, business_type from public.vehicles where id = $1", [vt])).rows[0]).toEqual({ source_type: "trade_in", business_type: "owned" });

      const und = await newSellDemand({ make: "Ford", model: "Ranger", sale_mode: "undecided" });
      await moveTo(und, "appraised");
      await approve(und);
      await expect(acquire(manager, und, { purchase_price: "600000000" })).rejects.toThrow(/Chọn hình thức/);
      const vu = await acquire(manager, und, { purchase_price: "600000000", business_type: "owned" });
      expect(vu).toBeTruthy();
    });

    it("VIN trùng xe đang có trong kho thì không nhập kho, nhu cầu giữ nguyên trạng thái", async () => {
      await createVehicle(manager, { make: "Suzuki", model: "XL7", condition: "used", vin: "MHYDUPLICATE0001" });
      const dem = await newSellDemand({ make: "Suzuki", model: "XL7", vin: "MHYDUPLICATE0001", sale_mode: "outright" });
      await moveTo(dem, "appraised");
      await approve(dem);
      await expect(acquire(manager, dem, { purchase_price: "400000000" })).rejects.toThrow(/đang có trong kho/);
      expect((await sys.query("select status from public.demands where id = $1", [dem])).rows[0].status).toBe("appraised");
      expect((await sys.query("select count(*)::int n from public.vehicles where source_demand_id = $1", [dem])).rows[0].n).toBe(0);
    });
  });

  describe("Tìm kiếm kho xe", () => {
    beforeAll(async () => {
      const mk = async (p: Record<string, unknown>, status?: string) => {
        const id = await createVehicle(manager, { condition: "used", business_type: "owned", ...p });
        if (status) await updateVehicle(manager, id, await version(id), { sale_status: status });
        return id;
      };
      await mk({ make: "Peugeot", model: "3008", year_made: "2021", color: "Trắng", asking_price: "800000000", intake_date: "2026-01-01" }, "available");
      await mk({ make: "Peugeot", model: "5008", year_made: "2023", color: "Đen", asking_price: "1000000000", intake_date: "2026-08-20" }, "available");
      await mk({ make: "Peugeot", model: "2008", year_made: "2020", color: "Trắng" });   // chưa niêm yết, chưa có giá
    });
    const search = (user: string, f: Record<string, string>, limit = 25, offset = 0) =>
      as(c, user, async (db) => (await db.query("select public.search_vehicles($1::jsonb, $2, $3) r", [JSON.stringify(f), limit, offset])).rows[0].r as { total: number; rows: { model_name: string; asking_price: string | null; age_days: number | null }[] });

    it("Lọc kết hợp; khoảng giá không giả định xe chưa có giá; xếp theo tuổi tồn; phân trang", async () => {
      const all = await search(manager, { q: "peugeot" });
      expect(all.total).toBe(3);
      expect(all.rows[0].model_name).toBe("3008");                       // tồn lâu nhất lên đầu
      expect(all.rows[0].age_days).toBeGreaterThan(200);
      expect((await search(manager, { q: "peugeot", color: "trang" })).total).toBe(2);
      const priced = await search(manager, { q: "peugeot", price_from: "700000000", price_to: "900000000" });
      expect(priced.total).toBe(1);                                      // xe chưa có giá chào bị loại, không tính là phù hợp
      expect((await search(manager, { q: "peugeot", year_from: "2022" })).total).toBe(1);
      expect((await search(manager, { q: "peugeot", state: "selling" })).total).toBe(2);
      expect((await search(manager, { q: "peugeot", age_min: "100" })).total).toBe(1);
      const p1 = await search(manager, { q: "peugeot" }, 2, 0);
      const p2 = await search(manager, { q: "peugeot" }, 2, 2);
      expect([p1.rows.length, p2.rows.length, p1.total]).toEqual([2, 1, 3]);
    });

    it("Sales chỉ thấy xe đang bán (kèm giá chào); kỹ thuật thấy xe chưa bán nhưng không thấy giá", async () => {
      const s = await search(salesA, { q: "peugeot", state: "all" });
      expect(s.total).toBe(2);
      expect(s.rows.every((r) => r.asking_price !== null)).toBe(true);
      const t = await search(tech, { q: "peugeot", state: "all" });
      expect(t.total).toBe(3);
      expect(t.rows.every((r) => r.asking_price === null)).toBe(true);
    });

    it("anon bị chặn", async () => {
      await expect(as(c, null, (db) => db.query("select public.search_vehicles('{}'::jsonb)"))).rejects.toThrow(/permission denied/);
    });
  });
});
