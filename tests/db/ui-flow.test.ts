/**
 * Luồng chặng 3 qua đúng các RPC mà giao diện gọi: tạo nhu cầu (form) -> lọc -> nhắc việc -> gợi ý xe.
 * Phần gợi ý dùng chính hàm TypeScript của trang chi tiết (suggestForBuy / suggestBuyersForOffer) trên dữ liệu thật từ database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";
import { parseDemandForm } from "@/lib/demands/form";
import { suggestBuyersForOffer, suggestForBuy, toBuyCriteria, type SellPoolRow, type VehiclePoolRow } from "@/lib/demands/suggest";

const d = DB_URL ? describe : describe.skip;

/** Giả lập FormData từ object (giống trình duyệt gửi lên). */
function fd(obj: Record<string, string | string[]>) {
  return {
    get: (k: string) => (Array.isArray(obj[k]) ? (obj[k] as string[])[0] : obj[k]) ?? null,
    getAll: (k: string) => (Array.isArray(obj[k]) ? (obj[k] as string[]) : obj[k] !== undefined ? [obj[k] as string] : []),
  };
}

d("Luồng giao diện chặng 3 — database thật", () => {
  let sys: Client, c: Client;
  let admin: string, manager: string, salesA: string, salesB: string, tech: string;

  beforeAll(async () => {
    sys = await connect(); c = await connect();
    admin = await createUser(sys, "Chủ tịch", ["admin"]);
    manager = await createUser(sys, "Quản lý UI", ["manager"]);
    salesA = await createUser(sys, "Sales UI A", ["sales"]);
    salesB = await createUser(sys, "Sales UI B", ["sales"]);
    tech = await createUser(sys, "KTV UI", ["technician"]);
  });
  afterAll(async () => { await sys.end(); await c.end(); });

  const createFromForm = async (user: string, form: Record<string, string | string[]>) => {
    const parsed = parseDemandForm(fd(form), "create");
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.fieldErrors));
    return as(c, user, async (db) => (await db.query("select public.create_demand($1::jsonb) id", [JSON.stringify(parsed.payload)])).rows[0].id as string);
  };

  it("Form nhập nhanh: '600tr'–'700tr' lưu thành số chính xác; ô trống thành Chưa rõ (null), không thành 0", async () => {
    const id = await createFromForm(salesA, {
      request_id: uuid(), kind: "buy", c_name: "Anh Hùng", c_phone: "0977 111 222",
      opt_make: ["VinFast", "Toyota"], opt_model: ["VF 8", "Corolla Cross"], opt_variant: ["", ""],
      budget_min: "600tr", budget_max: "700 triệu", colors_accepted: "trắng, đen", strict_criteria: ["model"],
      next_action: "Gọi lại", next_action_due: "2026-10-02T09:00",
    });
    const row = (await sys.query("select budget_min::text, budget_max::text, year_min, odo_max, needs_loan, next_action_due from public.demands where id = $1", [id])).rows[0];
    expect(row).toMatchObject({ budget_min: "600000000", budget_max: "700000000", year_min: null, odo_max: null, needs_loan: null });
    expect(new Date(row.next_action_due).toISOString()).toBe("2026-10-02T02:00:00.000Z"); // 09:00 giờ VN
    const opts = (await sys.query("select count(*)::int n from public.demand_vehicle_options where demand_id = $1", [id])).rows[0].n;
    expect(opts).toBe(2);
  });

  it("Form chặn dữ liệu sai trước khi tới database", () => {
    const r = parseDemandForm(fd({ request_id: uuid(), kind: "buy", c_name: "", c_phone: "123", budget_min: "800tr", budget_max: "600tr", next_action: "Gọi" }), "create");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["budget_max", "c_name", "c_phone", "next_action_due"]);
  });

  it("§12.2 §12.3 gợi ý ghép trên dữ liệu thật: xe 650tr sẵn bán khớp khách 600–700tr; nguồn khách chào bán tách riêng, không 'sẵn giao'", async () => {
    const buyId = await createFromForm(salesA, {
      request_id: uuid(), kind: "buy", c_name: "Chị Lan", opt_make: ["MG"], opt_model: ["MG ZS"], opt_variant: [""],
      budget_min: "600tr", budget_max: "700tr", year_min: "2022", colors_rejected: "đỏ", strict_criteria: ["model"],
    });
    // Xe trong kho (do quản lý nhập — chặng 4 sẽ có giao diện): 650tr, trắng, 2023
    const spec = (await sys.query("select make_id, model_id from public.demand_vehicle_options where demand_id = $1", [buyId])).rows[0];
    const v = (await sys.query("insert into public.vehicles (make_id, model_id, condition, business_type, sale_status, year_made, color) values ($1,$2,'used','owned','available',2023,'trắng') returning id", [spec.make_id, spec.model_id])).rows[0].id;
    await sys.query("insert into public.vehicle_listings (vehicle_id, asking_price) values ($1, 650000000)", [v]);
    const vRed = (await sys.query("insert into public.vehicles (make_id, model_id, condition, business_type, sale_status, year_made, color) values ($1,$2,'used','consignment','available',2023,'đỏ') returning id", [spec.make_id, spec.model_id])).rows[0].id;
    await sys.query("insert into public.vehicle_listings (vehicle_id, asking_price) values ($1, 640000000)", [vRed]);
    // Nguồn xe: khách của sales B đang chào bán MG ZS 2022 giá 680tr
    const sellId = await createFromForm(salesB, {
      request_id: uuid(), kind: "sell", c_name: "Anh Bán ZS", c_phone: "0966 555 444",
      s_make: "mg", s_model: "mg zs", s_year_made: "2022", s_color: "trắng", s_price: "680tr", s_sale_mode: "outright",
    });

    const pools = await as(c, salesA, async (db) => ({
      demand: (await db.query("select * from public.match_pool_buy_demands() where demand_id = $1", [buyId])).rows[0],
      vehicles: (await db.query("select * from public.match_pool_vehicles()")).rows as VehiclePoolRow[],
      offers: (await db.query("select * from public.match_pool_sell_offers()")).rows as SellPoolRow[],
    }));
    const sug = suggestForBuy(toBuyCriteria(pools.demand, 14), pools.vehicles, pools.offers, buyId);
    const vehicleIds = sug.vehicles.map((s) => s.item.vehicle_id);
    expect(vehicleIds).toContain(v);
    expect(vehicleIds).not.toContain(vRed); // màu khách đã loại -> không gợi ý
    const top = sug.vehicles.find((s) => s.item.vehicle_id === v)!;
    expect(top.result.level).toBe("match");
    expect(top.result.readyToDeliver).toBe(true);
    const offer = sug.offers.find((s) => s.item.demand_id === sellId)!;
    expect(offer).toBeDefined();
    expect(offer.result.readyToDeliver).toBe(false);
    expect(offer.result.availabilityLabel).toMatch(/chưa thu mua/);
    expect(offer.item.can_open).toBe(false); // khách của sales B: A không mở được hồ sơ

    // Chiều ngược lại: nguồn xe bán mới -> gợi ý nhu cầu mua (trang chi tiết nhu cầu bán của sales B)
    const buyers = await as(c, salesB, async (db) => (await db.query("select * from public.match_pool_buy_demands()")).rows);
    const offerRow = await as(c, salesB, async (db) => (await db.query("select * from public.match_pool_sell_offers() where demand_id = $1", [sellId])).rows[0]);
    const matches = suggestBuyersForOffer(offerRow, buyers, 14);
    expect(matches.map((m) => m.item.demand_id)).toContain(buyId);
    expect(Object.keys(buyers[0])).not.toContain("customer_name");
  });

  it("list_sellers chỉ trả id + tên nhân viên bán hàng; kỹ thuật vẫn gọi được nhưng không lộ vai trò", async () => {
    const rows = await as(c, salesA, async (db) => (await db.query("select * from public.list_sellers()")).rows);
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([admin, manager, salesA, salesB]));
    expect(ids).not.toContain(tech);
    expect(Object.keys(rows[0]).sort()).toEqual(["full_name", "id"]);
  });

  it("search_customers tuân RLS và tìm không dấu / theo SĐT", async () => {
    const byA = await as(c, salesA, async (db) => (await db.query("select public.search_customers('chi lan') r")).rows[0].r);
    expect(byA.total).toBe(1);
    const byB = await as(c, salesB, async (db) => (await db.query("select public.search_customers('chi lan') r")).rows[0].r);
    expect(byB.total).toBe(0);
    const byPhone = await as(c, salesB, async (db) => (await db.query("select public.search_customers('966555444') r")).rows[0].r);
    expect(byPhone.total).toBe(1);
    const byMgr = await as(c, manager, async (db) => (await db.query("select public.search_customers('chi lan') r")).rows[0].r);
    expect(byMgr.total).toBe(1);
  });

  it("Đổi người phụ trách: sales bị chặn, quản lý đổi được, sai phiên bản bị từ chối, có nhật ký hệ thống", async () => {
    const id = await createFromForm(salesA, { request_id: uuid(), kind: "buy", c_name: "Khách chuyển" });
    const ver = (await sys.query("select version from public.demands where id = $1", [id])).rows[0].version;
    await expect(as(c, salesA, (db) => db.query("select public.reassign_demand($1, $2, $3)", [id, ver, salesB]))).rejects.toThrow(/Chỉ quản lý/);
    await expect(as(c, manager, (db) => db.query("select public.reassign_demand($1, $2, $3)", [id, ver + 5, salesB]))).rejects.toThrow(/vừa được người khác cập nhật/);
    await as(c, manager, (db) => db.query("select public.reassign_demand($1, $2, $3, 'A nghỉ phép')", [id, ver, salesB]));
    const r = (await sys.query("select owner_id from public.demands where id = $1", [id])).rows[0];
    expect(r.owner_id).toBe(salesB);
    const act = (await sys.query("select channel, content, actor_id from public.demand_activities where demand_id = $1 order by created_at desc limit 1", [id])).rows[0];
    expect(act).toMatchObject({ channel: "system", actor_id: manager });
    expect(act.content).toMatch(/Sales UI B.*nghỉ phép/);
    // Người dùng thường không tự ghi được nhật ký kênh 'system'
    await expect(as(c, salesB, (db) => db.query("insert into public.demand_activities (demand_id, channel, content) values ($1, 'system', 'giả')", [id])))
      .rejects.toThrow(/row-level security/);
    // B giờ sửa được; A (người tạo) vẫn xem được nhưng không sửa được
    expect(await as(c, salesB, async (db) => (await db.query("select public.can_edit_demand_ui($1) v", [id])).rows[0].v)).toBe(true);
    expect(await as(c, salesA, async (db) => (await db.query("select public.can_edit_demand_ui($1) v", [id])).rows[0].v)).toBe(false);
  });

  it("Sửa nhu cầu có kiểm tra phiên bản qua đúng payload của form sửa", async () => {
    const id = await createFromForm(salesA, { request_id: uuid(), kind: "buy", c_name: "Khách sửa", opt_make: ["Kia"], opt_model: ["Seltos"], opt_variant: [""] });
    const ver = (await sys.query("select version from public.demands where id = $1", [id])).rows[0].version;
    const upd = parseDemandForm(fd({ opt_make: ["Kia"], opt_model: ["Sonet"], opt_variant: [""], budget_max: "550tr", strict_criteria: ["model", "budget"] }), "update", "buy");
    if (!upd.ok) throw new Error("parse");
    await as(c, salesA, (db) => db.query("select public.update_demand($1, $2, $3::jsonb)", [id, ver, JSON.stringify(upd.payload)]));
    await expect(as(c, salesA, (db) => db.query("select public.update_demand($1, $2, $3::jsonb)", [id, ver, JSON.stringify(upd.payload)])))
      .rejects.toThrow(/vừa được người khác cập nhật/);
    const row = (await sys.query("select budget_max::text, strict_criteria from public.demands where id = $1", [id])).rows[0];
    expect(row).toEqual({ budget_max: "550000000", strict_criteria: ["model", "budget"] });
  });
});
