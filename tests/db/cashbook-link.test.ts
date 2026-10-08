/**
 * Nối sổ quỹ với vốn góp / khoản vay / chi phí xe (D87, migration 2100): số dư tài khoản phản ánh tiền thật của các nguồn đó,
 * ghi một lần (không phiếu trùng), chi chỉ khi đủ tiền, hủy dòng thu không làm quỹ âm, bên là công ty không gắn tài khoản.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;

d("Sổ quỹ nối vốn góp / vay / chi phí xe — D87 (database thật)", () => {
  let sys: Client, c: Client, c2: Client;
  let manager: string, accountant: string, sales: string;

  beforeAll(async () => {
    sys = await connect(); c = await connect(); c2 = await connect();
    manager = await createUser(sys, "QL Quỹ-vốn", ["manager"]);
    accountant = await createUser(sys, "KT Quỹ-vốn", ["accountant"]);
    sales = await createUser(sys, "Sales Quỹ-vốn", ["sales"]);
  });
  afterAll(async () => { await sys.end(); await c.end(); await c2.end(); });

  const call = <T = string>(user: string, sql: string, params: unknown[] = [], client: Client = c): Promise<T> =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0]?.r as T);
  const account = (opening = "0") => call(manager, "select public.create_money_account($1::jsonb) r", [JSON.stringify({ request_id: uuid(), name: "TK " + uuid().slice(0, 8), kind: "cash", opening_balance: opening })]);
  const balance = async (acc: string) => as(c, manager, async (db) => (await db.query("select balance::text b, total_in::text i, total_out::text o from public.money_account_balances where id = $1", [acc])).rows[0] as { b: string; i: string; o: string });
  const party = (name: string, kind = "individual") => call(manager, "select public.create_capital_party($1::jsonb) r", [JSON.stringify({ request_id: uuid(), name, kind, phone: "0911222333" })]);
  const vehicle = () => call(manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
    request_id: uuid(), condition: "used", make: "Kia", model: "Seltos", business_type: "owned", source_type: "individual", year_made: "2021" })]);
  const entry = (user: string, v: string, p: string, type: string, amount: string, extra: Record<string, unknown> = {}, client: Client = c) =>
    call(user, "select public.record_capital_entry($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: v, party_id: p, entry_type: type, amount, ...extra })], client);
  const voidEntry = (user: string, id: string) => as(c, user, (db) => db.query("select public.void_capital_entry($1, 'nhập nhầm')", [id]));

  /** Xe + một bên cá nhân và công ty, điều khoản 70/30 đã duyệt. */
  const setup = async () => {
    const v = await vehicle();
    const ext = await party("Bên ngoài " + uuid().slice(0, 6));
    const co = await party("Công ty " + uuid().slice(0, 6), "company");
    const t = await call(manager, "select public.create_capital_terms($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), vehicle_id: v, company_rate: "20", cost_basis: "all_confirmed_costs", loss_policy: "Lỗ chia theo vốn",
      shares: [{ party_id: ext, ratio_percent: "70" }, { party_id: co, ratio_percent: "30" }] })]);
    await as(c, manager, async (db) => db.query("select public.approve_capital_terms($1, $2)", [t, (await sys.query("select version from public.vehicle_capital_terms where id = $1", [t])).rows[0].version]));
    return { v, ext, co };
  };

  it("Vốn thực nhận vào quỹ, rút vốn ra khỏi quỹ: một dòng sổ gốc, không phiếu trùng; cam kết không vào quỹ", async () => {
    const { v, ext } = await setup();
    const acc = await account("0");
    await entry(manager, v, ext, "commitment", "500000000");
    expect(await balance(acc)).toEqual({ b: "0", i: "0", o: "0" });
    const r = await entry(accountant, v, ext, "receipt", "300000000", { account_id: acc });
    expect(await balance(acc)).toEqual({ b: "300000000", i: "300000000", o: "0" });
    await entry(accountant, v, ext, "withdrawal", "100000000", { account_id: acc });
    expect(await balance(acc)).toEqual({ b: "200000000", i: "300000000", o: "100000000" });
    expect((await sys.query("select count(*)::int n from public.cash_vouchers where account_id = $1", [acc])).rows[0].n).toBe(0);   // không tạo phiếu trùng
    // hủy dòng đã nhận trong khi đã rút: vốn ròng sẽ âm → chặn (luật cũ); hủy dòng rút trước rồi mới hủy nhận được
    await expect(voidEntry(manager, r)).rejects.toThrow(/vốn thực nhận ròng âm/);
  });

  it("Bắt buộc chọn tài khoản cho tiền thật của bên ngoài; cam kết và bên là công ty KHÔNG gắn tài khoản", async () => {
    const { v, ext, co } = await setup();
    const acc = await account("1000000");
    await expect(entry(accountant, v, ext, "receipt", "1000")).rejects.toThrow(/Chọn tài khoản tiền/);
    await expect(entry(manager, v, ext, "commitment", "1000", { account_id: acc })).rejects.toThrow(/Vốn cam kết chưa phải tiền thật/);
    await expect(entry(accountant, v, co, "receipt", "1000", { account_id: acc })).rejects.toThrow(/Bên là công ty/);
    await entry(accountant, v, co, "receipt", "1000");   // tiền công ty đã nằm trong sổ quỹ
    expect(await balance(acc)).toEqual({ b: "1000000", i: "0", o: "0" });
  });

  it("Chi chỉ khi tài khoản đủ tiền; tài khoản ngừng dùng và ngày tương lai bị chặn; không đổi tài khoản của dòng đã ghi", async () => {
    const { v, ext } = await setup();
    const acc = await account("0");
    await entry(accountant, v, ext, "receipt", "50000000", { account_id: acc });
    await entry(accountant, v, ext, "receipt", "50000000", { account_id: await account("0") });   // vốn ròng 100tr, nhưng tài khoản này chỉ có 50tr
    await expect(entry(accountant, v, ext, "withdrawal", "50000001", { account_id: acc })).rejects.toThrow(/không đủ tiền thực có/);
    await expect(entry(accountant, v, ext, "receipt", "1000", { account_id: acc, entry_date: "2099-01-01" })).rejects.toThrow(/không được ở tương lai/);
    const other = await account("0");
    const e = await entry(accountant, v, ext, "receipt", "1000", { account_id: acc });
    await expect(sys.query("update public.vehicle_capital_entries set account_id = $1 where id = $2", [other, e])).rejects.toThrow(/Không đổi tài khoản tiền/);
  });

  it("Khoản vay: nhận gốc vào quỹ, trả gốc/lãi ra khỏi quỹ; hủy khoản vay đã chi hết tiền bị chặn; bên là công ty không gắn tài khoản", async () => {
    const { v, co } = await setup();
    const lender = await party("Chị Lan " + uuid().slice(0, 6));
    const acc = await account("0");
    const loan = await call(manager, "select public.create_vehicle_loan($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), vehicle_id: v, party_id: lender, principal: "200000000", drawn_date: "2026-10-01", interest_terms: "1%/tháng", account_id: acc })]);
    expect(await balance(acc)).toEqual({ b: "200000000", i: "200000000", o: "0" });
    const pay = (kind: string, amount: string, extra: Record<string, unknown> = { account_id: acc }, loanId = loan) =>
      call(accountant, "select public.record_loan_payment($1::jsonb) r", [JSON.stringify({ request_id: uuid(), loan_id: loanId, kind, amount, ...extra })]);
    await pay("principal", "150000000");
    await pay("interest", "2000000");
    expect(await balance(acc)).toEqual({ b: "48000000", i: "200000000", o: "152000000" });
    await expect(pay("interest", "1", {})).rejects.toThrow(/Chọn tài khoản tiền/);
    // tiền vay đã trả đi: hủy khoản vay (nếu không còn thanh toán) sẽ làm quỹ âm → các luật cũ chặn trước (đã có thanh toán); ở đây kiểm tra hủy dòng thu không âm quỹ
    await expect(call(manager, "select public.void_vehicle_loan($1, 'nhập nhầm') r", [loan])).rejects.toThrow(/đã có thanh toán/);
    await expect(call(manager, "select public.create_vehicle_loan($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), vehicle_id: v, party_id: co, principal: "1000", drawn_date: "2026-10-01", interest_terms: "x", account_id: acc })])).rejects.toThrow(/Bên là công ty/);
    // khoản vay không có thanh toán, nhưng tiền đã bị chi đi bằng nguồn khác → hủy làm quỹ âm → chặn
    const acc2 = await account("0");
    const loan2 = await call(manager, "select public.create_vehicle_loan($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), vehicle_id: v, party_id: lender, principal: "10000000", drawn_date: "2026-10-01", interest_terms: "x", account_id: acc2 })]);
    await call(manager, "select public.record_cost_payment($1::jsonb) r", [JSON.stringify({ request_id: uuid(), cost_id: await confirmedCost(v), amount: "9000000", account_id: acc2 })]);
    await expect(call(manager, "select public.void_vehicle_loan($1, 'nhập nhầm') r", [loan2])).rejects.toThrow(/làm tài khoản tiền âm/);
  });

  const confirmedCost = async (v: string, amount = "20000000") => {
    const id = await call(accountant, "select public.create_vehicle_cost($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: v, category: "repair", description: "Sửa", estimated_amount: amount })]);
    await as(c, manager, async (db) => db.query("select public.approve_vehicle_cost($1, $2, true)", [id, (await db.query("select version from public.vehicle_costs where id = $1", [id])).rows[0].version]));
    await as(c, manager, async (db) => db.query("select public.confirm_vehicle_cost($1, $2, $3::jsonb)", [id, (await db.query("select version from public.vehicle_costs where id = $1", [id])).rows[0].version, JSON.stringify({ confirmed_amount: amount })]));
    return id;
  };

  it("Thanh toán chi phí xe ra khỏi quỹ; hủy thanh toán hoàn lại quỹ; thiếu tài khoản hoặc thiếu tiền bị chặn", async () => {
    const { v } = await setup();
    const acc = await account("5000000");
    const cost = await confirmedCost(v);
    const pay = (amount: string, extra: Record<string, unknown> = { account_id: acc }) =>
      call(accountant, "select public.record_cost_payment($1::jsonb) r", [JSON.stringify({ request_id: uuid(), cost_id: cost, amount, ...extra })]);
    await expect(pay("1000", {})).rejects.toThrow(/Chọn tài khoản tiền/);
    await expect(pay("5000001")).rejects.toThrow(/không đủ tiền thực có/);
    const p = await pay("3000000");
    expect(await balance(acc)).toEqual({ b: "2000000", i: "0", o: "3000000" });
    await as(c, manager, (db) => db.query("select public.void_cost_payment($1, 'ghi nhầm')", [p]));
    expect(await balance(acc)).toEqual({ b: "5000000", i: "0", o: "0" });
  });

  it("Hai khoản chi song song cùng vượt số dư: chỉ một khoản thành công (khóa theo tài khoản, chung với phiếu thu/chi)", async () => {
    const { v, ext } = await setup();
    const acc = await account("0");
    await entry(accountant, v, ext, "receipt", "100000000", { account_id: acc });
    const cost = await confirmedCost(v, "200000000");
    const results = await Promise.allSettled([
      call(accountant, "select public.record_cost_payment($1::jsonb) r", [JSON.stringify({ request_id: uuid(), cost_id: cost, amount: "70000000", account_id: acc })], c),
      entry(accountant, v, ext, "withdrawal", "70000000", { account_id: acc }, c2),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(Number((await balance(acc)).b)).toBe(30000000);
  });

  it("Hủy dòng nhận vốn làm quỹ âm bị chặn; sales không thấy số dư", async () => {
    const { v, ext } = await setup();
    const acc = await account("0");
    const r = await entry(accountant, v, ext, "receipt", "10000000", { account_id: acc });
    const cost = await confirmedCost(v, "20000000");
    await call(accountant, "select public.record_cost_payment($1::jsonb) r", [JSON.stringify({ request_id: uuid(), cost_id: cost, amount: "9000000", account_id: acc })]);
    await expect(voidEntry(manager, r)).rejects.toThrow(/làm tài khoản tiền âm/);
    expect(await as(c, sales, async (db) => (await db.query("select count(*)::int n from public.money_account_balances")).rows[0].n)).toBe(0);
  });
});
