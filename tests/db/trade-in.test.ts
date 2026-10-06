/**
 * Chặng 5 (lát 5): thu cũ đổi mới — hai giao dịch liên kết, đối trừ là chứng từ riêng, xe cũ còn vay, hủy (database thật).
 * Chạy SQL dưới vai trò `authenticated` của từng người (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const M = (n: number) => String(n * 1_000_000);

d("Thu cũ đổi mới — chặng 5 lát 5 (database thật)", () => {
  let sys: Client, cM: Client, cM2: Client, cK: Client, cA: Client;
  let manager: string, accountant: string, salesA: string, tech: string;

  beforeAll(async () => {
    sys = await connect(); cM = await connect(); cM2 = await connect(); cK = await connect(); cA = await connect();
    manager = await createUser(sys, "QL Thu cũ", ["manager"]);
    accountant = await createUser(sys, "KT Thu cũ", ["accountant"]);
    salesA = await createUser(sys, "Sales Thu cũ", ["sales"]);
    tech = await createUser(sys, "KTV Thu cũ", ["technician"]);
  });
  afterAll(async () => { for (const c of [sys, cM, cM2, cK, cA]) await c.end(); });

  const call = <T = string>(client: Client, user: string | null, sql: string, params: unknown[] = []): Promise<T> =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0]?.r as T);
  const count = (client: Client, user: string | null, sql: string, params: unknown[] = []) =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0].n as number);
  const bal = async (acct: string) => Number((await sys.query("select private.account_balance($1)::text b", [acct])).rows[0].b);

  // ---- dữ liệu mẫu ----
  const phone = () => "09" + String(Math.floor(10_000_000 + Math.random() * 89_999_999));
  const setStatus = (vehicle: string, status: string) =>
    as(cM, manager, async (db) => {
      const ver = (await db.query("select version from public.vehicles where id = $1", [vehicle])).rows[0].version;
      return db.query("select public.update_vehicle($1, $2, $3::jsonb)", [vehicle, ver, JSON.stringify({ sale_status: status })]);
    });
  const newCar = async () => {
    const v = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), condition: "used", make: "Mazda", model: "CX-5", business_type: "owned", source_type: "individual", year_made: "2021",
      asking_price: M(900), purchase_price: M(700), floor_price: M(1) })]);
    await setStatus(v, "available");
    return v;
  };
  /** Khách mua xe mới + đã bán xe cũ cho showroom (xe cũ nhập kho nguồn thu cũ, giá mua P). */
  const scene = async (purchase = 200, price = 800) => {
    const ph = phone();
    const dBuy = await call(cA, salesA, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "buy", customer: { full_name: "Khách đổi xe", phone: ph } })]);
    const cust = (await sys.query("select customer_id from public.demands where id = $1", [dBuy])).rows[0].customer_id as string;
    const dSell = await sell(cust, purchase);
    const newV = await newCar();
    const order = await call(cA, salesA, "select public.create_sales_order($1::jsonb) r", [JSON.stringify({ request_id: uuid(), demand_id: dBuy, lines: [{ vehicle_id: newV, sale_price: M(price) }] })]);
    await as(cA, salesA, async (db) => db.query("select public.confirm_sales_order($1, $2, $3::jsonb)", [order, (await sys.query("select version from public.sales_orders where id = $1", [order])).rows[0].version, JSON.stringify({ contract_ref: "HĐB-TC", contract_date: TODAY })]));
    const old = await oldCar(dSell, purchase);
    return { order, newV, old, dBuy, dSell, cust };
  };
  /** Nhu cầu BÁN của cùng khách (xe cũ). */
  const sell = (cust: string, purchase = 200) =>
    call(cA, salesA, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "sell", customer_id: cust,
      sell_offer: { make: "toyota", model: "vios", year_made: "2018", asking_price: M(purchase), sale_mode: "trade_in" } })]);
  const oldCar = async (dSell: string, purchase: number | null = 200, source = "trade_in") => {
    const v = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), condition: "used", make: "Toyota", model: "Vios", business_type: "owned", source_type: source, year_made: "2018", ...(purchase ? { purchase_price: M(purchase) } : {}) })]);
    await sys.query("update public.vehicles set source_demand_id = $2 where id = $1", [v, dSell]);
    return v;
  };
  const tradeIn = (client: Client, user: string, order: string, old: string, extra: Record<string, unknown> = {}) =>
    call(client, user, "select public.create_trade_in($1::jsonb) r", [JSON.stringify({ request_id: uuid(), order_id: order, old_vehicle_id: old, ...extra })]);
  const tver = async (id: string) => (await sys.query("select version, status from public.trade_ins where id = $1", [id])).rows[0] as { version: number; status: string };
  const confirmTI = (client: Client, user: string, id: string) => as(client, user, async (db) => db.query("select public.confirm_trade_in($1, $2)", [id, (await tver(id)).version]));
  const cancelTI = (client: Client, user: string, id: string, reason = "Khách không bán xe cũ nữa") => as(client, user, async (db) => db.query("select public.cancel_trade_in($1, $2, $3)", [id, (await tver(id)).version, reason]));
  const offset = (client: Client, user: string, ti: string, amount: number | string, extra: Record<string, unknown> = {}) =>
    call(client, user, "select public.post_trade_in_offset($1::jsonb) r", [JSON.stringify({ request_id: uuid(), trade_in_id: ti, amount: typeof amount === "number" ? M(amount) : amount, ...extra })]);
  const overs = async (id: string) => (await sys.query("select version, status from public.trade_in_offsets where id = $1", [id])).rows[0] as { version: number; status: string };
  const voidOffset = (client: Client, user: string, id: string, reason = "Đối trừ nhầm") => as(client, user, async (db) => db.query("select public.void_trade_in_offset($1, $2, $3)", [id, (await overs(id)).version, reason]));
  const account = async (opening = "0") => call(cM, manager, "select public.create_money_account($1::jsonb) r", [JSON.stringify({ request_id: uuid(), name: "TK " + uuid().slice(0, 8), kind: "cash", opening_balance: opening })]);
  const voucher = (client: Client, user: string, acct: string, purpose: string, amount: string, extra: Record<string, unknown> = {}) => {
    const direction = ["sale_deposit", "sale_payment", "other_income"].includes(purpose) ? "in" : "out";
    return call(client, user, "select public.post_voucher($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), direction, purpose, account_id: acct, amount, occurred_on: TODAY, method: "cash", ...(direction === "in" ? { payer_kind: "customer" } : {}), counterparty: "", ...extra })]);
  };
  const tib = (id: string) => as(cK, accountant, async (db) => (await db.query(
    "select purchase_value::text pv, loan_payoff_amount::text l, customer_portion::text c, offsets::text o, paid_customer::text pc, paid_bank::text pb, payable_total::text pt, customer_remaining::text cr, bank_remaining::text br from public.trade_in_balances where trade_in_id = $1", [id])).rows[0]);
  const ob = (id: string) => as(cK, accountant, async (db) => (await db.query("select total::text t, paid_direct::text p, trade_in_offset::text off, outstanding::text o from public.sales_order_balances where order_id = $1", [id])).rows[0]);
  const cancelOrder = (id: string) => as(cM, manager, async (db) => db.query("select public.cancel_sales_order($1, $2, 'Khách hủy mua')", [id, (await sys.query("select version from public.sales_orders where id = $1", [id])).rows[0].version]));

  it("Phân quyền: chỉ quản lý lập/xác nhận/hủy hồ sơ và đối trừ; kế toán xem; sales/kỹ thuật/anon không đọc; không xóa", async () => {
    const s = await scene();
    for (const [cl, u] of [[cA, salesA], [cA, accountant], [cA, tech]] as const) {
      await expect(tradeIn(cl, u, s.order, s.old)).rejects.toThrow(/Chỉ quản lý|row-level security|Không tìm thấy/);
    }
    const ti = await tradeIn(cM, manager, s.order, s.old);
    for (const u of [manager, accountant]) expect(await count(cK, u, "select count(*)::int n from public.trade_ins where id = $1", [ti])).toBe(1);
    for (const [cl, u] of [[cA, salesA], [cA, tech]] as const) {
      expect(await count(cl, u, "select count(*)::int n from public.trade_ins")).toBe(0);
      expect(await count(cl, u, "select count(*)::int n from public.trade_in_offsets")).toBe(0);
      expect(await count(cl, u, "select count(*)::int n from public.trade_in_balances")).toBe(0);
    }
    await expect(as(cA, null, (db) => db.query("select count(*) from public.trade_ins"))).rejects.toThrow(/permission denied/);
    await expect(confirmTI(cK, accountant, ti)).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    await confirmTI(cM, manager, ti);
    await expect(offset(cK, accountant, ti, 10)).rejects.toThrow(/Chỉ quản lý|row-level security/);
    const off = await offset(cM, manager, ti, 10);
    await expect(voidOffset(cK, accountant, off)).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    await expect(as(cM, manager, (db) => db.query("delete from public.trade_ins where id = $1", [ti]))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("delete from public.trade_in_offsets where id = $1", [off]))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("update public.trade_ins set purchase_value = 1 where id = $1", [ti]))).rejects.toThrow(/Không đổi đơn bán, xe cũ/);
    await expect(as(cM, manager, (db) => db.query("update public.trade_in_offsets set amount = 1 where id = $1", [off]))).rejects.toThrow(/Không sửa khoản đối trừ/);
  });

  it("Điều kiện lập hồ sơ: xe cũ phải là xe sở hữu nguồn 'thu cũ', cùng khách, có giá mua; giá trị mua lấy từ hệ thống; khoản vay hợp lệ; một xe một hồ sơ; đơn đã hủy không lập", async () => {
    const s = await scene(200);
    const dOther = await call(cA, salesA, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "sell", customer: { full_name: "Người khác", phone: phone() }, sell_offer: { make: "kia", model: "k3", year_made: "2019", asking_price: M(300), sale_mode: "trade_in" } })]);
    await expect(tradeIn(cM, manager, s.order, await oldCar(dOther))).rejects.toThrow(/không thuộc khách của đơn bán/);
    await expect(tradeIn(cM, manager, s.order, await oldCar(await sell(s.cust), 200, "individual"))).rejects.toThrow(/nguồn "thu cũ đổi mới"/);
    await expect(tradeIn(cM, manager, s.order, await oldCar(await sell(s.cust), null))).rejects.toThrow(/chưa có giá mua/);
    await expect(tradeIn(cM, manager, s.order, s.old, { loan_payoff_amount: M(250), loan_bank: "VCB" })).rejects.toThrow(/trade_ins_loan_within_value|check/);
    await expect(tradeIn(cM, manager, s.order, s.old, { loan_payoff_amount: M(50) })).rejects.toThrow(/trade_ins_loan_bank_required|check/);
    const ti = await tradeIn(cM, manager, s.order, s.old, { loan_payoff_amount: M(50), loan_bank: "Vietcombank", purchase_value: "1" });
    expect((await sys.query("select purchase_value::text pv, customer_id from public.trade_ins where id = $1", [ti])).rows[0].pv).toBe(M(200));   // không tin giá gửi lên
    await expect(tradeIn(cM2, manager, s.order, s.old)).rejects.toThrow(/đã nằm trong một hồ sơ thu cũ/);
    // nháp sửa được; đã xác nhận thì không
    await as(cM, manager, async (db) => db.query("select public.update_trade_in_draft($1, $2, $3::jsonb)", [ti, (await tver(ti)).version, JSON.stringify({ loan_bank: "BIDV", loan_payoff_amount: M(60) })]));
    await confirmTI(cM, manager, ti);
    await expect(as(cM, manager, async (db) => db.query("select public.update_trade_in_draft($1, $2, '{}'::jsonb)", [ti, (await tver(ti)).version]))).rejects.toThrow(/không còn đang soạn/);
    await expect(as(cM, manager, (db) => db.query("update public.trade_ins set loan_payoff_amount = 1 where id = $1", [ti]))).rejects.toThrow(/không sửa khoản vay/);
    // hủy hồ sơ rồi lập lại cho cùng xe được; đơn đã hủy thì không lập
    await cancelTI(cM, manager, ti);
    const ti2 = await tradeIn(cM, manager, s.order, s.old);
    await cancelTI(cM, manager, ti2);
    await cancelOrder(s.order);
    await expect(tradeIn(cM, manager, s.order, s.old)).rejects.toThrow(/Đơn bán đã hủy/);
  });

  it("Luồng đầy đủ: bán 800 tr, xe cũ 200 tr còn vay 50 tr → đối trừ CHỈ từ phần khách 150 tr; hai giao dịch giữ nguyên giá trị; đối trừ không đổi quỹ; tiền còn phải trả = mua − đối trừ − đã chi; không khấu trừ hai lần", async () => {
    const s = await scene(200, 800);
    const ti = await tradeIn(cM, manager, s.order, s.old, { loan_payoff_amount: M(50), loan_bank: "Vietcombank" });
    await expect(offset(cM, manager, ti, 10)).rejects.toThrow(/chưa được xác nhận/);                   // hồ sơ nháp chưa đối trừ
    await confirmTI(cM, manager, ti);
    const acct = await account(M(500));
    const before = await bal(acct);
    expect(await tib(ti)).toMatchObject({ pv: M(200), l: M(50), c: M(150), o: "0", pt: M(200), cr: M(150), br: M(50) });
    expect(await ob(s.order)).toMatchObject({ t: M(800), p: "0", off: "0", o: M(800) });

    await expect(offset(cM, manager, ti, 151)).rejects.toThrow(/vượt phần của khách còn lại/);          // không lấy phần ngân hàng để đối trừ
    const off = await offset(cM, manager, ti, 100);
    expect(await bal(acct)).toBe(before);                                                                // đối trừ KHÔNG phải tiền thật
    expect(await ob(s.order)).toMatchObject({ t: M(800), off: M(100), o: M(700) });                      // giá bán đầy đủ vẫn là 800
    expect(await tib(ti)).toMatchObject({ pv: M(200), o: M(100), pt: M(100), cr: M(50), br: M(50) });
    expect((await sys.query("select purchase_price::text p from public.vehicle_financials where vehicle_id = $1", [s.old])).rows[0].p).toBe(M(200));   // giá mua xe cũ nguyên vẹn
    expect((await sys.query("select sale_price::text p from public.sales_order_lines where order_id = $1", [s.order])).rows[0].p).toBe(M(800));

    // chi cho khách: chỉ phần khách còn lại (50 tr); chi ngân hàng: chỉ khoản vay (50 tr)
    await expect(voucher(cK, accountant, acct, "tradein_payout", M(51), { trade_in_id: ti })).rejects.toThrow(/vượt phần của khách còn lại/);
    await voucher(cK, accountant, acct, "tradein_payout", M(30), { trade_in_id: ti });
    expect((await sys.query("select counterparty from public.cash_vouchers where trade_in_id = $1", [ti])).rows[0].counterparty).toBe("Khách đổi xe");
    await expect(offset(cM, manager, ti, 21)).rejects.toThrow(/vượt phần của khách còn lại/);          // 150 − 100 − 30 = 20
    await expect(voucher(cK, accountant, acct, "tradein_loan_payoff", M(51), { trade_in_id: ti })).rejects.toThrow(/vượt khoản vay/);
    await voucher(cK, accountant, acct, "tradein_loan_payoff", M(50), { trade_in_id: ti });
    expect((await sys.query("select counterparty from public.cash_vouchers where trade_in_id = $1 and purpose = 'tradein_loan_payoff'", [ti])).rows[0].counterparty).toBe("Vietcombank");
    await expect(voucher(cK, accountant, acct, "tradein_loan_payoff", "1", { trade_in_id: ti })).rejects.toThrow(/vượt khoản vay/);
    expect(await tib(ti)).toMatchObject({ pc: M(30), pb: M(50), pt: M(20), cr: M(20), br: "0" });
    await voucher(cK, accountant, acct, "tradein_payout", M(20), { trade_in_id: ti });
    expect(await tib(ti)).toMatchObject({ pt: "0", cr: "0" });
    expect(await bal(acct)).toBe(before - 100_000_000);                                                  // tiền thật ra: 30 + 50 + 20 = 100 tr
    // khách trả nốt phần còn lại của đơn bán bằng tiền: 800 − 100 đối trừ = 700
    await expect(voucher(cK, accountant, acct, "sale_payment", M(701), { order_id: s.order, payer_kind: "customer" })).rejects.toThrow(/vượt công nợ còn lại/);
    await voucher(cK, accountant, acct, "sale_payment", M(700), { order_id: s.order });
    expect(await ob(s.order)).toMatchObject({ p: M(700), off: M(100), o: "0" });
    expect(off).toBeTruthy();
  });

  it("Đối trừ không vượt công nợ đơn bán; xe cũ không vay thì không trả ngân hàng; hồ sơ nháp/đã hủy không chi; gửi lặp cùng request_id không sinh trùng", async () => {
    const s = await scene(300, 100);                          // đơn chỉ 100 tr, xe cũ 300 tr, không vay
    const ti = await tradeIn(cM, manager, s.order, s.old);
    const acct = await account(M(1000));
    await expect(voucher(cK, accountant, acct, "tradein_payout", M(10), { trade_in_id: ti })).rejects.toThrow(/chưa được xác nhận/);
    await confirmTI(cM, manager, ti);
    await expect(offset(cM, manager, ti, 101)).rejects.toThrow(/vượt công nợ còn lại của đơn bán/);
    await expect(voucher(cK, accountant, acct, "tradein_loan_payoff", M(1), { trade_in_id: ti })).rejects.toThrow(/không có khoản vay/);
    const rid = uuid();
    const post = () => call(cM, manager, "select public.post_trade_in_offset($1::jsonb) r", [JSON.stringify({ request_id: rid, trade_in_id: ti, amount: M(100) })]);
    const a = await post(), b = await post();
    expect(b).toBe(a);
    expect((await sys.query("select count(*)::int n from public.trade_in_offsets where trade_in_id = $1", [ti])).rows[0].n).toBe(1);
    expect(await ob(s.order)).toMatchObject({ o: "0" });
    await expect(voucher(cK, accountant, acct, "sale_payment", "1", { order_id: s.order })).rejects.toThrow(/vượt công nợ còn lại/);   // đơn đã trừ hết bằng đối trừ
    await voucher(cK, accountant, acct, "tradein_payout", M(200), { trade_in_id: ti });             // phần còn lại 200 tr trả khách bằng tiền
    expect(await tib(ti)).toMatchObject({ pt: "0" });
  });

  it("Hủy: đơn bán còn đối trừ KHÔNG hủy được; hủy đối trừ rồi mới hủy đơn; hồ sơ còn đối trừ/đã chi tiền KHÔNG hủy được; sau khi hủy hồ sơ thì không đối trừ/chi", async () => {
    const s = await scene(200, 800);
    const ti = await tradeIn(cM, manager, s.order, s.old, { loan_payoff_amount: M(50), loan_bank: "ACB" });
    await confirmTI(cM, manager, ti);
    const acct = await account(M(500));
    const off = await offset(cM, manager, ti, 100);
    await expect(cancelOrder(s.order)).rejects.toThrow(/còn khoản đối trừ thu cũ đổi mới/);
    await expect(cancelTI(cM, manager, ti)).rejects.toThrow(/còn khoản đối trừ hiệu lực/);
    await expect(voidOffset(cM, manager, off, "  ")).rejects.toThrow(/lý do/);
    await voidOffset(cM, manager, off, "Khách đồng ý nhận tiền mặt thay vì đối trừ");
    expect(await ob(s.order)).toMatchObject({ off: "0", o: M(800) });
    expect(await tib(ti)).toMatchObject({ o: "0", cr: M(150) });
    await expect(voidOffset(cM, manager, off)).rejects.toThrow(/vừa được cập nhật|đã hủy/);
    await expect(as(cM, manager, (db) => db.query("update public.trade_in_offsets set note = 'x' where id = $1", [off]))).rejects.toThrow(/Không sửa khoản đối trừ|đã hủy/);
    const pay = await voucher(cK, accountant, acct, "tradein_payout", M(40), { trade_in_id: ti });
    await expect(cancelTI(cM, manager, ti)).rejects.toThrow(/Đã chi tiền cho xe cũ/);
    await as(cM, manager, async (db) => db.query("select public.void_voucher($1, $2, 'Chi nhầm')", [pay, (await sys.query("select version from public.cash_vouchers where id = $1", [pay])).rows[0].version]));
    await cancelOrder(s.order);                                                                           // hết đối trừ + chưa nhận tiền → hủy được
    expect((await sys.query("select status from public.sales_orders where id = $1", [s.order])).rows[0].status).toBe("cancelled");
    expect((await tver(ti)).status).toBe("confirmed");                                                    // hồ sơ mua xe cũ vẫn còn (mua xe cũ là giao dịch riêng)
    await expect(offset(cM, manager, ti, 10)).rejects.toThrow(/đơn bán đã ký hợp đồng/);
    await cancelTI(cM, manager, ti, "Khách giữ lại xe cũ");
    await expect(voucher(cK, accountant, acct, "tradein_payout", M(1), { trade_in_id: ti })).rejects.toThrow(/chưa được xác nhận \(hoặc đã hủy\)/);
    await expect(confirmTI(cM, manager, ti)).rejects.toThrow(/vừa được cập nhật|không còn đang soạn/);
  });

  it("§12.10 Đồng thời: hai đối trừ cùng lúc vượt phần khách → một qua; đối trừ và thu tiền cùng lúc vượt công nợ đơn → một qua", async () => {
    const s = await scene(200, 800);
    const ti = await tradeIn(cM, manager, s.order, s.old);
    await confirmTI(cM, manager, ti);
    const res = await Promise.allSettled([offset(cM, manager, ti, 120), offset(cM2, manager, ti, 120)]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/vượt phần của khách còn lại/);
    expect(await tib(ti)).toMatchObject({ o: M(120), cr: M(80) });

    const s2 = await scene(500, 100);                          // đơn 100 tr; xe cũ 500 tr (không vay)
    const ti2 = await tradeIn(cM, manager, s2.order, s2.old);
    await confirmTI(cM, manager, ti2);
    const acct = await account("0");
    const r2 = await Promise.allSettled([offset(cM, manager, ti2, 70), voucher(cK, accountant, acct, "sale_payment", M(70), { order_id: s2.order })]);
    expect(r2.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((r2.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/vượt công nợ còn lại/);
    const o2 = await ob(s2.order);
    expect(Number(o2.o)).toBe(30_000_000);
  });
});
