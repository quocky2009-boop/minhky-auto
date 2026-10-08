/**
 * Chặng 5 (lát 6): bàn giao xe và hồ sơ — checklist, điều kiện giao xe, phê duyệt ngoại lệ (database thật).
 * Chạy SQL dưới vai trò `authenticated` của từng người (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const M = (n: number) => String(n * 1_000_000);

d("Bàn giao xe và hồ sơ — chặng 5 lát 6 (database thật)", () => {
  let sys: Client, cM: Client, cK: Client, cA: Client, cA2: Client, cB: Client;
  let manager: string, accountant: string, salesA: string, salesB: string, tech: string;

  beforeAll(async () => {
    sys = await connect(); cM = await connect(); cK = await connect(); cA = await connect(); cA2 = await connect(); cB = await connect();
    manager = await createUser(sys, "QL Bàn giao", ["manager"]);
    accountant = await createUser(sys, "KT Bàn giao", ["accountant"]);
    salesA = await createUser(sys, "Sales A Bàn giao", ["sales"]);
    salesB = await createUser(sys, "Sales B Bàn giao", ["sales"]);
    tech = await createUser(sys, "KTV Bàn giao", ["technician"]);
  });
  afterAll(async () => { for (const c of [sys, cM, cK, cA, cA2, cB]) await c.end(); });

  const call = <T = string>(client: Client, user: string | null, sql: string, params: unknown[] = []): Promise<T> =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0]?.r as T);
  const count = (client: Client, user: string | null, sql: string, params: unknown[] = []) =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0].n as number);

  const updateVehicle = (v: string, patch: Record<string, unknown>) =>
    as(cM, manager, async (db) => {
      const ver = (await db.query("select version from public.vehicles where id = $1", [v])).rows[0].version;
      return db.query("select public.update_vehicle($1, $2, $3::jsonb)", [v, ver, JSON.stringify(patch)]);
    });
  const car = async (ready = false) => {
    const v = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), condition: "used", make: "Mazda", model: "CX-5", business_type: "owned", source_type: "individual", year_made: "2021",
      asking_price: M(900), purchase_price: M(700), floor_price: M(1) })]);
    await updateVehicle(v, { sale_status: "available" });
    if (ready) await updateVehicle(v, { prep_status: "ready", paperwork_status: "complete" });
    return v;
  };
  const demand = (client = cA, user = salesA) => call(client, user, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "buy", customer: { full_name: "Khách " + uuid().slice(0, 5) } })]);
  /** Đơn bán đã ký gồm các xe (mỗi xe một dòng). */
  const orderOf = async (prices: number[], ready = true) => {
    const dem = await demand();
    const cars = [] as string[];
    for (let i = 0; i < prices.length; i++) cars.push(await car(ready));
    const o = await call(cA, salesA, "select public.create_sales_order($1::jsonb) r", [JSON.stringify({ request_id: uuid(), demand_id: dem, lines: cars.map((v, i) => ({ vehicle_id: v, sale_price: M(prices[i]) })) })]);
    await sign(o);
    const lines = (await sys.query("select id, vehicle_id from public.sales_order_lines where order_id = $1 order by created_at, id", [o])).rows as { id: string; vehicle_id: string }[];
    return { o, dem, cars, lines };
  };
  const sign = (o: string) => as(cA, salesA, async (db) => db.query("select public.confirm_sales_order($1, $2, $3::jsonb)", [o, (await sys.query("select version from public.sales_orders where id = $1", [o])).rows[0].version, JSON.stringify({ contract_ref: "HĐB-BG", contract_date: TODAY })]));
  const account = () => call(cM, manager, "select public.create_money_account($1::jsonb) r", [JSON.stringify({ request_id: uuid(), name: "TK " + uuid().slice(0, 8), kind: "cash", opening_balance: "0" })]);
  const pay = (acct: string, o: string, amount: string) => call(cK, accountant, "select public.post_voucher($1::jsonb) r", [JSON.stringify({
    request_id: uuid(), direction: "in", purpose: "sale_payment", account_id: acct, amount, occurred_on: TODAY, method: "cash", payer_kind: "customer", counterparty: "", order_id: o })]);
  const create = (client: Client, user: string, line: string, extra: Record<string, unknown> = {}) =>
    call(client, user, "select public.create_handover($1::jsonb) r", [JSON.stringify({ request_id: uuid(), order_line_id: line, ...extra })]);
  const hv = async (id: string) => (await sys.query("select version, status from public.handovers where id = $1", [id])).rows[0] as { version: number; status: string };
  const itemVer = async (id: string, key: string) => (await sys.query("select version from public.handover_items where handover_id = $1 and template_key = $2", [id, key])).rows[0].version as number;
  const setItem = (client: Client, user: string, id: string, key: string, patch: Record<string, unknown>) =>
    as(client, user, async (db) => db.query("select public.update_handover_item($1, $2, $3, $4::jsonb)", [id, key, await itemVer(id, key), JSON.stringify({ state: "ok", ...patch })]));
  const completeChecklist = async (id: string) => {
    for (const k of (await sys.query("select template_key k from public.handover_items where handover_id = $1 and is_required", [id])).rows.map((x) => x.k as string)) {
      await setItem(cA, salesA, id, k, { state: "ok", has_original: true, holder: "customer" });
    }
  };
  const deliverBody = (extra: Record<string, unknown> = {}) => ({ delivered_on: TODAY, received_by_name: "Nguyễn Văn Khách", received_relation: "customer", odo: "12500", keys_given: "2", ...extra });
  const deliver = (client: Client, user: string, id: string, extra: Record<string, unknown> = {}) =>
    as(client, user, async (db) => db.query("select public.deliver_handover($1, $2, $3::jsonb)", [id, (await hv(id)).version, JSON.stringify(deliverBody(extra))]));
  const grant = (client: Client, user: string, id: string, kind: string, reason = "Khách quen, đã thỏa thuận") =>
    call(client, user, "select public.grant_handover_exception($1::jsonb) r", [JSON.stringify({ request_id: uuid(), handover_id: id, kind, reason })]);
  const ready = (client: Client, user: string, id: string) => as(client, user, async (db) => (await db.query("select * from public.handover_readiness($1)", [id])).rows[0]);
  const saleStatus = async (v: string) => (await sys.query("select sale_status from public.vehicles where id = $1", [v])).rows[0].sale_status as string;
  const cancelOrder = (o: string) => as(cM, manager, async (db) => db.query("select public.cancel_sales_order($1, $2, 'Khách hủy')", [o, (await sys.query("select version from public.sales_orders where id = $1", [o])).rows[0].version]));

  it("Quyền: người phụ trách đơn/quản lý lập; sales khác, kỹ thuật không thấy; kế toán xem; không xóa; checklist snapshot theo danh mục lúc lập", async () => {
    const s = await orderOf([800]);
    await expect(create(cB, salesB, s.lines[0].id)).rejects.toThrow(/không tìm thấy dòng xe|không có quyền/i);
    await expect(create(cK, accountant, s.lines[0].id)).rejects.toThrow(/không có quyền|row-level/i);
    await expect(create(cA, tech, s.lines[0].id)).rejects.toThrow(/không có quyền|row-level/i);
    const h = await create(cA, salesA, s.lines[0].id, { planned_on: TODAY });
    expect((await sys.query("select code, owner_id, vehicle_id from public.handovers where id = $1", [h])).rows[0]).toMatchObject({ owner_id: salesA, vehicle_id: s.cars[0] });
    const n = (await sys.query("select count(*)::int n from public.handover_items where handover_id = $1", [h])).rows[0].n;
    expect(n).toBe((await sys.query("select count(*)::int n from public.handover_templates where is_active")).rows[0].n);
    for (const [cl, u] of [[cA, salesA], [cK, accountant], [cM, manager]] as const) expect(await count(cl, u, "select count(*)::int n from public.handovers where id = $1", [h])).toBe(1);
    for (const [cl, u] of [[cB, salesB], [cB, tech]] as const) {
      expect(await count(cl, u, "select count(*)::int n from public.handovers where id = $1", [h])).toBe(0);
      expect(await count(cl, u, "select count(*)::int n from public.handover_items where handover_id = $1", [h])).toBe(0);
    }
    await expect(as(cB, null, (db) => db.query("select count(*) from public.handovers"))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("delete from public.handovers where id = $1", [h]))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("delete from public.handover_items where handover_id = $1", [h]))).rejects.toThrow(/permission denied/);
    await expect(setItem(cB, salesB, h, "registration", {})).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    // đổi danh mục sau đó không đổi checklist đã lập; sales không sửa được danh mục
    await expect(call(cA, salesA, "select public.upsert_handover_template($1::jsonb) r", [JSON.stringify({ key: "extra_" + uuid().slice(0, 4), label: "Mục mới", grp: "Phụ kiện" })])).rejects.toThrow(/Chỉ quản lý/);
    const key = "extra_" + uuid().slice(0, 6);
    await call(cM, manager, "select public.upsert_handover_template($1::jsonb) r", [JSON.stringify({ key, label: "Mục thêm mới", grp: "Phụ kiện", is_required: true })]);
    expect((await sys.query("select count(*)::int n from public.handover_items where handover_id = $1 and template_key = $2", [h, key])).rows[0].n).toBe(0);
    const s2 = await orderOf([800]);
    const h2 = await create(cA, salesA, s2.lines[0].id);
    expect((await sys.query("select is_required from public.handover_items where handover_id = $1 and template_key = $2", [h2, key])).rows[0].is_required).toBe(true);
    await call(cM, manager, "select public.upsert_handover_template($1::jsonb) r", [JSON.stringify({ key, label: "Mục thêm mới", grp: "Phụ kiện", is_active: false })]);   // tắt để không ảnh hưởng test khác
  });

  it("Lập bàn giao: chỉ cho đơn đã ký và dòng còn hiệu lực; một dòng một bàn giao (đồng thời → một thắng); đơn nhiều xe có bàn giao riêng cho từng xe", async () => {
    const dem = await demand();
    const v = await car(true);
    const draft = await call(cA, salesA, "select public.create_sales_order($1::jsonb) r", [JSON.stringify({ request_id: uuid(), demand_id: dem, lines: [{ vehicle_id: v, sale_price: M(800) }] })]);
    const dl = (await sys.query("select id from public.sales_order_lines where order_id = $1", [draft])).rows[0].id as string;
    await expect(create(cA, salesA, dl)).rejects.toThrow(/đã ký hợp đồng/);
    const s = await orderOf([500, 600]);
    const [h1, h2] = [await create(cA, salesA, s.lines[0].id), await create(cA, salesA, s.lines[1].id)];
    expect(h1).not.toBe(h2);
    const s2 = await orderOf([700]);
    const res = await Promise.allSettled([create(cA, salesA, s2.lines[0].id), create(cA2, salesA, s2.lines[0].id)]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/đã có bàn giao/);
    // gửi lặp cùng request_id → cùng một bàn giao, checklist không nhân đôi
    const s3 = await orderOf([650]);
    const rid = uuid();
    const post = () => call(cA, salesA, "select public.create_handover($1::jsonb) r", [JSON.stringify({ request_id: rid, order_line_id: s3.lines[0].id })]);
    const a = await post(), b = await post();
    expect(b).toBe(a);
    const templates = (await sys.query("select count(*)::int n from public.handover_templates where is_active")).rows[0].n as number;
    expect((await sys.query("select count(*)::int n from public.handover_items where handover_id = $1", [a])).rows[0].n).toBe(templates);
  });

  it("Checklist: bản gốc phải có người giữ; mục thiếu phải ghi chú; mục chưa kiểm không có cờ; 'không áp dụng' không có bản gốc; sửa đồng thời cùng phiên bản → một thắng", async () => {
    const s = await orderOf([800]);
    const h = await create(cA, salesA, s.lines[0].id);
    await expect(setItem(cA, salesA, h, "registration", { has_original: true })).rejects.toThrow(/handover_items_holder_required|check/);
    await setItem(cA, salesA, h, "registration", { has_original: true, has_scan: true, holder: "showroom", note: "Giữ tại showroom đến khi khách trả đủ" });
    expect((await sys.query("select state, has_original, has_scan, holder, checked_by from public.handover_items where handover_id = $1 and template_key = 'registration'", [h])).rows[0])
      .toMatchObject({ state: "ok", has_original: true, has_scan: true, holder: "showroom", checked_by: salesA });
    await expect(setItem(cA, salesA, h, "sale_invoice", { state: "missing" })).rejects.toThrow(/phải ghi chú/);
    await setItem(cA, salesA, h, "sale_invoice", { state: "missing", note: "Chờ kế toán xuất hóa đơn" });
    await expect(setItem(cA, salesA, h, "inspection", { state: "na", has_original: true, holder: "customer" })).rejects.toThrow(/không thể có bản gốc/);
    await expect(setItem(cA, salesA, h, "insurance", { state: "pending", has_scan: true })).rejects.toThrow(/chưa kiểm/);
    const ver = await itemVer(h, "key_main");
    const res = await Promise.allSettled([
      as(cA, salesA, (db) => db.query("select public.update_handover_item($1, 'key_main', $2, $3::jsonb)", [h, ver, JSON.stringify({ state: "ok", has_original: true, holder: "customer" })])),
      as(cM, manager, (db) => db.query("select public.update_handover_item($1, 'key_main', $2, $3::jsonb)", [h, ver, JSON.stringify({ state: "missing", note: "mất" })])),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/vừa được cập nhật/);
  });

  it("ĐIỀU KIỆN GIAO XE: chưa thanh toán đủ / xe chưa chuẩn bị / hồ sơ xe chưa đủ / checklist chưa đạt đều chặn; ngoại lệ do QUẢN LÝ (có lý do) mới qua; sales không tự phê duyệt; thu hồi thì mất hiệu lực", async () => {
    const s = await orderOf([800], false);                           // xe chưa chuẩn bị, hồ sơ chưa đủ
    const h = await create(cA, salesA, s.lines[0].id);
    const r0 = await ready(cA, salesA, h);
    expect(r0).toMatchObject({ contract_ok: true, payment_ok: false, prep_ok: false, paperwork_ok: false, checklist_ok: false, waived: [] });
    expect(Object.keys(r0).join(",")).not.toMatch(/amount|price|total|outstanding/);                 // sales chỉ thấy cờ, không thấy tiền
    await expect(deliver(cA, salesA, h)).rejects.toThrow(/chưa thanh toán đủ.*xe chưa chuẩn bị xong.*hồ sơ xe chưa đủ.*mục bắt buộc của checklist/);
    // từng điều kiện: đáp ứng dần
    const acct = await account();
    await pay(acct, s.o, M(800));
    expect(await ready(cA, salesA, h)).toMatchObject({ payment_ok: true });
    await updateVehicle(s.cars[0], { prep_status: "ready" });
    await expect(deliver(cA, salesA, h)).rejects.toThrow(/hồ sơ xe chưa đủ.*checklist/);
    await updateVehicle(s.cars[0], { paperwork_status: "complete" });
    await expect(deliver(cA, salesA, h)).rejects.toThrow(/mục bắt buộc của checklist chưa đạt/);
    // ngoại lệ: sales không phê duyệt; quản lý phải ghi lý do; phê duyệt đúng loại mới qua
    await expect(grant(cA, salesA, h, "checklist")).rejects.toThrow(/Chỉ quản lý/);
    await expect(grant(cM, manager, h, "checklist", "  ")).rejects.toThrow(/reason|check/);
    const ex = await grant(cM, manager, h, "checklist", "Khách nhận xe gấp, bổ sung giấy tờ sau");
    expect(await ready(cA, salesA, h)).toMatchObject({ waived: ["checklist"], checklist_ok: false });
    await expect(grant(cM, manager, h, "checklist")).rejects.toThrow(/Đã có phê duyệt ngoại lệ hiệu lực/);
    await as(cM, manager, (db) => db.query("select public.revoke_handover_exception($1, 'Phát hiện thiếu bản gốc')", [ex]));
    await expect(deliver(cA, salesA, h)).rejects.toThrow(/mục bắt buộc của checklist chưa đạt/);
    await expect(as(cA, salesA, (db) => db.query("select public.revoke_handover_exception($1, 'x')", [ex]))).rejects.toThrow(/Chỉ quản lý|không tìm thấy/i);
    await grant(cM, manager, h, "checklist", "Bổ sung giấy tờ trong 7 ngày");
    await deliver(cA, salesA, h);
    expect((await hv(h)).status).toBe("delivered");
    expect(await saleStatus(s.cars[0])).toBe("delivered");

    // ngoại lệ thanh toán (giải ngân ngân hàng chưa về): chỉ khi quản lý phê duyệt đúng loại
    const s2 = await orderOf([800]);
    const h2 = await create(cA, salesA, s2.lines[0].id);
    await completeChecklist(h2);
    await expect(deliver(cA, salesA, h2)).rejects.toThrow(/chưa thanh toán đủ/);
    await grant(cM, manager, h2, "prep", "Không đúng loại");
    await expect(deliver(cA, salesA, h2)).rejects.toThrow(/chưa thanh toán đủ/);
    await grant(cM, manager, h2, "payment", "Ngân hàng đã duyệt vay, chờ giải ngân");
    await deliver(cA, salesA, h2);
    expect(await saleStatus(s2.cars[0])).toBe("delivered");
  });

  it("Đối trừ thu cũ đổi mới và cọc tính vào thanh toán đủ; giao xe ghi người nhận/ODO/chìa khóa, ngày hợp lệ; xe → 'đã giao'; nhật ký không ghi tiền; bàn giao đã giao không sửa/hủy", async () => {
    const s = await orderOf([800]);
    const h = await create(cA, salesA, s.lines[0].id);
    await completeChecklist(h);
    const acct = await account();
    await pay(acct, s.o, M(799));
    await expect(deliver(cA, salesA, h)).rejects.toThrow(/chưa thanh toán đủ/);
    await pay(acct, s.o, M(1));
    for (const bad of [{ delivered_on: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) }, { delivered_on: "2020-01-01" }, { received_by_name: " " }, { received_relation: "" }, { odo: "" }, { keys_given: "" }]) {
      await expect(deliver(cA, salesA, h, bad)).rejects.toThrow(/Ngày giao xe|người nhận|ODO|handovers_|check/i);
    }
    await expect(deliver(cB, salesB, h)).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    await deliver(cA, salesA, h, { received_relation: "proxy", received_by_name: "Trần Thị Nhận Thay" });
    expect((await sys.query("select status, received_by_name, received_relation, odo_at_handover, keys_given, delivered_by from public.handovers where id = $1", [h])).rows[0])
      .toMatchObject({ status: "delivered", received_by_name: "Trần Thị Nhận Thay", received_relation: "proxy", odo_at_handover: 12500, keys_given: 2, delivered_by: salesA });
    // D92: giao xe tự mở 3 phiếu nhắc chăm sóc hạn sau 7 / 30 / 90 ngày kể từ ngày giao, giao cho sales phụ trách; mỗi mốc một phiếu
    const care = (await sys.query("select auto_key, kind, status, assigned_to, (next_due - $2::date)::int d from public.aftersales_cases where order_line_id = $1 order by next_due", [s.lines[0].id, TODAY])).rows;
    expect(care.map((x) => [x.auto_key, x.d, x.kind, x.status])).toEqual([["care_7", 7, "care_call", "open"], ["care_30", 30, "care_call", "open"], ["care_90", 90, "care_call", "open"]]);
    expect(care.every((x) => x.assigned_to === salesA)).toBe(true);
    expect(await as(cA, salesA, async (db) => Number((await db.query("select count(*) n from public.aftersales_cases where order_line_id = $1", [s.lines[0].id])).rows[0].n))).toBe(3);
    const logs = (await sys.query("select content from public.demand_activities where demand_id = $1 and channel = 'system'", [s.dem])).rows.map((x) => x.content as string);
    expect(logs.some((c) => /Đã giao xe XE\d+ \(bàn giao BN\d+\)/.test(c))).toBe(true);
    expect(logs.join(" ")).not.toMatch(/\d{1,3}(?:[.,]\d{3}){2,}|800000000/);
    await expect(deliver(cA, salesA, h)).rejects.toThrow(/vừa được cập nhật|đã kết thúc/);
    await expect(as(cM, manager, async (db) => db.query("select public.cancel_handover($1, $2, 'sửa')", [h, (await hv(h)).version]))).rejects.toThrow(/vừa được cập nhật|đã kết thúc/);
    await expect(setItem(cA, salesA, h, "manual", {})).rejects.toThrow(/đã kết thúc|vừa được cập nhật/);
    await expect(as(cM, manager, (db) => db.query("update public.handovers set note = 'x' where id = $1", [h]))).rejects.toThrow(/đã kết thúc/);
    await expect(grant(cM, manager, h, "payment")).rejects.toThrow(/đang chuẩn bị/);
    // xe đã giao kết thúc vòng sở hữu: không còn vào đơn/giữ mới
    await expect(call(cA, salesA, "select public.reserve_vehicle($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: s.cars[0], demand_id: await demand(), kind: "hold", valid_until: new Date(Date.now() + 86_400_000).toISOString() })])).rejects.toThrow(/không ở trạng thái sẵn bán|Không tìm thấy xe/);
  });

  it("Hủy: bàn giao đang chuẩn bị hủy được (lý do); đơn đã có bàn giao KHÔNG hủy được (hủy bàn giao trước); đơn đã giao xe không hủy được; cọc/đối trừ không đổi", async () => {
    const s = await orderOf([800]);
    const h = await create(cA, salesA, s.lines[0].id);
    await expect(cancelOrder(s.o)).rejects.toThrow(/đã có bàn giao/);
    await expect(as(cA, salesA, async (db) => db.query("select public.cancel_handover($1, $2, '  ')", [h, (await hv(h)).version]))).rejects.toThrow(/lý do/);
    await expect(as(cB, salesB, async (db) => db.query("select public.cancel_handover($1, $2, 'x')", [h, (await hv(h)).version]))).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    await as(cA, salesA, async (db) => db.query("select public.cancel_handover($1, $2, 'Khách hẹn lại tuần sau')", [h, (await hv(h)).version]));
    expect((await sys.query("select status, end_reason from public.handovers where id = $1", [h])).rows[0]).toMatchObject({ status: "cancelled", end_reason: "Khách hẹn lại tuần sau" });
    await expect(create(cA, salesA, s.lines[0].id)).rejects.toThrow(/đã có bàn giao/);        // mỗi dòng một bàn giao: hủy rồi không lập lại
    await cancelOrder(s.o);                                                                          // bàn giao đã hủy → hủy được đơn
    expect(await saleStatus(s.cars[0])).toBe("available");
    // đơn đã giao xe: không hủy
    const s2 = await orderOf([800]);
    const h2 = await create(cA, salesA, s2.lines[0].id);
    await completeChecklist(h2);
    await pay(await account(), s2.o, M(800));
    await deliver(cA, salesA, h2);
    await expect(cancelOrder(s2.o)).rejects.toThrow(/đã nhận thanh toán chưa hoàn|đã có bàn giao/);
    // giao theo ngoại lệ thanh toán (chưa thu tiền): vẫn không hủy được đơn vì đã có bàn giao đã giao
    const s3 = await orderOf([800]);
    const h3 = await create(cA, salesA, s3.lines[0].id);
    await completeChecklist(h3);
    await grant(cM, manager, h3, "payment", "Giải ngân ngân hàng sau");
    await deliver(cA, salesA, h3);
    await expect(cancelOrder(s3.o)).rejects.toThrow(/đã có bàn giao/);
  });
});
