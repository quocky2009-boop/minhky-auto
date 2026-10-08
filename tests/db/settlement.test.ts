/**
 * Chặng 5 (lát 7): quyết toán xe — chia lợi nhuận góp vốn, hoàn vốn, ký gửi, chi trả, điều chỉnh (database thật).
 * Chạy SQL dưới vai trò `authenticated` của từng người (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, bigAccount, createUser, uuid } from "./helpers";
import { computeProfitSplit } from "../../src/lib/profit-split";

const d = DB_URL ? describe : describe.skip;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const M = (n: number) => String(n * 1_000_000);

d("Quyết toán xe — chặng 5 lát 7 (database thật)", () => {
  let acct = "";
  let sys: Client, cM: Client, cM2: Client, cK: Client, cK2: Client, cA: Client;
  let manager: string, accountant: string, salesA: string, tech: string;

  beforeAll(async () => {
    sys = await connect(); cM = await connect(); cM2 = await connect(); cK = await connect(); cK2 = await connect(); cA = await connect();
    acct = await bigAccount(sys);
    manager = await createUser(sys, "QL Quyết toán", ["manager"]);
    accountant = await createUser(sys, "KT Quyết toán", ["accountant"]);
    salesA = await createUser(sys, "Sales Quyết toán", ["sales"]);
    tech = await createUser(sys, "KTV Quyết toán", ["technician"]);
  });
  afterAll(async () => { for (const c of [sys, cM, cM2, cK, cK2, cA]) await c.end(); });

  const call = <T = string>(client: Client, user: string | null, sql: string, params: unknown[] = []): Promise<T> =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0]?.r as T);
  const count = (client: Client, user: string | null, sql: string, params: unknown[] = []) =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0].n as number);
  const vehicleUpdate = (v: string, patch: Record<string, unknown>) =>
    as(cM, manager, async (db) => {
      const ver = (await db.query("select version from public.vehicles where id = $1", [v])).rows[0].version;
      return db.query("select public.update_vehicle($1, $2, $3::jsonb)", [v, ver, JSON.stringify(patch)]);
    });

  // ---------- dựng dữ liệu ----------
  const party = (name: string, kind = "individual") => call(cM, manager, "select public.create_capital_party($1::jsonb) r", [JSON.stringify({ request_id: uuid(), name: name + " " + uuid().slice(0, 4), kind })]);
  const cost = async (v: string, amount: string, extra: Record<string, unknown> = {}) => {
    const id = await call(cK, accountant, "select public.create_vehicle_cost($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: v, category: "repair", description: "Sửa chữa", estimated_amount: amount, ...extra })]);
    await confirmCost(id, amount);
    return id;
  };
  const costVer = async (id: string) => (await sys.query("select version from public.vehicle_costs where id = $1", [id])).rows[0].version as number;
  const confirmCost = async (id: string, amount: string) =>
    as(cM, manager, async (db) => db.query("select public.confirm_vehicle_cost($1, $2, $3::jsonb)", [id, await costVer(id), JSON.stringify({ confirmed_amount: amount, accepted_note: "OK" })]));

  type Own = { v: string; shares: { party_id: string; ratio_percent: string; name?: string; kind?: string }[]; net: Record<string, string> };
  /** Xe sở hữu: giá mua, các bên góp vốn (tỷ lệ + vốn thực nhận), điều khoản đã duyệt. */
  const ownedCar = async (purchase: number, parts: { name: string; ratio: string; paid: number; kind?: string }[], opts: { rate?: string; basis?: string | null; loss?: string | null } = {}): Promise<Own> => {
    const v = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), condition: "used", make: "Mazda", model: "CX-5", business_type: "owned", source_type: "individual", year_made: "2021", asking_price: M(900), purchase_price: M(purchase), floor_price: M(1) })]);
    const shares: Own["shares"] = [];
    const net: Record<string, string> = {};
    const ids: string[] = [];
    for (const p of parts) {
      const id = await party(p.name, p.kind ?? "individual");
      ids.push(id);
      shares.push({ party_id: id, ratio_percent: p.ratio });
    }
    const t = await call(cM, manager, "select public.create_capital_terms($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), vehicle_id: v, company_rate: opts.rate ?? "20", cost_basis: opts.basis === undefined ? "all_confirmed_costs" : opts.basis,
      loss_policy: opts.loss === undefined ? "Hoàn vốn theo thỏa thuận, lỗ chia theo vốn" : opts.loss, shares })]);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].paid > 0) { await call(cK, accountant, "select public.record_capital_entry($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: v, party_id: ids[i], entry_type: "receipt", amount: M(parts[i].paid), ...(parts[i].kind === "company" ? {} : { account_id: acct }) })]); net[ids[i]] = M(parts[i].paid); }
    }
    await as(cM, manager, async (db) => db.query("select public.approve_capital_terms($1, $2)", [t, (await sys.query("select version from public.vehicle_capital_terms where id = $1", [t])).rows[0].version]));
    await vehicleUpdate(v, { sale_status: "available", prep_status: "ready", paperwork_status: "complete" });
    return { v, shares, net };
  };
  const demand = () => call(cA, salesA, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "buy", customer: { full_name: "Khách " + uuid().slice(0, 5) } })]);
  const sellOrder = async (v: string, price: number) => {
    const dem = await demand();
    const o = await call(cA, salesA, "select public.create_sales_order($1::jsonb) r", [JSON.stringify({ request_id: uuid(), demand_id: dem, lines: [{ vehicle_id: v, sale_price: M(price) }] })]);
    await as(cM, manager, async (db) => db.query("select public.confirm_sales_order($1, $2, $3::jsonb)", [o, (await sys.query("select version from public.sales_orders where id = $1", [o])).rows[0].version,
      JSON.stringify({ contract_ref: "HĐB-QT", contract_date: TODAY, approval_reason: "Giá thấp chấp nhận" })]));
    const line = (await sys.query("select id from public.sales_order_lines where order_id = $1", [o])).rows[0].id as string;
    return { o, line };
  };
  const account = (opening = "0") => call(cM, manager, "select public.create_money_account($1::jsonb) r", [JSON.stringify({ request_id: uuid(), name: "TK " + uuid().slice(0, 8), kind: "cash", opening_balance: opening })]);
  const voucher = (client: Client, user: string, acct: string, purpose: string, amount: string, extra: Record<string, unknown> = {}) => {
    const dir = ["sale_deposit", "sale_payment", "other_income", "settle_owner_receipt"].includes(purpose) ? "in" : "out";
    return call(client, user, "select public.post_voucher($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), direction: dir, purpose, account_id: acct, amount, occurred_on: TODAY, method: "cash", ...(dir === "in" ? { payer_kind: "customer" } : {}), counterparty: "", ...extra })]);
  };
  const payOrder = (acct: string, o: string, amount: string) => voucher(cK, accountant, acct, "sale_payment", amount, { order_id: o });
  const create = (client: Client, user: string, line: string, extra: Record<string, unknown> = {}) =>
    call(client, user, "select public.create_settlement($1::jsonb) r", [JSON.stringify({ request_id: uuid(), order_line_id: line, ...extra })]);
  const sver = async (id: string) => (await sys.query("select version, status from public.settlements where id = $1", [id])).rows[0] as { version: number; status: string };
  const check = (client: Client, user: string, id: string) => as(client, user, async (db) => db.query("select public.check_settlement($1, $2)", [id, (await sver(id)).version]));
  const approve = (client: Client, user: string, id: string) => as(client, user, async (db) => db.query("select public.approve_settlement($1, $2)", [id, (await sver(id)).version]));
  const cancel = (client: Client, user: string, id: string, reason = "Tính sai") => as(client, user, async (db) => db.query("select public.cancel_settlement($1, $2, $3)", [id, (await sver(id)).version, reason]));
  const revise = (client: Client, user: string, id: string, reason = "Chi phí sửa chữa phát sinh muộn") =>
    call(client, user, "select public.revise_settlement($1::jsonb) r", [JSON.stringify({ request_id: uuid(), settlement_id: id, reason })]);
  const lines = async (id: string) => (await sys.query("select kind, party_id, label, amount::text a, direction from public.settlement_lines where settlement_id = $1 order by line_no", [id])).rows as { kind: string; party_id: string | null; label: string; a: string; direction: string }[];
  const settle = async (id: string) => (await sys.query("select distributable::text p, company_operating::text c, remainder::text r, result, fee_amount::text f, costs_deducted::text k, status from public.settlements where id = $1", [id])).rows[0] as Record<string, string>;
  const blockers = (id: string, forApproval = true) => as(cK, accountant, async (db) => (await db.query("select public.settlement_blockers($1, $2) r", [id, forApproval])).rows[0].r as string[]);
  const bal = async (acct: string) => Number((await sys.query("select private.account_balance($1)::text b", [acct])).rows[0].b);
  const lineOf = async (id: string, kind: string, partyId?: string) => (await sys.query("select id from public.settlement_lines where settlement_id = $1 and kind = $2 and party_id is not distinct from $3", [id, kind, partyId ?? null])).rows[0].id as string;
  const pay = (id: string, acct: string, purpose: string, line: string, amount: string, client = cK, user = accountant) => voucher(client, user, acct, purpose, amount, { settlement_line_id: line });
  const balances = (id: string) => as(cK, accountant, async (db) => (await db.query("select line_kind k, label, amount::text a, paid::text p, remaining::text r from public.settlement_balances where settlement_id = $1 order by line_no", [id])).rows as { k: string; label: string; a: string; p: string; r: string }[]);

  /** Quyết toán đã duyệt: xe sở hữu bán `sale` tr; đơn đã thu đủ. */
  const approvedOwned = async (purchase: number, sale: number, parts: { name: string; ratio: string; paid: number; kind?: string }[], opts: { rate?: string; costs?: number } = {}) => {
    const car = await ownedCar(purchase, parts, { rate: opts.rate });
    await cost(car.v, M(opts.costs ?? 0));
    const so = await sellOrder(car.v, sale);
    const acct = await account(M(2000));
    await payOrder(acct, so.o, M(sale));
    const s = await create(cK, accountant, so.line);
    await check(cK, accountant, s);
    await approve(cM, manager, s);
    return { ...car, ...so, s, acct };
  };

  it("VÍ DỤ CHỐT: P = 40 tr, công ty 20%, vốn 60/40 → công ty 8 tr; hai bên 19,2 / 12,8 tr; hoàn vốn = vốn thực nhận; khớp công thức TypeScript; kết quả không đổi ví dụ test thành mặc định", async () => {
    const car = await ownedCar(600, [{ name: "Bên A", ratio: "60", paid: 100 }, { name: "Bên B", ratio: "40", paid: 50 }]);
    await cost(car.v, "0");                                            // không phát sinh chi phí: ghi khoản xác nhận 0 đồng
    const so = await sellOrder(car.v, 640);
    const s = await create(cK, accountant, so.line, { note: "Tạm tính" });
    expect(await settle(s)).toMatchObject({ p: M(40), c: M(8), r: M(32), result: "profit", status: "provisional" });
    const ls = await lines(s);
    expect(ls.filter((x) => x.kind === "profit_share").map((x) => x.a)).toEqual(["19200000", "12800000"]);
    expect(ls.find((x) => x.kind === "company_operating")?.a).toBe(M(8));
    expect(ls.filter((x) => x.kind === "capital_return").map((x) => x.a).sort()).toEqual([M(100), M(50)].sort());
    const ts = computeProfitSplit({ distributable: 40_000_000n, companyRate: "20%", termsApproved: true, participants: [{ id: "a", label: "A", ratio: "60%" }, { id: "b", label: "B", ratio: "40%" }] });
    expect(ts.ok && ts.companyOperatingShare).toBe(8_000_000n);
    expect(ts.ok && ts.shares.map((x) => x.amount)).toEqual([19_200_000n, 12_800_000n]);
    // dữ liệu giả lập: số tính trong DB = tổng P (không đếm trùng), các dòng chi bằng tiền thật chỉ có hoàn vốn và lợi nhuận bên ngoài
    expect(ls.reduce((a, x) => a + (["company_operating", "profit_share"].includes(x.kind) ? BigInt(x.a) : 0n), 0n)).toBe(40_000_000n);
    expect(ls.filter((x) => x.direction === "out")).toHaveLength(4);
  });

  it("Làm tròn: nhiều giá trị P và tỷ lệ lẻ — DATABASE khớp công thức TypeScript, tổng các phần luôn = P; chi phí đã xác nhận được trừ; công ty vừa góp vốn vừa vận hành không đếm trùng", async () => {
    const cases: { p: number; parts: { name: string; ratio: string; paid: number; kind?: string }[]; rate: string; costs: number }[] = [
      { p: 100, parts: [{ name: "A", ratio: "33.3334", paid: 10 }, { name: "B", ratio: "33.3333", paid: 10 }, { name: "C", ratio: "33.3333", paid: 10 }], rate: "20", costs: 0 },
      { p: 37, parts: [{ name: "A", ratio: "50", paid: 20 }, { name: "B", ratio: "30", paid: 12 }, { name: "Cty", ratio: "20", paid: 8, kind: "company" }], rate: "15.5", costs: 3 },
      { p: 7, parts: [{ name: "A", ratio: "12.5", paid: 5 }, { name: "B", ratio: "87.5", paid: 5 }], rate: "33.3333", costs: 1 },
    ];
    for (const cs of cases) {
      const purchase = 500;
      const car = await ownedCar(purchase, cs.parts, { rate: cs.rate });
      await cost(car.v, M(cs.costs));
      const so = await sellOrder(car.v, purchase + cs.costs + cs.p);
      const s = await create(cK, accountant, so.line);
      const st = await settle(s);
      expect(st.p).toBe(M(cs.p));                                                       // P = giá bán − giá mua − chi phí đã xác nhận
      const ts = computeProfitSplit({ distributable: BigInt(cs.p) * 1_000_000n, companyRate: `${cs.rate}%`, termsApproved: true,
        participants: cs.parts.map((x, i) => ({ id: String(i), label: x.name, ratio: `${x.ratio}%`, isCompany: x.kind === "company" })) });
      expect(ts.ok).toBe(true);
      if (!ts.ok) continue;
      expect(BigInt(st.c)).toBe(ts.companyOperatingShare);
      const shares = (await lines(s)).filter((x) => x.kind === "profit_share").map((x) => BigInt(x.a));
      expect(shares).toEqual(ts.shares.map((x) => x.amount));
      expect(BigInt(st.c) + shares.reduce((a, b) => a + b, 0n)).toBe(BigInt(cs.p) * 1_000_000n);   // tổng khớp P
    }
  });

  it("Công ty góp vốn: dòng của công ty là nội bộ (không có phiếu chi), bên ngoài có phiếu; quyết toán thiếu điều khoản/giá mua/căn cứ chi phí bị từ chối tạm tính", async () => {
    const car = await ownedCar(500, [{ name: "Ngoài", ratio: "60", paid: 30 }, { name: "Công ty", ratio: "40", paid: 20, kind: "company" }]);
    await cost(car.v, "0");
    const so = await sellOrder(car.v, 560);
    const s = await create(cK, accountant, so.line);
    const ls = await lines(s);
    expect(ls.filter((x) => x.label.startsWith("Công ty") && x.kind !== "company_operating").every((x) => x.direction === "none")).toBe(true);
    expect(ls.filter((x) => x.direction === "out").map((x) => x.kind).sort()).toEqual(["capital_return", "profit_share"]);
    // thiếu căn cứ chi phí / chưa có chi phí xác nhận / chưa có điều khoản → từ chối
    const noBasis = await ownedCar(500, [{ name: "X", ratio: "100", paid: 1 }], { basis: null });
    await expect(create(cK, accountant, (await sellOrder(noBasis.v, 600)).line)).rejects.toThrow(/Chưa chốt căn cứ chi phí/);
    const noCost = await ownedCar(500, [{ name: "X", ratio: "100", paid: 1 }]);
    await expect(create(cK, accountant, (await sellOrder(noCost.v, 600)).line)).rejects.toThrow(/Chưa có chi phí đã xác nhận.*0 đồng/);
    const vNoTerms = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({ request_id: uuid(), condition: "used", make: "Kia", model: "K3", business_type: "owned", source_type: "individual", year_made: "2020", asking_price: M(500), purchase_price: M(400), floor_price: M(1) })]);
    await vehicleUpdate(vNoTerms, { sale_status: "available" });
    await expect(create(cK, accountant, (await sellOrder(vNoTerms, 450)).line)).rejects.toThrow(/chưa có điều khoản chia lợi nhuận được duyệt/);
    const noPurchase = await ownedCar(500, [{ name: "X", ratio: "100", paid: 1 }]);
    await cost(noPurchase.v, "0");
    await sys.query("update public.vehicle_financials set purchase_price = null where vehicle_id = $1", [noPurchase.v]);
    await expect(create(cK, accountant, (await sellOrder(noPurchase.v, 600)).line)).rejects.toThrow(/chưa có giá mua/);
  });

  it("Phân quyền & quy trình: tạm tính/kiểm tra bởi kế toán; CHỈ quản lý phê duyệt; sales/kỹ thuật/anon không đọc; thiếu đủ tiền đơn → không duyệt; chi phí dự kiến chưa xác nhận → chặn; không xóa", async () => {
    const car = await ownedCar(600, [{ name: "A", ratio: "60", paid: 100 }, { name: "B", ratio: "40", paid: 50 }]);
    await cost(car.v, M(5));
    const so = await sellOrder(car.v, 700);
    await expect(create(cA, salesA, so.line)).rejects.toThrow(/Chỉ kế toán hoặc quản lý|row-level/);
    await expect(create(cA, tech, so.line)).rejects.toThrow(/Chỉ kế toán hoặc quản lý|row-level/);
    const s = await create(cK, accountant, so.line);
    for (const [cl, u] of [[cA, salesA], [cA, tech]] as const) {
      expect(await count(cl, u, "select count(*)::int n from public.settlements")).toBe(0);
      expect(await count(cl, u, "select count(*)::int n from public.settlement_lines")).toBe(0);
      expect(await count(cl, u, "select count(*)::int n from public.settlement_balances")).toBe(0);
    }
    await expect(as(cA, null, (db) => db.query("select count(*) from public.settlements"))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("delete from public.settlements where id = $1", [s]))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("delete from public.settlement_lines where settlement_id = $1", [s]))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("update public.settlements set sale_price = 1 where id = $1", [s]))).rejects.toThrow(/Không sửa số liệu quyết toán/);
    await expect(as(cM, manager, (db) => db.query("update public.settlement_lines set amount = 1 where settlement_id = $1", [s]))).rejects.toThrow(/Không sửa số tiền/);
    await expect(approve(cM, manager, s)).rejects.toThrow(/chưa được kiểm tra|vừa được cập nhật/);       // phải qua kiểm tra
    await check(cK, accountant, s);
    await expect(approve(cK, accountant, s)).rejects.toThrow(/Chỉ quản lý|vừa được cập nhật|không có quyền/);
    await expect(approve(cM, manager, s)).rejects.toThrow(/Đơn bán chưa thu đủ tiền/);                    // chưa thu đủ
    const acct = await account(M(2000));
    await payOrder(acct, so.o, M(699));
    expect(await blockers(s)).toEqual(["Đơn bán chưa thu đủ tiền: chưa phê duyệt quyết toán."]);
    await payOrder(acct, so.o, M(1));
    expect(await blockers(s)).toEqual([]);
    await approve(cM, manager, s);
    expect((await sver(s)).status).toBe("approved");
    expect((await sys.query("select checked_by, approved_by from public.settlements where id = $1", [s])).rows[0]).toMatchObject({ checked_by: accountant, approved_by: manager });

    // chi phí dự kiến chưa xác nhận chặn kiểm tra
    const car2 = await ownedCar(600, [{ name: "A", ratio: "100", paid: 10 }]);
    await cost(car2.v, M(2));
    await call(cK, accountant, "select public.create_vehicle_cost($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: car2.v, category: "repair", description: "Chưa nghiệm thu", estimated_amount: M(3) })]);
    const so2 = await sellOrder(car2.v, 700);
    const s2 = await create(cK, accountant, so2.line);
    await expect(check(cK, accountant, s2)).rejects.toThrow(/Còn 1 khoản chi phí dự kiến chưa xác nhận/);
  });

  it("Số liệu đổi sau khi tạm tính (chi phí muộn, giá mua) → không kiểm tra/duyệt: hủy và tính lại; hủy tạm tính cho tạo lại; một dòng xe một bản đang soạn (đồng thời → một thắng)", async () => {
    const car = await ownedCar(600, [{ name: "A", ratio: "100", paid: 10 }]);
    await cost(car.v, M(2));
    const so = await sellOrder(car.v, 700);
    const res = await Promise.allSettled([create(cK, accountant, so.line), create(cK2, accountant, so.line)]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/đang có một quyết toán tạm tính/);
    const s = (res.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<string>).value;
    await cost(car.v, M(4));                                                           // chi phí muộn sau khi tạm tính
    await expect(check(cK, accountant, s)).rejects.toThrow(/Số liệu đầu vào đã thay đổi/);
    await cancel(cK, accountant, s, "Có chi phí muộn, tính lại");
    expect((await sver(s)).status).toBe("cancelled");
    await expect(cancel(cK, accountant, s)).rejects.toThrow(/vừa được cập nhật|đã kết thúc/);
    const s2 = await create(cK, accountant, so.line);
    expect(await settle(s2)).toMatchObject({ k: M(6), p: M(94) });                     // 700 − 600 − (2 + 4)
    await expect(cancel(cK, accountant, s2, "  ")).rejects.toThrow(/lý do/);
    // gửi lặp cùng request_id
    const rid = uuid();
    await cancel(cK, accountant, s2, "Làm lại");
    const post = () => call(cK, accountant, "select public.create_settlement($1::jsonb) r", [JSON.stringify({ request_id: rid, order_line_id: so.line })]);
    const a = await post(), b = await post();
    expect(b).toBe(a);
  });

  it("Chi trả: chỉ theo quyết toán ĐÃ DUYỆT, đúng dòng/loại/hướng; không vượt phần còn lại; chi chỉ khi quỹ đủ tiền; dòng nội bộ của công ty không chi; hủy phiếu mở lại nghĩa vụ; tách hoàn vốn/lợi nhuận/đã trả/còn phải trả", async () => {
    const car = await ownedCar(600, [{ name: "A", ratio: "60", paid: 100 }, { name: "B", ratio: "40", paid: 50 }, { name: "Cty", ratio: "0.0001", paid: 0, kind: "company" }].slice(0, 2));
    await cost(car.v, "0");
    const so = await sellOrder(car.v, 640);
    const acct = await account(M(2000));
    await payOrder(acct, so.o, M(640));
    const s = await create(cK, accountant, so.line);
    const retA = await lineOf(s, "capital_return", car.shares[0].party_id), profA = await lineOf(s, "profit_share", car.shares[0].party_id);
    await expect(pay(s, acct, "settle_profit_payout", profA, "1000")).rejects.toThrow(/quyết toán đã được phê duyệt/);          // chưa duyệt
    await check(cK, accountant, s);
    await approve(cM, manager, s);
    expect(await balances(s)).toHaveLength(4);
    await expect(pay(s, acct, "settle_capital_return", profA, "1000")).rejects.toThrow(/không khớp dòng nghĩa vụ/);             // sai loại
    await expect(pay(s, acct, "settle_profit_payout", profA, "19200001")).rejects.toThrow(/vượt phần còn lại/);
    await expect(call(cA, salesA, "select public.post_voucher($1::jsonb) r", [JSON.stringify({ request_id: uuid(), direction: "out", purpose: "settle_profit_payout", account_id: acct, amount: "1", occurred_on: TODAY, method: "cash", settlement_line_id: profA })])).rejects.toThrow(/Chỉ kế toán hoặc quản lý|row-level/);
    const v1 = await pay(s, acct, "settle_profit_payout", profA, "10000000");
    expect(await balances(s).then((b) => b.find((x) => x.k === "profit_share" && x.a === "19200000"))).toMatchObject({ p: "10000000", r: "9200000" });
    await pay(s, acct, "settle_profit_payout", profA, "9200000");
    await expect(pay(s, acct, "settle_profit_payout", profA, "1")).rejects.toThrow(/vượt phần còn lại/);
    await pay(s, acct, "settle_capital_return", retA, M(100));
    expect((await sys.query("select counterparty from public.cash_vouchers where settlement_line_id = $1 and purpose = 'settle_capital_return'", [retA])).rows[0].counterparty).toMatch(/^A /);
    // quỹ không đủ tiền: chi vượt số dư bị chặn dù nghĩa vụ còn
    const poor = await account("0");
    await voucher(cK, accountant, poor, "other_income", M(5), { payer_kind: "other", counterparty: "Nạp" });
    const retB = await lineOf(s, "capital_return", car.shares[1].party_id);
    await expect(pay(s, poor, "settle_capital_return", retB, M(50))).rejects.toThrow(/không đủ tiền thực có/);
    // hủy phiếu mở lại nghĩa vụ
    await as(cM, manager, async (db) => db.query("select public.void_voucher($1, $2, 'Chi nhầm bên')", [v1, (await sys.query("select version from public.cash_vouchers where id = $1", [v1])).rows[0].version]));
    expect(await balances(s).then((b) => b.find((x) => x.k === "profit_share" && x.a === "19200000"))).toMatchObject({ p: "9200000", r: "10000000" });
    // đồng thời: hai phiếu cùng lúc vượt phần còn lại → một qua
    const profB = await lineOf(s, "profit_share", car.shares[1].party_id);
    const rr = await Promise.allSettled([pay(s, acct, "settle_profit_payout", profB, "8000000", cK, accountant), pay(s, acct, "settle_profit_payout", profB, "8000000", cK2, manager)]);
    expect(rr.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((rr.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/vượt phần còn lại/);
    // quyết toán đã có phiếu: không hủy được
    await expect(cancel(cM, manager, s)).rejects.toThrow(/đã có phiếu chi\/thu/);
  });

  it("Hòa vốn/lỗ: KHÔNG áp công thức; cần cách xử lý trong điều khoản VÀ quản lý ghi số hoàn vốn (0..vốn thực nhận); thiếu điều khoản xử lý → chặn", async () => {
    const car = await ownedCar(600, [{ name: "A", ratio: "60", paid: 100 }, { name: "B", ratio: "40", paid: 50 }]);
    await cost(car.v, M(5));
    const so = await sellOrder(car.v, 590);                                          // 590 − 600 − 5 = −15 tr
    const s = await create(cK, accountant, so.line);
    expect(await settle(s)).toMatchObject({ p: String(-15_000_000), result: "no_profit" });
    expect((await lines(s)).filter((x) => x.kind === "profit_share" || x.kind === "company_operating")).toHaveLength(0);     // không chia lãi
    expect(await blockers(s, false)).toEqual(["Xe hòa vốn/lỗ: quản lý chưa ghi cách xử lý và số hoàn vốn cho từng bên."]);
    await expect(check(cK, accountant, s)).rejects.toThrow(/quản lý chưa ghi cách xử lý/);
    const [a, b] = car.shares.map((x) => x.party_id);
    const setLoss = (client: Client, user: string, p: Record<string, unknown>) => as(client, user, async (db) => db.query("select public.set_settlement_loss($1, $2, $3::jsonb)", [s, (await sver(s)).version, JSON.stringify(p)]));
    await expect(setLoss(cK, accountant, { decision: "x", returns: [] })).rejects.toThrow(/Chỉ quản lý ghi/);
    await expect(setLoss(cM, manager, { decision: "  ", returns: [] })).rejects.toThrow(/Ghi cách xử lý/);
    await expect(setLoss(cM, manager, { decision: "Lỗ chia theo vốn", returns: [{ party_id: a, amount: M(101) }, { party_id: b, amount: M(50) }] })).rejects.toThrow(/từ 0 đến vốn thực nhận ròng/);
    await setLoss(cM, manager, { decision: "Hoàn vốn trừ lỗ theo tỷ lệ 60/40: A nhận 91 tr, B nhận 44 tr", returns: [{ party_id: a, amount: M(91) }, { party_id: b, amount: M(44) }] });
    expect((await lines(s)).filter((x) => x.kind === "capital_return").map((x) => x.a).sort()).toEqual([M(44), M(91)].sort());
    await check(cK, accountant, s);
    const acct = await account(M(1000));
    await payOrder(acct, so.o, M(590));
    await approve(cM, manager, s);
    await pay(s, acct, "settle_capital_return", await lineOf(s, "capital_return", a), M(91));
    await expect(pay(s, acct, "settle_capital_return", await lineOf(s, "capital_return", a), "1")).rejects.toThrow(/vượt phần còn lại/);
    // điều khoản không có cách xử lý hòa vốn/lỗ → chặn
    const car2 = await ownedCar(600, [{ name: "A", ratio: "100", paid: 10 }], { loss: "" });
    await cost(car2.v, "0");
    const s2 = await create(cK, accountant, (await sellOrder(car2.v, 600)).line);                  // hòa vốn
    expect(await settle(s2)).toMatchObject({ result: "no_profit" });
    expect(await blockers(s2, false)).toContain("Xe hòa vốn/lỗ: điều khoản chưa có cách xử lý được thống nhất.");
  });

  it("ĐIỀU CHỈNH: chi phí muộn sau khi duyệt → quyết toán lỗi thời; quản lý lập điều chỉnh (lý do), bản cũ giữ nguyên; duyệt bản mới thì bản cũ 'đã thay thế'; số đã chi được chuyển sang; đã chi vượt nghĩa vụ mới thì không duyệt", async () => {
    const x = await approvedOwned(600, 700, [{ name: "A", ratio: "60", paid: 100 }, { name: "B", ratio: "40", paid: 50 }], { costs: 0 });
    const profA = await lineOf(x.s, "profit_share", x.shares[0].party_id);
    expect(await lines(x.s).then((l) => l.find((y) => y.kind === "profit_share")?.a)).toBe(String(48_000_000));      // P = 100 tr: C = 20 tr; R = 80 tr; A 48 tr
    await pay(x.s, x.acct, "settle_profit_payout", profA, "30000000");
    const stale = () => as(cK, accountant, async (db) => (await db.query("select public.settlement_is_stale($1) r", [x.s])).rows[0].r as boolean);
    expect(await stale()).toBe(false);
    await cost(x.v, M(10));                                                              // chi phí muộn 10 tr sau khi đã duyệt
    expect(await stale()).toBe(true);
    await expect(as(cM, manager, (db) => db.query("update public.settlements set status = 'provisional' where id = $1", [x.s]))).rejects.toThrow(/Không thể chuyển quyết toán/);
    await expect(revise(cK, accountant, x.s)).rejects.toThrow(/Chỉ quản lý được lập điều chỉnh/);
    await expect(revise(cM, manager, x.s, "  ")).rejects.toThrow(/Ghi lý do điều chỉnh/);
    const r = await revise(cM, manager, x.s);
    expect((await sys.query("select version_no, supersedes_id, adjust_reason, status from public.settlements where id = $1", [r])).rows[0]).toMatchObject({ version_no: 2, supersedes_id: x.s, status: "provisional" });
    expect(await settle(r)).toMatchObject({ p: M(90), c: M(18), r: M(72), k: M(10) });                                  // 700 − 600 − 10
    expect((await sver(x.s)).status).toBe("approved");                                                                   // bản cũ vẫn hiệu lực cho tới khi duyệt bản mới
    await expect(revise(cM, manager, x.s)).rejects.toThrow(/Đã có một bản điều chỉnh đang soạn|tạm tính/);
    await check(cK, accountant, r);
    await approve(cM, manager, r);
    expect((await sver(x.s)).status).toBe("superseded");
    expect((await sver(r)).status).toBe("approved");
    // số đã chi (30 tr) được tính cho nghĩa vụ mới của A: 72 tr × 60% = 43,2 tr → còn 13,2 tr
    const profA2 = await lineOf(r, "profit_share", x.shares[0].party_id);
    expect((await balances(r)).find((b) => b.k === "profit_share" && b.a === "43200000")).toMatchObject({ p: "30000000", r: "13200000" });
    await expect(pay(x.s, x.acct, "settle_profit_payout", profA, "1")).rejects.toThrow(/quyết toán đã được phê duyệt còn hiệu lực/);   // bản cũ không còn chi được
    await pay(r, x.acct, "settle_profit_payout", profA2, "13200000");
    // điều chỉnh khiến nghĩa vụ giảm dưới số đã chi → không duyệt
    await cost(x.v, M(40));                                                              // thêm chi phí 40 tr: P = 50 tr → A chỉ còn 24 tr < đã chi 43,2 tr
    const r2 = await revise(cM, manager, r, "Phát sinh chi phí lớn muộn");
    await check(cK, accountant, r2);
    await expect(approve(cM, manager, r2)).rejects.toThrow(/Đã chi vượt nghĩa vụ mới/);
    expect((await sver(r)).status).toBe("approved");
  });

  it("KÝ GỬI: bên thu tiền = showroom → trả chủ xe giá bán − phí − chi phí chủ xe chịu; bên thu tiền = chủ xe → chủ xe nộp showroom phí + chi phí; chi phí showroom chịu không khấu trừ chủ xe; tách thu hộ/phí/khấu trừ/đã trả/còn phải trả", async () => {
    const mkConsign = async (collector: string, discount = "none") => {
      const v = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
        request_id: uuid(), condition: "used", make: "Honda", model: "Accord", business_type: "consignment", source_type: "individual", year_made: "2020", asking_price: M(650) })]);
      const contract = await call(cM, manager, "select public.create_consignment_contract($1::jsonb) r", [JSON.stringify({
        request_id: uuid(), vehicle_id: v, owner_name: "Nguyễn Văn Chủ", owner_phone: "0912345678", owner_id_number: "008099001234", start_date: "2026-10-01", end_date: "2026-12-31",
        received_at: "2026-10-01", keys_count: 2, documents_received: "Cà vẹt", condition_at_receipt: "Tốt" })]);
      await call(cM, manager, "select public.add_consignment_terms($1, $2::jsonb) r", [contract, JSON.stringify({
        request_id: uuid(), owner_expected_amount: M(600), list_price: M(650), discount_limit_type: "percent", discount_limit_percent: "1",
        fee_type: "percent_of_sale_price", fee_percent: "3", buyer_contract_party: "showroom", payment_collector: collector, signed_on: "2026-10-01" })]);
      await as(cM, manager, async (db) => db.query("select public.activate_consignment_contract($1, $2)", [contract, (await db.query("select version from public.consignment_contracts where id = $1", [contract])).rows[0].version]));
      await vehicleUpdate(v, { sale_status: "available" });
      void discount;
      return v;
    };
    const ownerCost = async (v: string, amount: number) => cost(v, M(amount), { borne_by: "owner" });
    // showroom thu tiền
    const v1 = await mkConsign("showroom");
    await ownerCost(v1, 5);
    await cost(v1, M(7), { borne_by: "showroom" });                                  // chi phí showroom chịu: KHÔNG khấu trừ chủ xe
    const so1 = await sellOrder(v1, 650);
    const acct = await account(M(2000));
    await payOrder(acct, so1.o, M(650));
    const s1 = await create(cK, accountant, so1.line);
    expect(await settle(s1)).toMatchObject({ result: "consignment", f: "19500000", k: M(5) });
    const l1 = await lines(s1);
    expect(l1.map((x) => [x.kind, x.a, x.direction])).toEqual([["sale_collected", M(650), "none"], ["fee", "19500000", "none"], ["owner_cost", M(5), "none"], ["owner_payout", "625500000", "out"]]);
    expect(l1.find((x) => x.kind === "owner_payout")?.label).toBe("Nguyễn Văn Chủ");
    await check(cK, accountant, s1);
    await approve(cM, manager, s1);
    // báo cáo: xe ký gửi — showroom hưởng phí (không phải giá bán), chi phí là phần chủ xe chịu, không có lãi gộp
    const rr = (await as(cM, manager, (db) => db.query("select business_type, gross_profit, costs_confirmed::text k, fee_amount::text f, settlement_status from public.report_vehicle_results where line_id = $1", [so1.line]))).rows[0];
    expect(rr).toEqual({ business_type: "consignment", gross_profit: null, k: M(5), f: "19500000", settlement_status: "approved" });
    const op = await lineOf(s1, "owner_payout");
    await pay(s1, acct, "settle_owner_payout", op, "600000000");
    await expect(pay(s1, acct, "settle_owner_payout", op, "25500001")).rejects.toThrow(/vượt phần còn lại/);
    await pay(s1, acct, "settle_owner_payout", op, "25500000");
    expect(await balances(s1)).toEqual([{ k: "owner_payout", label: "Nguyễn Văn Chủ", a: "625500000", p: "625500000", r: "0" }]);
    expect(await bal(acct)).toBe(2_000_000_000 + 650_000_000 - 625_500_000);                              // showroom giữ lại phí 19,5 tr + chi phí đã tự trả… (sổ quỹ chỉ có phiếu đã lập)
    // chủ xe thu tiền: chủ xe nộp showroom phí + chi phí
    const v2 = await mkConsign("owner");
    await ownerCost(v2, 5);
    const so2 = await sellOrder(v2, 650);
    await payOrder(acct, so2.o, M(650));
    const s2 = await create(cK, accountant, so2.line);
    expect((await lines(s2)).find((x) => x.kind === "owner_receivable")).toMatchObject({ a: "24500000", direction: "in" });          // 19,5 + 5
    await check(cK, accountant, s2);
    await approve(cM, manager, s2);
    const rec = await lineOf(s2, "owner_receivable");
    await expect(pay(s2, acct, "settle_owner_payout", rec, "1")).rejects.toThrow(/không khớp dòng nghĩa vụ|Dòng này không có tiền/);
    await expect(call(cK, accountant, "select public.post_voucher($1::jsonb) r", [JSON.stringify({ request_id: uuid(), direction: "out", purpose: "settle_owner_receipt", account_id: acct, amount: "1", occurred_on: TODAY, method: "cash", counterparty: "", settlement_line_id: rec })])).rejects.toThrow(/Dòng này không có tiền thật|voucher_direction_purpose|check/);
    const before = await bal(acct);
    await voucher(cK, accountant, acct, "settle_owner_receipt", "24500000", { settlement_line_id: rec, payer_kind: "other" });
    expect(await bal(acct)).toBe(before + 24_500_000);
    await expect(voucher(cK, accountant, acct, "settle_owner_receipt", "1", { settlement_line_id: rec, payer_kind: "other" })).rejects.toThrow(/vượt phần còn lại/);
    // chi phí chủ xe chịu lớn hơn phần còn lại → chủ xe còn nợ showroom
    const v3 = await mkConsign("showroom");
    await ownerCost(v3, 640);
    const so3 = await sellOrder(v3, 650);
    await payOrder(acct, so3.o, M(650));
    const s3 = await create(cK, accountant, so3.line);
    expect((await lines(s3)).find((x) => x.kind === "owner_receivable")).toMatchObject({ a: "9500000", direction: "in" });             // 650 − 19,5 − 640 = −9,5
    expect((await lines(s3)).some((x) => x.kind === "owner_payout")).toBe(false);
    // chi phí chủ xe chịu chưa xác nhận → chặn kiểm tra
    const v4 = await mkConsign("showroom");
    await call(cK, accountant, "select public.create_vehicle_cost($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: v4, category: "repair", description: "Chưa nghiệm thu", estimated_amount: M(2), borne_by: "owner" })]);
    const s4 = await create(cK, accountant, (await sellOrder(v4, 650)).line);
    await expect(check(cK, accountant, s4)).rejects.toThrow(/chưa xác nhận hoặc hủy/);
  });

  it("Đồng thời & bỏ qua quy trình: hai người cùng phê duyệt một quyết toán → một thắng; không nhảy trạng thái bằng cập nhật trực tiếp; không 'thay thế' bản đã duyệt khi chưa có điều chỉnh đã duyệt", async () => {
    const car = await ownedCar(600, [{ name: "A", ratio: "100", paid: 10 }]);
    await cost(car.v, "0");
    const so = await sellOrder(car.v, 700);
    const acct = await account(M(1000));
    await payOrder(acct, so.o, M(700));
    const s = await create(cK, accountant, so.line);
    await expect(as(cM, manager, (db) => db.query("update public.settlements set status = 'approved' where id = $1", [s]))).rejects.toThrow(/Chỉ phê duyệt quyết toán đã được kiểm tra/);
    await check(cK, accountant, s);
    const ver = (await sver(s)).version;
    const res = await Promise.allSettled([
      as(cM, manager, (db) => db.query("select public.approve_settlement($1, $2)", [s, ver])),
      as(cM2, manager, (db) => db.query("select public.approve_settlement($1, $2)", [s, ver])),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/vừa được cập nhật/);
    await expect(as(cM, manager, (db) => db.query("update public.settlements set status = 'superseded' where id = $1", [s]))).rejects.toThrow(/chỉ được thay thế khi bản điều chỉnh đã duyệt/);
    await expect(as(cK, accountant, (db) => db.query("update public.settlements set status = 'cancelled', end_reason = 'x' where id = $1", [s]))).rejects.toThrow(/Chỉ quản lý được hủy quyết toán đã duyệt/);
  });

  it("Hủy: tạm tính/đã kiểm tra do người tạo hoặc quản lý hủy; đã duyệt chỉ quản lý và khi chưa có phiếu; hủy rồi tính lại được; xe chưa bán không quyết toán", async () => {
    const x = await approvedOwned(600, 700, [{ name: "A", ratio: "100", paid: 100 }]);
    await expect(cancel(cK, accountant, x.s)).rejects.toThrow(/Chỉ quản lý được hủy quyết toán đã duyệt/);
    await expect(cancel(cM, manager, x.s, "  ")).rejects.toThrow(/lý do/);
    await cancel(cM, manager, x.s, "Duyệt nhầm, tính lại");
    expect((await sver(x.s)).status).toBe("cancelled");
    const s2 = await create(cK, accountant, x.line);
    expect(s2).not.toBe(x.s);
    // xe chưa bán
    const car = await ownedCar(600, [{ name: "A", ratio: "100", paid: 10 }]);
    await cost(car.v, "0");
    const dem = await demand();
    const draft = await call(cA, salesA, "select public.create_sales_order($1::jsonb) r", [JSON.stringify({ request_id: uuid(), demand_id: dem, lines: [{ vehicle_id: car.v, sale_price: M(700) }] })]);
    const dl = (await sys.query("select id from public.sales_order_lines where order_id = $1", [draft])).rows[0].id as string;
    await expect(create(cK, accountant, dl)).rejects.toThrow(/đơn bán đã ký hợp đồng/);
  });
  it("BÁO CÁO: lãi gộp → sau chi phí → lợi nhuận phân chia → phần công ty; thiếu quyết toán/giá mua không coi là 0; dashboard tồn/công nợ; chỉ tài chính đọc", async () => {
    const totals = async () => (await as(cM, manager, async (db) => (await db.query("select public.report_results_totals($1::date, $2::date) r", [TODAY, TODAY])).rows[0].r)) as Record<string, string | number>;
    const dash = async () => (await as(cM, manager, async (db) => (await db.query("select public.report_dashboard() r")).rows[0].r)) as { inventory: { owned: { count: number; capital_tied: string } }; payables: { settlement_out: string }; receivables: { orders_outstanding: string }; settlements: { unsettled_sold: number } };
    const t0 = await totals(), d0 = await dash();
    // Xe 1: mua 600, chi phí 10, bán 640, quyết toán đã duyệt: P = 30, C = 20% = 6
    const x = await approvedOwned(600, 640, [{ name: "Bên A", ratio: "60", paid: 100 }, { name: "Bên B", ratio: "40", paid: 50 }], { costs: 10 });
    const row = (await as(cM, manager, (db) => db.query(
      "select gross_profit::text g, result_after_costs::text a, distributable::text p, company_operating::text c, settlement_status st from public.report_vehicle_results where line_id = $1", [x.line]))).rows[0];
    expect(row).toEqual({ g: M(40), a: M(30), p: M(30), c: M(6), st: "approved" });
    // Xe 2: mua 500, bán 520, KHÔNG quyết toán, chưa thu tiền
    const y = await ownedCar(500, [{ name: "Bên C", ratio: "100", paid: 20 }]);
    await cost(y.v, "0");
    const so2 = await sellOrder(y.v, 520);
    const row2 = (await as(cM, manager, (db) => db.query("select gross_profit::text g, distributable p, settlement_id sid from public.report_vehicle_results where line_id = $1", [so2.line]))).rows[0];
    expect(row2).toEqual({ g: M(20), p: null, sid: null });
    const t1 = await totals();
    const delta = (k: string) => BigInt(String(t1[k])) - BigInt(String(t0[k]));
    expect(delta("gross_profit")).toBe(BigInt(M(60)));                // 40 + 20
    expect(delta("result_after_costs")).toBe(BigInt(M(50)));          // 30 + 20
    expect(delta("distributable")).toBe(BigInt(M(30)));               // chỉ xe đã quyết toán
    expect(delta("company_operating")).toBe(BigInt(M(6)));
    expect(Number(t1.owned_unsettled) - Number(t0.owned_unsettled)).toBe(1);
    expect(Number(t1.gross_unknown) - Number(t0.gross_unknown)).toBe(0);
    // Dashboard: xe 2 đã bán nên không còn trong tồn; đơn xe 2 chưa thu → công nợ tăng 520; quyết toán xe 1 còn phải chi
    const d1 = await dash();
    expect(BigInt(d1.receivables.orders_outstanding) - BigInt(d0.receivables.orders_outstanding)).toBe(BigInt(M(520)));
    expect(BigInt(d1.payables.settlement_out) - BigInt(d0.payables.settlement_out)).toBeGreaterThan(0n);
    expect(d1.settlements.unsettled_sold - d0.settlements.unsettled_sold).toBe(1);
    // quyền: kế toán đọc được; sales/kỹ thuật nhận rỗng; anon bị chặn
    expect(await as(cK, accountant, async (db) => (await db.query("select public.report_dashboard() r")).rows[0].r)).toHaveProperty("inventory");
    expect(await as(cA, salesA, async (db) => (await db.query("select public.report_dashboard() r")).rows[0].r)).toEqual({});
    expect(await as(cA, salesA, async (db) => (await db.query("select public.report_results_totals($1::date, $1::date) r", [TODAY])).rows[0].r)).toEqual({});
    expect(await as(cA, salesA, async (db) => Number((await db.query("select count(*) n from public.report_vehicle_results")).rows[0].n))).toBe(0);
    expect(await as(cA, salesA, async (db) => Number((await db.query("select count(*) n from public.report_inventory")).rows[0].n))).toBe(0);
    await expect(as(cA, null, (db) => db.query("select public.report_dashboard()"))).rejects.toThrow(/permission denied/);
    void d0.inventory;
  });
  it("TỒN KHO: xe sở hữu tính vốn = giá mua + chi phí xác nhận; thiếu giá mua không coi là 0; xe chưa nhập kho không là tồn; tuổi tồn theo nhóm", async () => {
    const inv = async () => (await as(cM, manager, async (db) => (await db.query("select public.report_dashboard() r")).rows[0].r)) as {
      inventory: { owned: { count: number; capital_tied: string; cost_unknown: number; age_91_plus: number }; not_yet_in_stock: number }; capital_sources: { external_capital: string } };
    const d0 = await inv();
    const old = new Date(Date.now() + 7 * 3_600_000 - 100 * 86_400_000).toISOString().slice(0, 10);
    const car = await ownedCar(800, [{ name: "Bên D", ratio: "100", paid: 300 }]);
    await cost(car.v, M(20));
    const dNo = await inv();                                                    // chưa có ngày nhập kho → chưa là tồn
    expect(dNo.inventory.owned.count).toBe(d0.inventory.owned.count);
    expect(dNo.inventory.not_yet_in_stock - d0.inventory.not_yet_in_stock).toBe(1);   // đếm riêng là nguồn xe chưa nhập kho
    await vehicleUpdate(car.v, { intake_date: old });
    const d1 = await inv();
    expect(d1.inventory.owned.count - d0.inventory.owned.count).toBe(1);
    expect(d1.inventory.not_yet_in_stock).toBe(d0.inventory.not_yet_in_stock);
    expect(BigInt(d1.inventory.owned.capital_tied) - BigInt(d0.inventory.owned.capital_tied)).toBe(BigInt(M(820)));
    expect(d1.inventory.owned.age_91_plus - d0.inventory.owned.age_91_plus).toBe(1);
    expect(BigInt(d1.capital_sources.external_capital) - BigInt(d0.capital_sources.external_capital)).toBe(BigInt(M(300)));
    // thiếu giá mua: không cộng vào vốn, đếm riêng
    await as(cM, manager, async (db) => db.query("update public.vehicle_financials set purchase_price = null where vehicle_id = $1", [car.v]));
    const d2 = await inv();
    expect(d2.inventory.owned.cost_unknown - d1.inventory.owned.cost_unknown).toBe(1);
    expect(BigInt(d2.inventory.owned.capital_tied)).toBe(BigInt(d0.inventory.owned.capital_tied));
  });
  // ---------------------------------------------------------------------------------------------------------------------
  // HẬU MÃI (chặng 6 lát 9): cam kết/bảo hành, phiếu phản ánh, chi phí sau bán quay về đúng xe → quyết toán lỗi thời → điều chỉnh
  // ---------------------------------------------------------------------------------------------------------------------
  const shift = (days: number) => new Date(Date.now() + 7 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
  const sold = async (price = 650, purchase = 600) => {
    const car = await ownedCar(purchase, [{ name: "Bên H", ratio: "100", paid: 100 }]);
    const so = await sellOrder(car.v, price);
    return { ...car, ...so };
  };
  const commit = (user: string, line: string, extra: Record<string, unknown> = {}, client: Client = cM) =>
    call(client, user, "select public.create_aftersales_commitment($1::jsonb) r", [JSON.stringify({ request_id: uuid(), order_line_id: line, kind: "warranty", title: "Bảo hành thân vỏ", starts_on: shift(-10), ends_on: shift(30), odo_limit: 100000, ...extra })]);
  const openCase = (user: string, line: string, extra: Record<string, unknown> = {}, client: Client = cA) =>
    call(client, user, "select public.create_aftersales_case($1::jsonb) r", [JSON.stringify({ request_id: uuid(), order_line_id: line, kind: "complaint", title: "Khách báo tiếng ồn gầm", next_action: "Gọi khách hẹn lịch kiểm tra", next_due: shift(2), ...extra })]);
  const cver = async (id: string) => (await sys.query("select version from public.aftersales_cases where id = $1", [id])).rows[0].version as number;
  const caseRow = async (id: string) => (await sys.query("select status, coverage, assigned_to, next_action, next_due::text nd, resolution from public.aftersales_cases where id = $1", [id])).rows[0] as { status: string; coverage: string | null; assigned_to: string; next_action: string | null; nd: string | null; resolution: string | null };
  const resolveCase = (client: Client, user: string, id: string, resolution = "Đã thay giảm xóc, khách xác nhận") => as(client, user, async (db) => db.query("select public.resolve_aftersales_case($1, $2, $3)", [id, await cver(id), resolution]));
  const afterCost = (user: string, vehicle: string, caseId: string | null, amount = "3000000", extra: Record<string, unknown> = {}) =>
    call(cK, user, "select public.create_vehicle_cost($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: vehicle, category: "after_sales", description: "Thay giảm xóc theo bảo hành", estimated_amount: amount, ...(caseId ? { aftersales_case_id: caseId } : {}), ...extra })]);

  it("HẬU MÃI — cam kết/bảo hành: chỉ quản lý ghi; bảo hành phải có hạn hoặc km; sales chỉ thấy của đơn mình; không sửa, hủy cần lý do", async () => {
    const x = await sold();
    await expect(commit(salesA, x.line, {}, cA)).rejects.toThrow(/Chỉ quản lý được ghi cam kết|row-level security/);
    await expect(commit(manager, x.line, { ends_on: null, odo_limit: null })).rejects.toThrow(/aftersales_commitments_limit|violates/);
    await expect(commit(manager, x.line, { ends_on: shift(-20) })).rejects.toThrow(/aftersales_commitments_range|violates/);
    const unsold = await ownedCar(500, [{ name: "Bên K", ratio: "100", paid: 10 }]);
    const dl = await call(cA, salesA, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "buy", customer: { full_name: "Khách " + uuid().slice(0, 5) } })]);
    const draft = await call(cA, salesA, "select public.create_sales_order($1::jsonb) r", [JSON.stringify({ request_id: uuid(), demand_id: dl, lines: [{ vehicle_id: unsold.v, sale_price: M(520) }] })]);
    const draftLine = (await sys.query("select id from public.sales_order_lines where order_id = $1", [draft])).rows[0].id as string;
    await expect(commit(manager, draftLine)).rejects.toThrow(/xe đã bán/);
    const ck = await commit(manager, x.line);
    expect(await count(cA, salesA, "select count(*)::int n from public.aftersales_commitments where id = $1", [ck])).toBe(1);
    const salesB = await createUser(sys, "Sales B Hậu mãi", ["sales"]);
    expect(await count(cA, salesB, "select count(*)::int n from public.aftersales_commitments")).toBe(0);
    expect(await count(cK, accountant, "select count(*)::int n from public.aftersales_commitments where id = $1", [ck])).toBe(1);
    await expect(sys.query("update public.aftersales_commitments set title = 'Sửa lén' where id = $1", [ck])).rejects.toThrow(/Không sửa cam kết/);
    const ver = (await sys.query("select version from public.aftersales_commitments where id = $1", [ck])).rows[0].version;
    await expect(as(cM, manager, (db) => db.query("select public.void_aftersales_commitment($1, $2, '  ')", [ck, ver]))).rejects.toThrow(/Ghi lý do hủy/);
    await as(cM, manager, (db) => db.query("select public.void_aftersales_commitment($1, $2, 'Ghi nhầm xe')", [ck, ver]));
    await expect(as(cM, manager, (db) => db.query("select public.void_aftersales_commitment($1, $2, 'x')", [ck, ver]))).rejects.toThrow(/vừa được cập nhật/);
    await expect(as(cM, manager, (db) => db.query("delete from public.aftersales_commitments"))).rejects.toThrow(/permission denied/);
  });

  it("HẬU MÃI — phiếu: gợi ý trong/ngoài bảo hành theo ngày và km (thiếu km = chưa rõ); sales chỉ mở cho đơn của mình và tự phụ trách; đang xử lý bắt buộc việc tiếp theo + hạn", async () => {
    const x = await sold();
    const ck = await commit(manager, x.line);                                    // hạn đến +30 ngày, giới hạn 100.000 km
    const within = await openCase(salesA, x.line, { commitment_id: ck, odo_at_case: 50000 });
    expect((await caseRow(within)).coverage).toBe("within");
    expect((await caseRow(await openCase(salesA, x.line, { commitment_id: ck, odo_at_case: 120000 }))).coverage).toBe("outside");
    expect((await caseRow(await openCase(salesA, x.line, { commitment_id: ck }))).coverage).toBe("unknown");   // có giới hạn km mà chưa nhập km → cần xác minh, không đoán
    const expired = await commit(manager, x.line, { starts_on: shift(-60), ends_on: shift(-1), odo_limit: null });
    expect((await caseRow(await openCase(salesA, x.line, { commitment_id: expired }))).coverage).toBe("outside");
    expect((await caseRow(await openCase(salesA, x.line))).coverage).toBeNull();                              // không gắn cam kết → không có gợi ý
    // cam kết của xe khác không gắn được
    const y = await sold();
    const otherCk = await commit(manager, y.line);
    await expect(openCase(salesA, x.line, { commitment_id: otherCk })).rejects.toThrow(/đúng xe này/);
    // sales khác không mở được phiếu cho đơn không phải của mình; sales tự phụ trách dù chỉ định người khác
    const salesB = await createUser(sys, "Sales B Hậu mãi 2", ["sales"]);
    await expect(openCase(salesB, x.line, {}, cK)).rejects.toThrow(/Chỉ quản lý hoặc sales phụ trách|không tìm thấy|Không tìm thấy/i);
    const assignedAttempt = await openCase(salesA, x.line, { assigned_to: tech });
    expect((await caseRow(assignedAttempt)).assigned_to).toBe(salesA);
    // đang xử lý bắt buộc việc tiếp theo + hạn
    await expect(openCase(salesA, x.line, { next_action: "", next_due: null })).rejects.toThrow(/aftersales_cases_next_required|violates/);
    // quản lý giao cho kỹ thuật; kỹ thuật thấy đúng phiếu được giao; sales không đổi người phụ trách
    const ver = await cver(within);
    await expect(as(cA, salesA, (db) => db.query("select public.update_aftersales_case($1, $2, $3::jsonb)", [within, ver, JSON.stringify({ assigned_to: tech })]))).rejects.toThrow(/Chỉ quản lý được đổi người phụ trách/);
    await as(cM, manager, (db) => db.query("select public.update_aftersales_case($1, $2, $3::jsonb)", [within, ver, JSON.stringify({ assigned_to: tech, next_action: "Kiểm tra gầm tại xưởng", next_due: shift(1) })]));
    expect((await caseRow(within))).toMatchObject({ assigned_to: tech, status: "in_progress", next_action: "Kiểm tra gầm tại xưởng" });
    expect(await count(cA, tech, "select count(*)::int n from public.aftersales_cases")).toBe(1);
    expect(await count(cA, tech, "select count(*)::int n from public.vehicle_costs")).toBe(0);
    // nhật ký: ghi liên hệ, không sửa/xóa
    await call(cA, tech, "select public.add_aftersales_event($1::jsonb) r", [JSON.stringify({ case_id: within, kind: "contact", content: "Đã gọi khách, hẹn 9h sáng mai" })]);
    expect(await count(cA, tech, "select count(*)::int n from public.aftersales_events where case_id = $1", [within])).toBeGreaterThanOrEqual(3);
    await expect(sys.query("update public.aftersales_events set content = 'x' where case_id = $1", [within])).rejects.toThrow(/không sửa\/xóa/);
    await expect(call(cA, salesB, "select public.add_aftersales_event($1::jsonb) r", [JSON.stringify({ case_id: within, kind: "note", content: "Xen vào" })])).rejects.toThrow(/Không tìm thấy phiếu|row-level security/);
  });

  it("HẬU MÃI — đóng phiếu cần kết quả; mở lại chỉ quản lý và phải có việc mới; hủy cần lý do; chi phí sau bán bắt buộc gắn phiếu đúng xe, chặn đóng/hủy khi còn chi phí chưa xử lý", async () => {
    const x = await sold();
    const y = await sold();
    const c1 = await openCase(salesA, x.line);
    await expect(resolveCase(cA, salesA, c1, "  ")).rejects.toThrow(/Ghi kết quả xử lý|aftersales_cases_resolved_complete/);
    // chi phí sau bán: phải có phiếu, đúng xe, đúng loại
    await expect(afterCost(accountant, x.v, null)).rejects.toThrow(/phải gắn một phiếu hậu mãi/);
    const cOther = await openCase(salesA, y.line, {});
    await expect(afterCost(accountant, x.v, cOther)).rejects.toThrow(/không thuộc xe này/);
    await expect(call(cK, accountant, "select public.create_vehicle_cost($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: x.v, category: "repair", description: "Sửa", estimated_amount: "1000000", aftersales_case_id: c1 })])).rejects.toThrow(/Chỉ chi phí loại "sau bán"/);
    // sales không tạo được chi phí
    await expect(afterCost(salesA, x.v, c1)).rejects.toThrow(/không có quyền ghi chi phí/);
    const cost1 = await afterCost(accountant, x.v, c1, "3000000");
    // còn chi phí dự kiến → không đóng; xác nhận rồi mới đóng
    await expect(resolveCase(cA, salesA, c1)).rejects.toThrow(/Còn 1 khoản chi phí sau bán dự kiến chưa xác nhận/);
    await confirmCost(cost1, "2800000");
    // có chi phí chưa đảo → không hủy phiếu
    await expect(as(cA, salesA, async (db) => db.query("select public.cancel_aftersales_case($1, $2, 'Khách rút')", [c1, await cver(c1)]))).rejects.toThrow(/Hủy \(đảo\) các khoản chi phí trước/);
    await resolveCase(cA, salesA, c1);
    expect(await caseRow(c1)).toMatchObject({ status: "resolved", next_action: null, nd: null, resolution: "Đã thay giảm xóc, khách xác nhận" });
    // đã xử lý xong → không sửa việc tiếp theo; sales không mở lại; quản lý mở lại phải có việc mới
    await expect(as(cA, salesA, async (db) => db.query("select public.update_aftersales_case($1, $2, $3::jsonb)", [c1, await cver(c1), JSON.stringify({ next_action: "x", next_due: shift(1) })]))).rejects.toThrow(/vừa được cập nhật, đã đóng/);
    await expect(as(cA, salesA, async (db) => db.query("select public.reopen_aftersales_case($1, $2, $3::jsonb)", [c1, await cver(c1), JSON.stringify({ next_action: "Gọi lại", next_due: shift(3) })]))).rejects.toThrow(/Chỉ quản lý được mở lại/);
    await expect(as(cM, manager, async (db) => db.query("select public.reopen_aftersales_case($1, $2, $3::jsonb)", [c1, await cver(c1), JSON.stringify({ next_action: "", next_due: null })]))).rejects.toThrow(/aftersales_cases_next_required|violates|Mở lại phiếu phải ghi/);
    await as(cM, manager, async (db) => db.query("select public.reopen_aftersales_case($1, $2, $3::jsonb)", [c1, await cver(c1), JSON.stringify({ next_action: "Gọi lại kiểm tra sau sửa", next_due: shift(3) })]));
    expect((await caseRow(c1)).status).toBe("in_progress");
    // hủy phiếu khác: cần lý do; phiếu đã hủy không sửa
    await expect(as(cA, salesA, async (db) => db.query("select public.cancel_aftersales_case($1, $2, ' ')", [cOther, await cver(cOther)]))).rejects.toThrow(/Ghi lý do hủy/);
    await as(cA, salesA, async (db) => db.query("select public.cancel_aftersales_case($1, $2, 'Khách báo nhầm xe')", [cOther, await cver(cOther)]));
    await expect(afterCost(accountant, y.v, cOther)).rejects.toThrow(/đã hủy/);
    await expect(sys.query("update public.aftersales_cases set title = 'Sửa lén' where id = $1", [c1])).rejects.toThrow(/Không sửa nội dung phiếu/);
  });

  it("HẬU MÃI — chi phí sau bán làm quyết toán đã duyệt LỖI THỜI → điều chỉnh có lưu vết; chi phí quay về đúng xe và vào báo cáo kết quả", async () => {
    const x = await approvedOwned(600, 650, [{ name: "Bên M", ratio: "100", paid: 100 }], { costs: 0 });   // P = 50 tr, công ty 20% = 10 tr, bên M 40 tr
    expect((await settle(x.s))).toMatchObject({ p: M(50), c: M(10), status: "approved" });
    expect(await as(cK, accountant, async (db) => (await db.query("select public.settlement_is_stale($1) r", [x.s])).rows[0].r)).toBe(false);
    const hm = await openCase(salesA, x.line);
    const cost1 = await afterCost(accountant, x.v, hm, "5000000");
    // chi phí dự kiến chưa xác nhận đã làm số liệu đầu vào đổi → quyết toán đã duyệt bị đánh dấu lỗi thời
    expect(await as(cK, accountant, async (db) => (await db.query("select public.settlement_is_stale($1) r", [x.s])).rows[0].r)).toBe(true);
    await confirmCost(cost1, "5000000");
    const r = await revise(cM, manager, x.s, "Chi phí bảo hành sau bán");
    expect(await settle(r)).toMatchObject({ p: M(45), c: M(9), k: M(5), status: "provisional" });   // P giảm đúng 5 tr chi phí sau bán
    await check(cK, accountant, r);
    await approve(cM, manager, r);
    expect((await sver(x.s)).status).toBe("superseded");
    // báo cáo: chi phí sau bán nằm trong chi phí xác nhận của đúng xe
    const row = (await as(cM, manager, (db) => db.query("select costs_confirmed::text k, result_after_costs::text a, distributable::text p from public.report_vehicle_results where line_id = $1", [x.line]))).rows[0];
    expect(row).toEqual({ k: M(5), a: M(45), p: M(45) });
    expect((await sys.query("select category, aftersales_case_id from public.vehicle_costs where id = $1", [cost1])).rows[0]).toEqual({ category: "after_sales", aftersales_case_id: hm });
  });
});
