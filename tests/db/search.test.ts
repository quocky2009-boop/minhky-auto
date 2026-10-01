import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;

d("Lọc nhu cầu (search_demands) — §12.2, §12.3", () => {
  let sys: Client, c: Client, sales: string, other: string;
  const ids: Record<string, string> = {};
  const create = (user: string, key: string, p: Record<string, unknown>) =>
    as(c, user, async (db) => { ids[key] = (await db.query("select public.create_demand($1::jsonb) id", [JSON.stringify({ request_id: uuid(), ...p })])).rows[0].id; });
  const search = async (user: string, f: Record<string, unknown>) =>
    as(c, user, async (db) => (await db.query("select public.search_demands($1::jsonb, 100, 0) r", [JSON.stringify(f)])).rows[0].r as { total: number; rows: Array<{ id: string }> });
  const keysOf = (r: { rows: Array<{ id: string }> }) => Object.entries(ids).filter(([, v]) => r.rows.some((x) => x.id === v)).map(([k]) => k).sort();

  beforeAll(async () => {
    sys = await connect(); c = await connect();
    sales = await createUser(sys, "Sales Lọc", ["sales"]);
    other = await createUser(sys, "Sales Khác", ["sales"]);
    await create(sales, "vf8_600_700_trang_2022_2024", { kind: "buy", customer: { full_name: "Mua 1", area: "TP Tuyên Quang" },
      options: [{ make: "VinFast", model: "VF 8" }], budget_min: "600000000", budget_max: "700000000", year_min: 2022, year_max: 2024, colors_accepted: ["Trắng", "Đen"] });
    await create(sales, "vf8_chi_tran_800", { kind: "buy", customer: { full_name: "Mua 2", area: "Hàm Yên" },
      options: [{ make: "VinFast", model: "VF 8" }], budget_max: "800000000" });
    await create(sales, "vf8_khong_ro_gia", { kind: "buy", customer: { full_name: "Mua 3" }, options: [{ make: "VinFast", model: "VF 8" }] });
    await create(sales, "mg5_500", { kind: "buy", customer: { full_name: "Mua 4" }, options: [{ make: "MG", model: "MG5" }], budget_max: "500000000" });
    await create(sales, "ban_vf8_2023_650_trang_doi_xe", { kind: "sell", customer: { full_name: "Bán 1" },
      sell_offer: { make: "VinFast", model: "VF 8", year_made: 2023, color: "trắng", asking_price: "650000000", sale_mode: "trade_in" } });
    await create(sales, "ban_vf8_2020_900_do", { kind: "sell", customer: { full_name: "Bán 2" },
      sell_offer: { make: "VinFast", model: "VF 8", year_made: 2020, color: "đỏ", asking_price: "900000000" } });
    await create(other, "cua_sales_khac", { kind: "buy", customer: { full_name: "Của người khác" }, options: [{ make: "VinFast", model: "VF 8" }], budget_max: "700000000" });
  });
  afterAll(async () => { await sys.end(); await c.end(); });

  it("§12.2 lọc giá 650 triệu tìm được nhu cầu ngân sách 600–700 triệu và khoảng mở; loại nhu cầu chưa rõ giá", async () => {
    const r = await search(sales, { kind: "buy", price_from: 650000000, price_to: 650000000 });
    expect(keysOf(r)).toEqual(["vf8_600_700_trang_2022_2024", "vf8_chi_tran_800"]);
  });

  it("§12.2 lọc kết hợp hãng + model + đời + màu + giá trả đúng (cả mua lẫn bán)", async () => {
    const vf8 = (await sys.query("select md.id, md.make_id from public.vehicle_models md where private.norm_text(md.name) = 'vf 8'")).rows[0];
    const r = await search(sales, { make_id: vf8.make_id, model_id: vf8.id, year_from: 2023, year_to: 2023, color: "TRẮNG", price_from: 600000000, price_to: 700000000 });
    expect(keysOf(r)).toEqual(["ban_vf8_2023_650_trang_doi_xe", "vf8_600_700_trang_2022_2024"]);
  });

  it("lọc đổi xe, khu vực không dấu, tìm nhanh theo model", async () => {
    expect(keysOf(await search(sales, { kind: "trade_in" }))).toEqual(["ban_vf8_2023_650_trang_doi_xe"]);
    expect(keysOf(await search(sales, { area: "ham yen" }))).toEqual(["vf8_chi_tran_800"]);
    expect(keysOf(await search(sales, { q: "mg5" }))).toEqual(["mg5_500"]);
  });

  it("RLS áp dụng qua view: không thấy nhu cầu của sales khác", async () => {
    const r = await search(sales, {});
    expect(r.rows.some((x) => x.id === ids.cua_sales_khac)).toBe(false);
    expect(r.total).toBe(6);
  });

  it("§12.3 lọc quá hạn / hôm nay / lâu chưa cập nhật", async () => {
    const id = ids.mg5_500;
    await as(c, sales, (db) => db.query("select public.log_demand_activity($1, $2, 'call', 'Gọi', null, 'Gọi lại', now() - interval '2 day', 'verified')", [id, uuid()]));
    expect(keysOf(await search(sales, { followup: "overdue" }))).toEqual(["mg5_500"]);
    await sys.query("update public.demands set next_action_due = (((now() at time zone 'Asia/Ho_Chi_Minh')::date)::timestamp + interval '23 hour') at time zone 'Asia/Ho_Chi_Minh' where id = $1", [id]);
    expect(keysOf(await search(sales, { followup: "today" }))).toEqual(["mg5_500"]);
    await sys.query("update public.demands set last_activity_at = now() - interval '30 day' where id = $1", [ids.vf8_khong_ro_gia]);
    const stale = await search(sales, { followup: "stale" });
    expect(keysOf(stale)).toEqual(["vf8_khong_ro_gia"]);
    expect((stale.rows[0] as unknown as { is_stale: boolean }).is_stale).toBe(true);
  });

  it("phân trang phía server trả tổng số đúng", async () => {
    const page = await as(c, sales, async (db) => (await db.query("select public.search_demands('{}'::jsonb, 2, 2) r")).rows[0].r);
    expect(page.total).toBe(6);
    expect(page.rows).toHaveLength(2);
  });
});
