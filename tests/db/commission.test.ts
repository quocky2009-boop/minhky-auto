/**
 * Hoa hồng nhân viên bán hàng (chặng 6 lát 10). Chính sách của Chủ tịch: số tiền theo từng đầu xe — xe mới theo hãng/model, xe cũ theo đúng số VIN.
 * Chạy SQL dưới vai trò `authenticated` của từng người (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, bigAccount, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const shift = (days: number) => new Date(Date.now() + 7 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
const M = (n: number) => String(n * 1_000_000);

d("Hoa hồng — chặng 6 lát 10 (database thật)", () => {
  let sys: Client, cM: Client, cM2: Client, cK: Client, cA: Client, cB: Client;
  let manager: string, accountant: string, salesA: string, salesB: string;
  let acct = "";

  beforeAll(async () => {
    sys = await connect(); cM = await connect(); cM2 = await connect(); cK = await connect(); cA = await connect(); cB = await connect();
    acct = await bigAccount(sys);
    manager = await createUser(sys, "QL Hoa hồng", ["manager"]);
    accountant = await createUser(sys, "KT Hoa hồng", ["accountant"]);
    salesA = await createUser(sys, "Sales A Hoa hồng", ["sales"]);
    salesB = await createUser(sys, "Sales B Hoa hồng", ["sales"]);
  });
  afterAll(async () => { for (const c of [sys, cM, cM2, cK, cA, cB]) await c.end(); });

  const call = <T = string>(client: Client, user: string | null, sql: string, params: unknown[] = []): Promise<T> =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0]?.r as T);
  const count = (client: Client, user: string | null, sql: string, params: unknown[] = []) => as(client, user, async (db) => Number((await db.query(sql, params)).rows[0].n));
  const tag = () => uuid().slice(0, 6).toUpperCase();

  /** Xe sẵn bán. `condition` new → hãng/model; used → VIN. */
  const car = async (o: { condition: "new" | "used"; make: string; model: string; vin?: string }) => {
    const v = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), condition: o.condition, make: o.make, model: o.model, business_type: "owned", source_type: o.condition === "new" ? "manufacturer" : "individual",
      year_made: "2024", asking_price: M(900), purchase_price: M(800), floor_price: M(1), ...(o.vin ? { vin: o.vin } : {}) })]);
    await as(cM, manager, async (db) => db.query("select public.update_vehicle($1, $2, $3::jsonb)", [v,
      (await db.query("select version from public.vehicles where id = $1", [v])).rows[0].version, JSON.stringify({ sale_status: "available", prep_status: "ready", paperwork_status: "complete" })]));
    const ids = (await sys.query("select make_id, model_id from public.vehicles where id = $1", [v])).rows[0] as { make_id: string; model_id: string };
    return { v, ...ids };
  };
  const sell = async (v: string, seller = salesA, client: Client = cA, price = 900) => {
    const dem = await call(client, seller, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "buy", customer: { full_name: "Khách " + tag() } })]);
    const o = await call(client, seller, "select public.create_sales_order($1::jsonb) r", [JSON.stringify({ request_id: uuid(), demand_id: dem, lines: [{ vehicle_id: v, sale_price: M(price) }] })]);
    await as(cM, manager, async (db) => db.query("select public.confirm_sales_order($1, $2, $3::jsonb)", [o, (await sys.query("select version from public.sales_orders where id = $1", [o])).rows[0].version,
      JSON.stringify({ contract_ref: "HĐB-HH" + tag(), contract_date: TODAY, approval_reason: "Giá thấp chấp nhận" })]));
    const line = (await sys.query("select id from public.sales_order_lines where order_id = $1", [o])).rows[0].id as string;
    return { o, line };
  };
  const entry = async (line: string) => (await sys.query("select id, code, status, amount::text a, employee_id, rule_id, version, rule_snapshot from public.commission_entries where order_line_id = $1", [line])).rows[0] as
    { id: string; code: string; status: string; a: string | null; employee_id: string; rule_id: string | null; version: number; rule_snapshot: { code: string } | null };
  const rule = (user: string, p: Record<string, unknown>, client: Client = cM) =>
    call(client, user, "select public.create_commission_rule($1::jsonb) r", [JSON.stringify({ request_id: uuid(), effective_from: shift(-1), ...p })]);
  const modelRule = (make: string, model: string | null, amount: number, extra: Record<string, unknown> = {}) => rule(manager, { scope: "model", make_id: make, model_id: model, amount: M(amount), ...extra });
  const recalc = (user: string, id: string, client: Client = cM) => as(client, user, async (db) => db.query("select public.recalc_commission($1, $2)", [id, (await sys.query("select version from public.commission_entries where id = $1", [id])).rows[0].version]));
  const approve = (user: string, id: string, client: Client = cM) => as(client, user, async (db) => db.query("select public.approve_commission($1, $2)", [id, (await sys.query("select version from public.commission_entries where id = $1", [id])).rows[0].version]));
  const pay = (user: string, id: string, amount: string, extra: Record<string, unknown> = {}, client: Client = cK) =>
    call(client, user, "select public.record_commission_payment($1::jsonb) r", [JSON.stringify({ request_id: uuid(), entry_id: id, amount, account_id: acct, paid_on: TODAY, ...extra })]);
  const account = (opening: string) => call(cM, manager, "select public.create_money_account($1::jsonb) r", [JSON.stringify({ request_id: uuid(), name: "TK HH " + tag(), kind: "cash", opening_balance: opening })]);
  const bal = async (a: string) => Number((await sys.query("select private.account_balance($1)::text b", [a])).rows[0].b);

  it("QUY TẮC: chỉ quản lý ghi; hình dạng theo xe mới (hãng/model) hoặc xe cũ (VIN); model thuộc đúng hãng; trùng khóa+ngày bị chặn; không sửa, hủy cần lý do; sales không đọc", async () => {
    const x = await car({ condition: "new", make: "MkA" + tag(), model: "ModelA" });
    const y = await car({ condition: "new", make: "MkB" + tag(), model: "ModelB" });
    await expect(rule(accountant, { scope: "model", make_id: x.make_id, amount: M(5) }, cK)).rejects.toThrow(/Chỉ quản lý được ghi quy tắc|row-level security/);
    await expect(rule(salesA, { scope: "model", make_id: x.make_id, amount: M(5) }, cA)).rejects.toThrow(/Chỉ quản lý được ghi quy tắc|row-level security/);
    await expect(rule(manager, { scope: "model", amount: M(5) })).rejects.toThrow(/commission_rules_shape|violates/);
    await expect(rule(manager, { scope: "vin", amount: M(5) })).rejects.toThrow(/commission_rules_shape|violates/);
    await expect(rule(manager, { scope: "vin", vin: "ABC123", make_id: x.make_id, amount: M(5) })).rejects.toThrow(/commission_rules_shape|violates/);
    await expect(rule(manager, { scope: "model", make_id: x.make_id, model_id: y.model_id, amount: M(5) })).rejects.toThrow(/không thuộc hãng/);
    await expect(rule(manager, { scope: "model", make_id: x.make_id, amount: "-1" })).rejects.toThrow(/commission_rules_amount_check|violates/);
    const r1 = await modelRule(x.make_id, x.model_id, 15);
    await expect(modelRule(x.make_id, x.model_id, 20)).rejects.toThrow(/cùng đối tượng và cùng ngày hiệu lực/);
    await modelRule(x.make_id, x.model_id, 20, { effective_from: shift(5) });                  // ngày hiệu lực khác → được
    const rv = await rule(manager, { scope: "vin", vin: "  vin" + tag() + "x1 ", amount: M(3) });
    expect((await sys.query("select vin from public.commission_rules where id = $1", [rv])).rows[0].vin).toMatch(/^VIN[0-9A-F]{6}X1$/);   // chuẩn hóa chữ hoa, bỏ khoảng trắng
    await expect(sys.query("update public.commission_rules set amount = 1 where id = $1", [r1])).rejects.toThrow(/Không sửa quy tắc hoa hồng/);
    const ver = (await sys.query("select version from public.commission_rules where id = $1", [r1])).rows[0].version;
    await expect(as(cM, manager, (db) => db.query("select public.void_commission_rule($1, $2, ' ')", [r1, ver]))).rejects.toThrow(/Ghi lý do hủy/);
    await expect(as(cK, accountant, (db) => db.query("select public.void_commission_rule($1, $2, 'x')", [r1, ver]))).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    await as(cM, manager, (db) => db.query("select public.void_commission_rule($1, $2, 'Nhập sai mức')", [r1, ver]));
    await modelRule(x.make_id, x.model_id, 16);                                                // khóa cũ đã hủy → ghi lại được
    expect(await count(cK, accountant, "select count(*)::int n from public.commission_rules")).toBeGreaterThan(0);
    expect(await count(cA, salesA, "select count(*)::int n from public.commission_rules")).toBe(0);
    await expect(as(cM, manager, (db) => db.query("delete from public.commission_rules"))).rejects.toThrow(/permission denied/);
    await expect(as(cA, null, (db) => db.query("select count(*) from public.commission_rules"))).rejects.toThrow(/permission denied/);
  });

  it("XE MỚI theo hãng/model: quy tắc model ưu tiên hơn quy tắc cả hãng; model khác của hãng dùng mức cả hãng; hãng khác hoặc quy tắc chưa hiệu lực → 'chưa có quy tắc' (không phải 0)", async () => {
    const mk = "MkC" + tag();
    const a = await car({ condition: "new", make: mk, model: "Alpha" });
    const b = await car({ condition: "new", make: mk, model: "Beta" });
    const o = await car({ condition: "new", make: "MkD" + tag(), model: "Other" });
    await modelRule(a.make_id, null, 8);                                                       // cả hãng 8 tr
    await modelRule(a.make_id, a.model_id, 15);                                                // riêng Alpha 15 tr
    await modelRule(o.make_id, o.model_id, 99, { effective_from: shift(10) });                 // chưa hiệu lực
    const sa = await sell(a.v), sb = await sell(b.v), so = await sell(o.v);
    const ea = await entry(sa.line), eb = await entry(sb.line), eo = await entry(so.line);
    expect([ea.status, ea.a]).toEqual(["accrued", M(15)]);
    expect([eb.status, eb.a]).toEqual(["accrued", M(8)]);
    expect([eo.status, eo.a, eo.rule_id]).toEqual(["no_rule", null, null]);
    expect(ea.employee_id).toBe(salesA);
    expect(ea.rule_snapshot?.code).toMatch(/^QH\d+$/);
    // ngày hiệu lực mới nhất ≤ ngày ký được áp: thêm mức mới hôm qua cho Alpha chỉ ảnh hưởng đơn SAU đó, không đổi khoản đã tính
    await modelRule(a.make_id, a.model_id, 25, { effective_from: TODAY });
    expect((await entry(sa.line)).a).toBe(M(15));
    const a2 = await car({ condition: "new", make: mk, model: "Alpha" });
    expect((await entry((await sell(a2.v)).line)).a).toBe(M(25));
  });

  it("XE CŨ theo đúng số VIN: đúng VIN mới có hoa hồng; VIN khác, xe thiếu VIN, hoặc quy tắc model/hãng KHÔNG áp cho xe cũ", async () => {
    const vin = "RL4" + tag() + "USED01";
    const mk = "MkE" + tag();
    const u1 = await car({ condition: "used", make: mk, model: "Gamma", vin });
    const u2 = await car({ condition: "used", make: mk, model: "Gamma", vin: "RL4" + tag() + "USED02" });
    const u3 = await car({ condition: "used", make: mk, model: "Gamma" });
    await rule(manager, { scope: "vin", vin: vin.toLowerCase(), amount: M(5) });
    await modelRule(u1.make_id, u1.model_id, 12);                                              // quy tắc xe mới: không áp cho xe cũ
    const e1 = await entry((await sell(u1.v)).line), e2 = await entry((await sell(u2.v)).line), e3 = await entry((await sell(u3.v)).line);
    expect([e1.status, e1.a]).toEqual(["accrued", M(5)]);
    expect([e2.status, e2.a]).toEqual(["no_rule", null]);
    expect([e3.status, e3.a]).toEqual(["no_rule", null]);
    // xe mới có VIN trùng quy tắc VIN: không áp (quy tắc VIN chỉ cho xe cũ)
    const nv = "RL4" + tag() + "NEW001";
    const n1 = await car({ condition: "new", make: mk, model: "Delta", vin: nv });
    await rule(manager, { scope: "vin", vin: nv, amount: M(7) });
    expect((await entry((await sell(n1.v)).line)).status).toBe("no_rule");
  });

  it("KHOẢN HOA HỒNG: chỉ nhân viên phụ trách đơn thấy của mình; quản lý tính lại → duyệt; kế toán/sales không duyệt; đã duyệt không đổi số tiền; hủy cần lý do", async () => {
    const mk = "MkF" + tag();
    const c = await car({ condition: "new", make: mk, model: "Eps" });
    const s = await sell(c.v);                                                                 // chưa có quy tắc khi bán
    let e = await entry(s.line);
    expect(e.status).toBe("no_rule");
    expect(await count(cA, salesA, "select count(*)::int n from public.commission_entries where id = $1", [e.id])).toBe(1);
    expect(await count(cB, salesB, "select count(*)::int n from public.commission_entries where id = $1", [e.id])).toBe(0);
    expect(await count(cK, accountant, "select count(*)::int n from public.commission_entries where id = $1", [e.id])).toBe(1);
    await expect(approve(manager, e.id)).rejects.toThrow(/chưa tính theo quy tắc/);          // chưa có quy tắc → không duyệt được
    await modelRule(c.make_id, c.model_id, 10);
    await expect(recalc(accountant, e.id, cK)).rejects.toThrow(/Chỉ quản lý được tính lại/);
    await expect(recalc(salesA, e.id, cA)).rejects.toThrow(/Chỉ quản lý được tính lại/);
    await recalc(manager, e.id);
    e = await entry(s.line);
    expect([e.status, e.a]).toEqual(["accrued", M(10)]);
    await expect(approve(accountant, e.id, cK)).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    await expect(approve(salesA, e.id, cA)).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    await approve(manager, e.id);
    e = await entry(s.line);
    expect(e.status).toBe("approved");
    await expect(sys.query("update public.commission_entries set amount = 1 where id = $1", [e.id])).rejects.toThrow(/Chỉ quản lý|đã duyệt|permission/);
    await expect(recalc(manager, e.id)).rejects.toThrow(/đã duyệt\/hủy|vừa được cập nhật/);
    // sales không tự sửa/duyệt/hủy/tạo khoản của mình
    await expect(as(cA, salesA, (db) => db.query("update public.commission_entries set amount = 999000000 where id = $1", [e.id]))).resolves.toBeDefined();   // RLS: 0 dòng bị ảnh hưởng
    expect((await entry(s.line)).a).toBe(M(10));
    await expect(as(cA, salesA, (db) => db.query("insert into public.commission_entries (order_line_id, order_id, vehicle_id, employee_id, sold_on) values ($1, $2, $3, $4, $5)", [s.line, s.o, c.v, salesA, TODAY]))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, async (db) => db.query("select public.cancel_commission($1, $2, ' ')", [e.id, e.version]))).rejects.toThrow(/Ghi lý do hủy/);
  });

  it("CHI HOA HỒNG: chỉ cho khoản đã duyệt; nhiều lần, tổng không vượt; vào sổ quỹ và chỉ khi đủ tiền; hủy khoản chi mở lại; khoản đã chi không hủy được; hai khoản chi song song chỉ một thắng", async () => {
    const mk = "MkG" + tag();
    const c = await car({ condition: "new", make: mk, model: "Zeta" });
    await modelRule(c.make_id, c.model_id, 10);
    const s = await sell(c.v);
    const e = await entry(s.line);
    const a1 = await account("0");
    await expect(pay(accountant, e.id, M(1), { account_id: a1 })).rejects.toThrow(/đã được quản lý duyệt/);   // chưa duyệt
    await approve(manager, e.id);
    await expect(pay(salesA, e.id, M(1), { account_id: a1 }, cA)).rejects.toThrow(/Chỉ kế toán hoặc quản lý|row-level security/);
    await expect(pay(accountant, e.id, M(1), { account_id: a1 })).rejects.toThrow(/không đủ tiền thực có/);
    const a2 = await account(M(30));
    await pay(accountant, e.id, M(4), { account_id: a2 });
    expect(await bal(a2)).toBe(26_000_000);
    await expect(pay(accountant, e.id, M(7), { account_id: a2 })).rejects.toThrow(/vượt khoản hoa hồng đã duyệt/);
    await expect(pay(accountant, e.id, M(1), { account_id: a2, paid_on: shift(3) })).rejects.toThrow(/không được ở tương lai/);
    const p2 = await pay(manager, e.id, M(6), { account_id: a2 }, cM);                         // đủ 10 tr
    expect(await bal(a2)).toBe(20_000_000);
    expect((await as(cK, accountant, (db) => db.query("select paid::text p, remaining::text r from public.commission_balances where entry_id = $1", [e.id]))).rows[0]).toEqual({ p: M(10), r: "0" });
    // sales xem được tình trạng chi của chính mình, không xem của người khác
    expect(await count(cA, salesA, "select count(*)::int n from public.commission_payments where entry_id = $1", [e.id])).toBe(2);
    expect(await count(cB, salesB, "select count(*)::int n from public.commission_payments where entry_id = $1", [e.id])).toBe(0);
    // khoản đã chi không hủy được; hủy khoản chi cần quản lý + lý do; sau đó nghĩa vụ mở lại và quỹ hoàn lại
    await expect(as(cM, manager, async (db) => db.query("select public.cancel_commission($1, $2, 'Đổi ý')", [e.id, (await entry(s.line)).version]))).rejects.toThrow(/đã có chi trả/);
    await expect(as(cK, accountant, (db) => db.query("select public.void_commission_payment($1, 'nhầm')", [p2]))).rejects.toThrow(/Không tìm thấy khoản chi|không có quyền/);
    await expect(as(cM, manager, (db) => db.query("select public.void_commission_payment($1, ' ')", [p2]))).rejects.toThrow(/Ghi lý do hủy/);
    await as(cM, manager, (db) => db.query("select public.void_commission_payment($1, 'Ghi nhầm tài khoản')", [p2]));
    expect(await bal(a2)).toBe(26_000_000);
    expect((await as(cK, accountant, (db) => db.query("select remaining::text r from public.commission_balances where entry_id = $1", [e.id]))).rows[0].r).toBe(M(6));
    // hai khoản chi song song cùng vượt số dư: chỉ một thắng (khóa theo khoản và theo tài khoản)
    const a3 = await account(M(8));
    const results = await Promise.allSettled([pay(accountant, e.id, M(5), { account_id: a3 }, cK), pay(manager, e.id, M(5), { account_id: a3 }, cM2)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await bal(a3)).toBe(3_000_000);
  });

  it("ĐƠN BÁN HỦY: khoản hoa hồng chưa chi bị hủy theo; đã chi thì không hủy được đơn cho đến khi hủy khoản chi; khoản chi nằm trong sổ quỹ", async () => {
    const mk = "MkH" + tag();
    const c1 = await car({ condition: "new", make: mk, model: "Eta" });
    const c2 = await car({ condition: "new", make: mk, model: "Theta" });
    await modelRule(c1.make_id, null, 6);
    const s1 = await sell(c1.v), s2 = await sell(c2.v);
    const cancelOrder = (o: string) => as(cM, manager, async (db) => db.query("select public.cancel_sales_order($1, $2, 'Khách hủy')", [o, (await sys.query("select version from public.sales_orders where id = $1", [o])).rows[0].version]));
    await cancelOrder(s1.o);
    expect(await entry(s1.line)).toMatchObject({ status: "cancelled" });
    // đơn 2: duyệt + chi → không hủy được đơn
    const e2 = await entry(s2.line);
    await approve(manager, e2.id);
    const a = await account(M(20));
    const pid = await pay(accountant, e2.id, M(2), { account_id: a });
    await expect(cancelOrder(s2.o)).rejects.toThrow(/hoa hồng đã chi/);
    await as(cM, manager, (db) => db.query("select public.void_commission_payment($1, 'Chưa chi thật')", [pid]));
    await cancelOrder(s2.o);
    expect((await entry(s2.line)).status).toBe("cancelled");
  });

  it("BÁO CÁO: hoa hồng đã duyệt trừ vào kết quả toàn showroom; chưa duyệt và chưa có quy tắc được đếm riêng, không trừ", async () => {
    const totals = async () => (await as(cM, manager, async (db) => (await db.query("select public.report_results_totals($1::date, $1::date) r", [TODAY])).rows[0].r)) as Record<string, string | number>;
    const t0 = await totals();
    const mk = "MkI" + tag();
    const a = await car({ condition: "new", make: mk, model: "Iota" });
    const b = await car({ condition: "new", make: mk, model: "Kappa" });
    const c = await car({ condition: "new", make: "MkJ" + tag(), model: "Lambda" });
    await modelRule(a.make_id, null, 9);
    const sa = await sell(a.v);
    await sell(b.v);
    await sell(c.v);
    await approve(manager, (await entry(sa.line)).id);                                         // đã duyệt 9 tr; sb chưa duyệt; sc chưa có quy tắc
    const t1 = await totals();
    expect(BigInt(String(t1.commission_approved)) - BigInt(String(t0.commission_approved))).toBe(BigInt(M(9)));
    expect(Number(t1.commission_pending) - Number(t0.commission_pending)).toBe(1);
    expect(Number(t1.commission_no_rule) - Number(t0.commission_no_rule)).toBe(1);
    // kết quả toàn showroom đã trừ đúng 9 tr hoa hồng đã duyệt (ba xe: mua 800, bán 900 → sau chi phí mỗi xe 100 tr nếu có giá mua)
    const gross = (k: string) => BigInt(String(t1[k])) - BigInt(String(t0[k]));
    expect(gross("showroom_result")).toBe(gross("result_after_costs") - BigInt(M(9)));
    // sales không gọi được báo cáo
    expect(await as(cA, salesA, async (db) => (await db.query("select public.report_results_totals($1::date, $1::date) r", [TODAY])).rows[0].r)).toEqual({});
  });
});
