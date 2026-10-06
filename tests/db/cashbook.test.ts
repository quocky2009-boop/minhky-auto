/**
 * Chặng 5 (lát 4): thu chi — tài khoản tiền, phiếu thu/chi, tiền cọc thực nhận/hoàn, công nợ đơn bán (database thật).
 * Chạy SQL dưới vai trò `authenticated` của từng người (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 31 * 3_600_000).toISOString().slice(0, 10);
const IN_DAYS = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

d("Thu chi — chặng 5 lát 4 (database thật)", () => {
  let sys: Client, cM: Client, cK: Client, cK2: Client, cA: Client;
  let manager: string, accountant: string, salesA: string, tech: string;

  beforeAll(async () => {
    sys = await connect(); cM = await connect(); cK = await connect(); cK2 = await connect(); cA = await connect();
    manager = await createUser(sys, "QL Thu chi", ["manager"]);
    accountant = await createUser(sys, "KT Thu chi", ["accountant"]);
    salesA = await createUser(sys, "Sales Thu chi", ["sales"]);
    tech = await createUser(sys, "KTV Thu chi", ["technician"]);
  });
  afterAll(async () => { for (const c of [sys, cM, cK, cK2, cA]) await c.end(); });

  const call = <T = string>(client: Client, user: string | null, sql: string, params: unknown[] = []): Promise<T> =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0]?.r as T);
  const count = (client: Client, user: string | null, sql: string, params: unknown[] = []) =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0].n as number);

  const account = (opening = "0", kind = "cash", name = "TK " + uuid().slice(0, 8)) =>
    call(cM, manager, "select public.create_money_account($1::jsonb) r", [JSON.stringify({ request_id: uuid(), name, kind, opening_balance: opening })]);
  const voucher = (client: Client, user: string, acct: string, purpose: string, amount: string, extra: Record<string, unknown> = {}) => {
    const direction = ["sale_deposit", "sale_payment", "other_income"].includes(purpose) ? "in" : "out";
    return call(client, user, "select public.post_voucher($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), direction, purpose, account_id: acct, amount, occurred_on: TODAY, method: "cash",
      ...(direction === "in" ? { payer_kind: "customer" } : {}), counterparty: "Nguyễn Văn Khách", ...extra })]);
  };
  const bal = async (acct: string) => Number((await sys.query("select private.account_balance($1)::text b", [acct])).rows[0].b);
  const vstatus = async (id: string) => (await sys.query("select version, status from public.cash_vouchers where id = $1", [id])).rows[0] as { version: number; status: string };
  const voidV = (client: Client, user: string, id: string, reason = "Nhập sai số tiền") =>
    as(client, user, async (db) => db.query("select public.void_voucher($1, $2, $3)", [id, (await vstatus(id)).version, reason]));

  // ---- đơn bán / cọc ----
  const setStatus = (vehicle: string, status: string) =>
    as(cM, manager, async (db) => {
      const ver = (await db.query("select version from public.vehicles where id = $1", [vehicle])).rows[0].version;
      return db.query("select public.update_vehicle($1, $2, $3::jsonb)", [vehicle, ver, JSON.stringify({ sale_status: status })]);
    });
  const vehicle = async () => {
    const v = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), condition: "used", make: "Mazda", model: "CX-5", business_type: "owned", source_type: "individual", year_made: "2021",
      asking_price: "700000000", purchase_price: "600000000", floor_price: "1000000" })]);
    await setStatus(v, "available");
    return v;
  };
  const demand = () => call(cA, salesA, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "buy", customer: { full_name: "Khách " + uuid().slice(0, 5) } })]);
  const deposit = (v: string, dem: string, amount = "30000000") =>
    call(cA, salesA, "select public.reserve_vehicle($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: v, demand_id: dem, kind: "deposit", deposit_amount: amount })]);
  const order = (dem: string, lines: [string, string][]) =>
    call(cA, salesA, "select public.create_sales_order($1::jsonb) r", [JSON.stringify({ request_id: uuid(), demand_id: dem, lines: lines.map(([v, p]) => ({ vehicle_id: v, sale_price: p })) })]);
  const ver = async (id: string) => (await sys.query("select version from public.sales_orders where id = $1", [id])).rows[0].version as number;
  const confirm = (id: string) => as(cA, salesA, async (db) => db.query("select public.confirm_sales_order($1, $2, $3::jsonb)", [id, await ver(id), JSON.stringify({ contract_ref: "HĐB-" + uuid().slice(0, 4), contract_date: TODAY })]));
  const cancelOrder = (id: string) => as(cM, manager, async (db) => db.query("select public.cancel_sales_order($1, $2, 'Khách hủy mua')", [id, await ver(id)]));
  const balances = (id: string) => as(cK, accountant, async (db) => (await db.query("select total::text t, paid_direct::text p, applied_deposit::text a, outstanding::text o from public.sales_order_balances where order_id = $1", [id])).rows[0] as { t: string; p: string; a: string; o: string | null });
  const asKT = (id: string) => as(cK, accountant, async (db) => (await db.query("select total::text t, paid_direct::text p, applied_deposit::text a, outstanding::text o from public.sales_order_balances where order_id = $1", [id])).rows[0]);

  it("Phân quyền: quản lý lập tài khoản; kế toán đọc + lập phiếu nhưng không lập/sửa tài khoản, không hủy phiếu; sales/kỹ thuật/anon không đọc, không ghi; không xóa", async () => {
    const a = await account("1000000", "cash");
    await expect(call(cK, accountant, "select public.create_money_account($1::jsonb) r", [JSON.stringify({ request_id: uuid(), name: "KT lập", kind: "cash" })])).rejects.toThrow(/Chỉ quản lý/);
    await expect(as(cK, accountant, async (db) => db.query("select public.update_money_account($1, 1, '{\"name\":\"đổi\"}'::jsonb)", [a]))).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    for (const [cl, u] of [[cA, salesA], [cA, tech]] as const) {
      expect(await count(cl, u, "select count(*)::int n from public.money_accounts")).toBe(0);
      expect(await count(cl, u, "select count(*)::int n from public.cash_vouchers")).toBe(0);
      expect(await count(cl, u, "select count(*)::int n from public.money_account_balances")).toBe(0);
      expect(await count(cl, u, "select count(*)::int n from public.sales_order_balances")).toBe(0);
      await expect(voucher(cl, u, a, "other_income", "1000")).rejects.toThrow(/Chỉ kế toán hoặc quản lý|row-level security/);
    }
    await expect(as(cA, null, (db) => db.query("select count(*) from public.cash_vouchers"))).rejects.toThrow(/permission denied/);
    const v = await voucher(cK, accountant, a, "other_income", "500000", { counterparty: "Cho thuê chỗ đậu xe" });
    expect(await count(cK, accountant, "select count(*)::int n from public.cash_vouchers where id = $1", [v])).toBe(1);
    await expect(voidV(cK, accountant, v)).rejects.toThrow(/Chỉ quản lý được hủy|vừa được cập nhật/);
    await expect(as(cM, manager, (db) => db.query("delete from public.cash_vouchers where id = $1", [v]))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("delete from public.money_accounts where id = $1", [a]))).rejects.toThrow(/permission denied/);
    await expect(as(cK, accountant, (db) => db.query("update public.cash_vouchers set amount = 1 where id = $1", [v]))).resolves.toMatchObject({ rowCount: 0 });   // RLS: kế toán không sửa được
    await expect(as(cM, manager, (db) => db.query("update public.cash_vouchers set amount = 1 where id = $1", [v]))).rejects.toThrow(/Không sửa phiếu/);
    // tên trùng, số dư đầu kỳ khóa khi đã có phiếu
    const dup = "tk TRÙNG " + uuid().slice(0, 8);
    await expect(account("0", "cash", dup)).resolves.toBeTruthy();
    await expect(account("0", "bank", "  " + dup.toUpperCase() + " ")).rejects.toThrow(/trùng tên/);
    await expect(as(cM, manager, async (db) => db.query("update public.money_accounts set opening_balance = 5 where id = $1", [a]))).rejects.toThrow(/không sửa số dư đầu kỳ/);
  });

  it("Phiếu: ngày không ở tương lai; hình thức khớp loại tài khoản; tài khoản ngừng dùng bị chặn; gửi lặp cùng request_id không sinh trùng; CHI chỉ khi đủ tiền thực có", async () => {
    const cash = await account("0", "cash"), bank = await account("0", "bank");
    await expect(voucher(cK, accountant, cash, "other_income", "1000000", { occurred_on: TOMORROW })).rejects.toThrow(/không được ở tương lai/);
    await expect(voucher(cK, accountant, bank, "other_income", "1000000", { method: "cash" })).rejects.toThrow(/không khớp loại tài khoản/);
    await expect(voucher(cK, accountant, cash, "other_income", "0")).rejects.toThrow(/amount|check/);
    await expect(voucher(cK, accountant, cash, "other_income", "1000000", { counterparty: "  " })).rejects.toThrow(/người nộp\/người nhận/);
    const rid = uuid();
    const post = () => call(cK, accountant, "select public.post_voucher($1::jsonb) r", [JSON.stringify({ request_id: rid, direction: "in", purpose: "other_income", account_id: cash, amount: "2000000", occurred_on: TODAY, method: "cash", payer_kind: "other", counterparty: "Đối tác" })]);
    const a = await post(), b = await post();
    expect(b).toBe(a);
    expect(await bal(cash)).toBe(2000000);
    await expect(voucher(cK, accountant, cash, "general_expense", "2000001")).rejects.toThrow(/không đủ tiền thực có/);
    await voucher(cK, accountant, cash, "general_expense", "2000000", { counterparty: "Điện lực" });
    expect(await bal(cash)).toBe(0);
    await as(cM, manager, async (db) => db.query("select public.update_money_account($1, $2, '{\"is_active\":false}'::jsonb)", [cash, (await sys.query("select version from public.money_accounts where id = $1", [cash])).rows[0].version]));
    await expect(voucher(cK, accountant, cash, "other_income", "1000")).rejects.toThrow(/ngừng sử dụng/);
  });

  it("§12.10 Đồng thời: hai phiếu CHI cùng lúc vượt tổng quỹ → chỉ một phiếu qua, quỹ không âm; hai phiếu thu cùng lúc vượt công nợ đơn → chỉ một qua", async () => {
    const acct = await account("0", "cash");
    await voucher(cK, accountant, acct, "other_income", "10000000", { payer_kind: "other", counterparty: "Vốn đầu kỳ" });
    for (let i = 0; i < 3; i++) {
      await voucher(cK, accountant, acct, "other_income", "10000000", { payer_kind: "other", counterparty: "Nạp quỹ" });   // đưa quỹ về ≥ 10 triệu mỗi vòng
      const before = await bal(acct);
      const res = await Promise.allSettled([voucher(cK, accountant, acct, "general_expense", String(before - 1000), { counterparty: "A" }), voucher(cK2, manager, acct, "general_expense", String(before - 1000), { counterparty: "B" })]);
      expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(String((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/không đủ tiền thực có/);
      expect(await bal(acct)).toBe(1000);
      await voucher(cK, accountant, acct, "general_expense", "1000", { counterparty: "Dọn quỹ" });
    }
    // công nợ đơn
    const v = await vehicle(), dem = await demand(), o = await order(dem, [[v, "100000000"]]);
    await confirm(o);
    const pay = (c: Client, u: string) => voucher(c, u, acct, "sale_payment", "60000000", { order_id: o });
    const r2 = await Promise.allSettled([pay(cK, accountant), pay(cK2, manager)]);
    expect(r2.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((r2.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/vượt công nợ còn lại/);
    expect(await balances(o)).toMatchObject({ p: "60000000", o: "40000000" });
  });

  it("Tiền cọc: chỉ ghi cho đặt cọc; không vượt số cọc thỏa thuận; cọc KHÔNG phải thanh toán; khi cọc thành đơn bán thì tính vào 'đã thu' của đơn; không thu vượt công nợ", async () => {
    const acct = await account("0", "cash"), v = await vehicle(), dem = await demand();
    const hold = await call(cA, salesA, "select public.reserve_vehicle($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: await vehicle(), demand_id: dem, kind: "hold", valid_until: IN_DAYS(2) })]);
    await expect(voucher(cK, accountant, acct, "sale_deposit", "1000000", { reservation_id: hold })).rejects.toThrow(/không phải giữ xe/);
    const r = await deposit(v, dem, "30000000");
    await expect(voucher(cK, accountant, acct, "sale_deposit", "30000001", { reservation_id: r })).rejects.toThrow(/vượt số tiền cọc thỏa thuận/);
    const dep1 = await voucher(cK, accountant, acct, "sale_deposit", "20000000", { reservation_id: r });
    expect((await sys.query("select counterparty from public.cash_vouchers where id = $1", [dep1])).rows[0].counterparty).toBe("Nguyễn Văn Khách");
    await expect(voucher(cK, accountant, acct, "sale_deposit", "10000001", { reservation_id: r })).rejects.toThrow(/vượt số tiền cọc thỏa thuận/);
    await voucher(cK, accountant, acct, "sale_deposit", "10000000", { reservation_id: r, payer_kind: "bank", method: "cash" });
    expect(await bal(acct)).toBe(30000000);
    expect(await as(cK, accountant, async (db) => (await db.query("select net_deposit::text n from public.reservation_deposit_balances where reservation_id = $1", [r])).rows[0].n)).toBe("30000000");
    expect(await count(cA, salesA, "select count(*)::int n from public.reservation_deposit_balances")).toBe(0);
    await expect(voucher(cK, accountant, acct, "other_income", "1", { order_id: uuid(), payer_kind: "other" })).rejects.toThrow(/voucher_links|check/);
    // đơn bán dùng cọc
    const o = await order(dem, [[v, "680000000"]]);
    await expect(voucher(cK, accountant, acct, "sale_payment", "1000000", { order_id: o })).rejects.toThrow(/đã ký hợp đồng/);      // đơn nháp chưa nhận thanh toán
    await confirm(o);
    expect(await balances(o)).toMatchObject({ t: "680000000", p: "0", a: "30000000", o: "650000000" });
    await expect(voucher(cK, accountant, acct, "sale_payment", "650000001", { order_id: o })).rejects.toThrow(/vượt công nợ còn lại/);
    await voucher(cK, accountant, acct, "sale_payment", "300000000", { order_id: o, method: "cash" });
    expect(await balances(o)).toMatchObject({ p: "300000000", o: "350000000" });
    expect(await asKT(o)).toMatchObject({ o: "350000000" });
    await voucher(cK, accountant, acct, "sale_payment", "350000000", { order_id: o });
    expect(await balances(o)).toMatchObject({ o: "0" });
    await expect(voucher(cK, accountant, acct, "sale_payment", "1", { order_id: o })).rejects.toThrow(/vượt công nợ/);
    // cọc đang áp vào đơn không hoàn trực tiếp
    await expect(voucher(cK, accountant, acct, "deposit_refund", "1000000", { reservation_id: r, payer_kind: undefined })).rejects.toThrow(/hoàn qua đơn bán/);
    expect(await bal(acct)).toBe(680000000);
  });

  it("Hoàn tiền & hủy: đơn đã nhận thanh toán KHÔNG hủy được cho tới khi hoàn; hoàn không vượt đã thu; sau khi hủy đơn thì hoàn cọc; cọc hủy → hoàn cọc; không hoàn vượt", async () => {
    const acct = await account("0", "cash"), v = await vehicle(), dem = await demand();
    const r = await deposit(v, dem, "30000000");
    await voucher(cK, accountant, acct, "sale_deposit", "30000000", { reservation_id: r });
    const o = await order(dem, [[v, "680000000"]]);
    await confirm(o);
    await voucher(cK, accountant, acct, "sale_payment", "100000000", { order_id: o });
    await expect(cancelOrder(o)).rejects.toThrow(/nhận thanh toán chưa hoàn/);
    await expect(voucher(cK, accountant, acct, "sale_refund", "100000001", { order_id: o })).rejects.toThrow(/vượt số thanh toán/);
    await voucher(cK, accountant, acct, "sale_refund", "40000000", { order_id: o });
    await expect(cancelOrder(o)).rejects.toThrow(/nhận thanh toán chưa hoàn/);
    await voucher(cK, accountant, acct, "sale_refund", "60000000", { order_id: o });
    expect(await balances(o)).toMatchObject({ p: "0", a: "30000000" });
    await cancelOrder(o);                                                                     // đã hoàn hết thanh toán trực tiếp → hủy được
    expect(await balances(o)).toMatchObject({ a: "0", o: null });                             // cọc không còn áp vào đơn đã hủy
    await expect(voucher(cK, accountant, acct, "sale_payment", "1", { order_id: o })).rejects.toThrow(/đã ký hợp đồng/);
    await expect(voucher(cK, accountant, acct, "deposit_refund", "30000001", { reservation_id: r })).rejects.toThrow(/vượt số cọc đã thu/);
    const refund = await voucher(cK, accountant, acct, "deposit_refund", "30000000", { reservation_id: r });
    expect(await bal(acct)).toBe(0);
    await expect(voucher(cK, accountant, acct, "deposit_refund", "1", { reservation_id: r })).rejects.toThrow(/không đủ tiền thực có|vượt số cọc/);
    expect((await sys.query("select purpose from public.cash_vouchers where id = $1", [refund])).rows[0].purpose).toBe("deposit_refund");

    // cọc bị hủy → hoàn cọc; cọc còn hiệu lực thì không hoàn
    const v2 = await vehicle(), dem2 = await demand(), r2 = await deposit(v2, dem2, "10000000");
    await voucher(cK, accountant, acct, "sale_deposit", "10000000", { reservation_id: r2 });
    await expect(voucher(cK, accountant, acct, "deposit_refund", "1000", { reservation_id: r2 })).rejects.toThrow(/Chỉ hoàn cọc khi cọc đã hủy/);
    await as(cM, manager, async (db) => db.query("select public.cancel_deposit($1, $2, 'Khách đổi ý')", [r2, (await sys.query("select version from public.vehicle_reservations where id = $1", [r2])).rows[0].version]));
    await expect(voucher(cK, accountant, acct, "sale_deposit", "1", { reservation_id: r2 })).rejects.toThrow(/đã kết thúc/);
    await voucher(cK, accountant, acct, "deposit_refund", "10000000", { reservation_id: r2 });
    expect(await bal(acct)).toBe(0);
  });

  it("Hủy phiếu: chỉ quản lý, bắt buộc lý do; phiếu hủy không còn tính vào quỹ/công nợ; không hủy phiếu thu làm quỹ âm hoặc khi đã có phiếu hoàn; hủy rồi không sửa; hủy lặp bị chặn", async () => {
    const acct = await account("0", "cash"), v = await vehicle(), dem = await demand(), o = await order(dem, [[v, "100000000"]]);
    await confirm(o);
    const p1 = await voucher(cK, accountant, acct, "sale_payment", "60000000", { order_id: o });
    expect(await balances(o)).toMatchObject({ p: "60000000", o: "40000000" });
    await expect(voidV(cM, manager, p1, "  ")).rejects.toThrow(/lý do/);
    const refund = await voucher(cK, accountant, acct, "sale_refund", "10000000", { order_id: o });
    await expect(voidV(cM, manager, p1)).rejects.toThrow(/đã có phiếu hoàn tiền/);
    await voidV(cM, manager, refund, "Hoàn nhầm khách");
    expect(await balances(o)).toMatchObject({ p: "60000000" });
    await voucher(cK, accountant, acct, "general_expense", "55000000", { counterparty: "Chi nhầm" });
    await expect(voidV(cM, manager, p1)).rejects.toThrow(/làm tài khoản tiền âm/);              // quỹ chỉ còn 5 triệu
    const out = (await sys.query("select id from public.cash_vouchers where purpose = 'general_expense' and account_id = $1", [acct])).rows[0].id as string;
    await voidV(cM, manager, out, "Chi nhầm");
    await voidV(cM, manager, p1, "Thu nhầm đơn");
    expect(await balances(o)).toMatchObject({ p: "0", o: "100000000" });
    expect(await bal(acct)).toBe(0);
    expect((await sys.query("select status, void_reason, voided_by from public.cash_vouchers where id = $1", [p1])).rows[0]).toMatchObject({ status: "voided", void_reason: "Thu nhầm đơn", voided_by: manager });
    await expect(voidV(cM, manager, p1)).rejects.toThrow(/vừa được cập nhật|đã hủy/);
    await expect(as(cM, manager, (db) => db.query("update public.cash_vouchers set note = 'sửa' where id = $1", [p1]))).rejects.toThrow(/Không sửa phiếu|đã hủy/);
    expect(await count(cK, accountant, "select count(*)::int n from public.cash_vouchers where account_id = $1", [acct])).toBe(3);   // phiếu hủy vẫn lưu
    // hủy phiếu thanh toán rồi ghi lại đúng số
    await voucher(cK, accountant, acct, "sale_payment", "100000000", { order_id: o });
    expect(await balances(o)).toMatchObject({ o: "0" });
  });
});
