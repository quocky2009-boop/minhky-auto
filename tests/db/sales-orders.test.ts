/**
 * Chặng 5 (lát 3): đơn bán nhiều xe + hợp đồng bán (database thật).
 * Chạy SQL dưới vai trò `authenticated` của từng người (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;
const IN_DAYS = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

d("Đơn bán nhiều xe — chặng 5 lát 3 (database thật)", () => {
  let sys: Client, cM: Client, cA: Client, cA2: Client, cB: Client;
  let manager: string, accountant: string, salesA: string, salesB: string, tech: string;

  beforeAll(async () => {
    sys = await connect(); cM = await connect(); cA = await connect(); cA2 = await connect(); cB = await connect();
    manager = await createUser(sys, "QL Đơn bán", ["manager"]);
    accountant = await createUser(sys, "KT Đơn bán", ["accountant"]);
    salesA = await createUser(sys, "Sales A Đơn bán", ["sales"]);
    salesB = await createUser(sys, "Sales B Đơn bán", ["sales"]);
    tech = await createUser(sys, "KTV Đơn bán", ["technician"]);
  });
  afterAll(async () => { for (const c of [sys, cM, cA, cA2, cB]) await c.end(); });

  const call = <T = string>(client: Client, user: string | null, sql: string, params: unknown[] = []): Promise<T> =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0]?.r as T);
  const count = (client: Client, user: string | null, sql: string, params: unknown[] = []) =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0].n as number);
  const setStatus = (vehicle: string, status: string) =>
    as(cM, manager, async (db) => {
      const ver = (await db.query("select version from public.vehicles where id = $1", [vehicle])).rows[0].version;
      return db.query("select public.update_vehicle($1, $2, $3::jsonb)", [vehicle, ver, JSON.stringify({ sale_status: status })]);
    });
  const vehicle = async (floor: string | null = "650000000", asking = "700000000") => {
    const v = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), condition: "used", make: "Mazda", model: "CX-5", business_type: "owned", source_type: "individual", year_made: "2021",
      asking_price: asking, purchase_price: "600000000", ...(floor ? { floor_price: floor } : {}) })]);
    await setStatus(v, "available");
    return v;
  };
  const demand = (client: Client, user: string, extra: Record<string, unknown> = {}) =>
    call(client, user, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "buy", customer: { full_name: "Khách " + uuid().slice(0, 5) }, ...extra })]);
  const order = (client: Client, user: string, dem: string, lines: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
    call(client, user, "select public.create_sales_order($1::jsonb) r", [JSON.stringify({ request_id: uuid(), demand_id: dem, lines, ...extra })]);
  const line = (v: string, price = "680000000", extra: Record<string, unknown> = {}) => ({ vehicle_id: v, sale_price: price, ...extra });
  const overs = async (id: string) => (await sys.query("select version, status from public.sales_orders where id = $1", [id])).rows[0] as { version: number; status: string };
  const confirm = (client: Client, user: string, id: string, extra: Record<string, unknown> = { contract_ref: "HĐB-001", contract_date: TODAY }) =>
    as(client, user, async (db) => db.query("select public.confirm_sales_order($1, $2, $3::jsonb)", [id, (await overs(id)).version, JSON.stringify(extra)]));
  const cancel = (client: Client, user: string, id: string, reason = "Khách đổi ý") =>
    as(client, user, async (db) => db.query("select public.cancel_sales_order($1, $2, $3)", [id, (await overs(id)).version, reason]));
  const saleStatus = async (v: string) => (await sys.query("select sale_status from public.vehicles where id = $1", [v])).rows[0].sale_status as string;
  const lines = async (id: string) => (await sys.query("select vehicle_id, sale_price::text price, needs_approval na, line_status st from public.sales_order_lines where order_id = $1 order by created_at, vehicle_id", [id])).rows as
    { vehicle_id: string; price: string; na: boolean; st: string }[];

  it("Đơn bán NHIỀU XE: sales thấy đơn của mình; sales khác/kỹ thuật/anon không thấy; kế toán xem; không xóa; gửi lặp cùng request_id không sinh trùng", async () => {
    const v1 = await vehicle(), v2 = await vehicle(), dA = await demand(cA, salesA);
    const rid = uuid();
    const mk = () => call(cA, salesA, "select public.create_sales_order($1::jsonb) r", [JSON.stringify({ request_id: rid, demand_id: dA, lines: [line(v1), line(v2, "690000000")] })]);
    const o = await mk(), again = await mk();
    expect(again).toBe(o);
    expect(await lines(o)).toHaveLength(2);
    expect((await sys.query("select count(*)::int n from public.sales_orders where client_request_id = $1", [rid])).rows[0].n).toBe(1);
    for (const u of [manager, accountant]) expect(await count(cM, u, "select count(*)::int n from public.sales_orders where id = $1", [o])).toBe(1);
    expect(await count(cA, salesA, "select count(*)::int n from public.sales_order_lines where order_id = $1", [o])).toBe(2);
    for (const [cl, u] of [[cB, salesB], [cB, tech]] as const) {
      expect(await count(cl, u, "select count(*)::int n from public.sales_orders where id = $1", [o])).toBe(0);
      expect(await count(cl, u, "select count(*)::int n from public.sales_order_lines where order_id = $1", [o])).toBe(0);
    }
    await expect(as(cB, null, (db) => db.query("select count(*) from public.sales_orders"))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("delete from public.sales_orders where id = $1", [o]))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("delete from public.sales_order_lines where order_id = $1", [o]))).rejects.toThrow(/permission denied/);
    await expect(order(cA, salesA, dA, [])).rejects.toThrow(/ít nhất một xe/);
  });

  it("Xác nhận: bắt buộc số hợp đồng + ngày ký (không ở tương lai); xe chuyển 'đã bán'; giữ/cọc của nhu cầu này thành 'đã thành đơn bán'; nhật ký nhu cầu không ghi số tiền", async () => {
    const v1 = await vehicle(), v2 = await vehicle(), dA = await demand(cA, salesA);
    await call(cA, salesA, "select public.reserve_vehicle($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: v1, demand_id: dA, kind: "deposit", deposit_amount: "30000000" })]);
    expect(await saleStatus(v1)).toBe("deposited");
    const o = await order(cA, salesA, dA, [line(v1, "680000000"), line(v2, "690000000")]);
    await expect(confirm(cA, salesA, o, {})).rejects.toThrow(/số hợp đồng bán và ngày ký/);
    await expect(confirm(cA, salesA, o, { contract_ref: "HĐB-9", contract_date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) })).rejects.toThrow(/tương lai/);
    await confirm(cA, salesA, o, { contract_ref: "HĐB-001", contract_date: TODAY });
    expect((await overs(o)).status).toBe("confirmed");
    expect(await saleStatus(v1)).toBe("sold"); expect(await saleStatus(v2)).toBe("sold");
    expect((await sys.query("select status from public.vehicle_reservations where vehicle_id = $1", [v1])).rows[0].status).toBe("fulfilled");
    const logs = (await sys.query("select content from public.demand_activities where demand_id = $1 and channel = 'system'", [dA])).rows.map((x) => x.content as string);
    expect(logs.some((c) => /Đã xác nhận đơn bán DB\d+ \(hợp đồng HĐB-001\)/.test(c))).toBe(true);
    expect(logs.join(" ")).not.toMatch(/680[.,]?000|690[.,]?000|30[.,]?000[.,]?000/);
    // sales không còn đọc được xe đã bán, nhưng vẫn thấy nhãn xe ghi trên đơn của mình
    expect(await count(cA, salesA, "select count(*)::int n from public.vehicles where id = $1", [v1])).toBe(0);
    expect((await as(cA, salesA, async (db) => (await db.query("select vehicle_label l from public.sales_order_lines where order_id = $1 and vehicle_id = $2", [o, v1])).rows[0].l as string))).toMatch(/^XE\d+ Mazda CX-5/);
    // đã xác nhận: không sửa hợp đồng, không sửa lại danh sách xe, sales không tự hủy
    await expect(as(cA, salesA, (db) => db.query("update public.sales_orders set contract_ref = 'SAI' where id = $1", [o]))).rejects.toThrow(/Chỉ người phụ trách \(khi đang soạn\) hoặc quản lý/);
    await expect(as(cM, manager, (db) => db.query("update public.sales_orders set contract_ref = 'SAI' where id = $1", [o]))).rejects.toThrow(/không sửa hợp đồng/);
    await expect(as(cA, salesA, async (db) => db.query("select public.update_sales_order_draft($1, $2, $3::jsonb)", [o, (await overs(o)).version, JSON.stringify({ lines: [line(v1)] })]))).rejects.toThrow(/không còn ở trạng thái đang soạn/);
    await expect(cancel(cA, salesA, o)).rejects.toThrow(/Chỉ người phụ trách \(khi đang soạn\) hoặc quản lý|không có quyền/);
    // quản lý hủy: bắt buộc lý do; xe trở lại đang bán; giữ/cọc đã chốt KHÔNG tự sống lại
    await expect(cancel(cM, manager, o, "  ")).rejects.toThrow(/lý do/);
    await cancel(cM, manager, o, "Khách không nhận xe, hủy hợp đồng");
    expect((await overs(o)).status).toBe("cancelled");
    expect(await saleStatus(v1)).toBe("available"); expect(await saleStatus(v2)).toBe("available");
    expect((await lines(o)).map((x) => x.st)).toEqual(["cancelled", "cancelled"]);
    expect((await sys.query("select status from public.vehicle_reservations where vehicle_id = $1", [v1])).rows[0].status).toBe("fulfilled");
    // xe được bán lại cho khách khác
    const dB = await demand(cB, salesB);
    expect(await order(cB, salesB, dB, [line(v1)])).toBeTruthy();
  });

  it("§12.4 ĐỘC QUYỀN: hai đơn CÙNG LÚC cùng một xe → chỉ một đơn thắng; đơn thua không để lại dòng nào", async () => {
    for (let round = 0; round < 3; round++) {
      const v = await vehicle(), v2 = await vehicle();
      const dA = await demand(cA, salesA), dB = await demand(cB, salesB);
      const results = await Promise.allSettled([order(cA, salesA, dA, [line(v), line(v2)]), order(cB, salesB, dB, [line(v)])]);
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(String((results.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/đã nằm trong đơn bán khác/);
      expect((await sys.query("select count(*)::int n from public.sales_order_lines where vehicle_id = $1 and line_status = 'active'", [v])).rows[0].n).toBe(1);
      expect((await sys.query("select count(*)::int n from public.sales_orders o where o.demand_id in ($1, $2)", [dA, dB])).rows[0].n).toBe(1);
    }
  });

  it("Giá thấp hơn mức cho phép: sales KHÔNG xác nhận được; quản lý xác nhận phải ghi lý do; giá đúng báo giá đã chấp nhận thì không cần duyệt lại", async () => {
    const v = await vehicle("650000000"), vOk = await vehicle("650000000"), dA = await demand(cA, salesA);
    const o = await order(cA, salesA, dA, [line(v, "640000000"), line(vOk, "660000000")]);
    expect((await lines(o)).map((x) => x.na).sort()).toEqual([false, true]);
    await expect(confirm(cA, salesA, o)).rejects.toThrow(/chỉ quản lý\/admin được xác nhận/);
    await expect(confirm(cM, manager, o)).rejects.toThrow(/lý do duyệt giá bán/);
    await confirm(cM, manager, o, { contract_ref: "HĐB-002", contract_date: TODAY, approval_reason: "Khách quen, chốt trong ngày" });
    expect((await sys.query("select approval_reason, confirmed_by from public.sales_orders where id = $1", [o])).rows[0]).toMatchObject({ approval_reason: "Khách quen, chốt trong ngày", confirmed_by: manager });
    expect(await saleStatus(v)).toBe("sold");

    // giá khai bằng giá trong báo giá đã chấp nhận (báo giá đã qua duyệt) → không cần duyệt lại; khác giá → từ chối
    const v3 = await vehicle("650000000"), dQ = await demand(cA, salesA);
    const q = await call(cA, salesA, "select public.create_quote($1::jsonb) r", [JSON.stringify({ request_id: uuid(), version_request_id: uuid(), vehicle_id: v3, demand_id: dQ, offered_price: "640000000", valid_until: IN_DAYS(3) })]);
    const qv = (await sys.query("select id from public.quote_versions where quote_id = $1", [q])).rows[0].id as string;
    await expect(order(cA, salesA, dQ, [line(v3, "640000000", { quote_version_id: qv })])).rejects.toThrow(/đã chấp nhận/);    // chưa được duyệt/chấp nhận
    await as(cM, manager, (db) => db.query("select public.decide_quote_version($1, true, 'Khách quen')", [qv]));
    await as(cA, salesA, async (db) => db.query("select public.accept_quote($1, $2, $3)", [q, (await sys.query("select version from public.quotes where id = $1", [q])).rows[0].version, qv]));
    await expect(order(cA, salesA, dQ, [line(v3, "635000000", { quote_version_id: qv })])).rejects.toThrow(/khác giá trong báo giá/);
    const dOther = await demand(cA, salesA);
    await expect(order(cA, salesA, dOther, [line(v3, "640000000", { quote_version_id: qv })])).rejects.toThrow(/đúng xe và đúng nhu cầu/);
    const o2 = await order(cA, salesA, dQ, [line(v3, "640000000", { quote_version_id: qv })]);
    expect((await lines(o2))[0]).toMatchObject({ na: false });
    await confirm(cA, salesA, o2, { contract_ref: "HĐB-003", contract_date: TODAY });          // sales tự xác nhận được vì giá đã qua duyệt
    expect(await saleStatus(v3)).toBe("sold");
    // thiếu giá sàn không coi là đạt
    const vNo = await vehicle(null), dN = await demand(cA, salesA);
    expect((await lines(await order(cA, salesA, dN, [line(vNo, "999000000")])))[0].na).toBe(true);
  });

  it("Điều kiện: xe chưa chào bán/đã bán không vào đơn; xe giữ/cọc cho khách KHÁC không vào đơn; nhu cầu của người khác/nhu cầu bán bị từ chối; kế toán/kỹ thuật không lập", async () => {
    const v = await vehicle(), dA = await demand(cA, salesA), dB = await demand(cB, salesB);
    await call(cB, salesB, "select public.reserve_vehicle($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: v, demand_id: dB, kind: "hold", valid_until: IN_DAYS(2) })]);
    await expect(order(cA, salesA, dA, [line(v)])).rejects.toThrow(/giữ\/đặt cọc cho khách khác/);
    expect(await order(cB, salesB, dB, [line(v)])).toBeTruthy();                                 // chính khách đang giữ thì được
    const vNot = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({ request_id: uuid(), condition: "used", make: "Kia", model: "K3", business_type: "owned", source_type: "individual", year_made: "2020" })]);
    await expect(order(cA, salesA, dA, [line(vNot)])).rejects.toThrow(/chưa chào bán|Không tìm thấy xe/);
    const v2 = await vehicle();
    await expect(order(cB, salesB, dA, [line(v2)])).rejects.toThrow(/Không tìm thấy nhu cầu|Chỉ người phụ trách/);
    await expect(order(cM, accountant, dA, [line(v2)])).rejects.toThrow(/không có quyền|Không tìm thấy nhu cầu/);
    await expect(order(cM, tech, dA, [line(v2)])).rejects.toThrow(/không có quyền|Không tìm thấy nhu cầu/);
    const dSell = await demand(cA, salesA, { kind: "sell", sell_offer: { make: "toyota", model: "vios", year_made: "2020", asking_price: "400000000", sale_mode: "consignment" } });
    await expect(order(cA, salesA, dSell, [line(v2)])).rejects.toThrow(/nhu cầu MUA|Không tìm thấy nhu cầu/);
    await expect(order(cA, salesA, dA, [line(v2, "0")])).rejects.toThrow(/sale_price|check/);
  });

  it("Sửa đơn nháp thay danh sách xe (dòng cũ 'đã bỏ' vẫn lưu, xe được trả tự do); dòng không sửa trực tiếp; sales khác không sửa; sửa đồng thời cùng phiên bản → một thắng", async () => {
    const v1 = await vehicle(), v2 = await vehicle(), dA = await demand(cA, salesA);
    const o = await order(cA, salesA, dA, [line(v1)]);
    const upd = (client: Client, user: string, lns: Record<string, unknown>[], version?: number) =>
      as(client, user, async (db) => db.query("select public.update_sales_order_draft($1, $2, $3::jsonb)", [o, version ?? (await overs(o)).version, JSON.stringify({ contract_ref: "HĐB-X", lines: lns })]));
    await upd(cA, salesA, [line(v2, "690000000")]);
    expect((await lines(o)).map((x) => [x.vehicle_id === v1 ? "v1" : "v2", x.st])).toEqual([["v1", "removed"], ["v2", "active"]]);
    await upd(cA, salesA, [line(v1), line(v2)]);                                                 // bỏ rồi thêm lại được
    expect((await lines(o)).filter((x) => x.st === "active")).toHaveLength(2);
    await expect(as(cA, salesA, (db) => db.query("update public.sales_order_lines set sale_price = 1 where order_id = $1", [o]))).rejects.toThrow(/không sửa/);
    await expect(upd(cB, salesB, [line(v1)])).rejects.toThrow(/không còn ở trạng thái đang soạn|không có quyền/);
    const ver = (await overs(o)).version;
    const res = await Promise.allSettled([upd(cA, salesA, [line(v1, "670000000")], ver), upd(cM, manager, [line(v1, "671000000")], ver)]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((res.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/vừa được cập nhật/);
    await cancel(cA, salesA, o, "Khách chưa quyết");                                             // người phụ trách hủy đơn nháp được
    expect((await overs(o)).status).toBe("cancelled");
    expect(await saleStatus(v1)).toBe("available");
  });

  it("Xe ký gửi vào đơn bán được khi có hợp đồng ký gửi hiệu lực; xác nhận chuyển 'đã bán'", async () => {
    const veh = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), condition: "used", make: "Honda", model: "Accord", business_type: "consignment", source_type: "individual", year_made: "2020", asking_price: "650000000" })]);
    const contract = await call(cM, manager, "select public.create_consignment_contract($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), vehicle_id: veh, owner_name: "Nguyễn Văn Chủ", owner_phone: "0912345678", owner_id_number: "008099001234",
      start_date: "2026-10-01", end_date: "2026-12-31", received_at: "2026-10-01", keys_count: 2, documents_received: "Cà vẹt bản gốc", condition_at_receipt: "Trầy nhẹ" })]);
    await call(cM, manager, "select public.add_consignment_terms($1, $2::jsonb) r", [contract, JSON.stringify({
      request_id: uuid(), owner_expected_amount: "600000000", list_price: "650000000", discount_limit_type: "percent", discount_limit_percent: "1",
      fee_type: "percent_of_sale_price", fee_percent: "3", buyer_contract_party: "showroom", payment_collector: "showroom", signed_on: "2026-10-01" })]);
    await as(cM, manager, async (db) => db.query("select public.activate_consignment_contract($1, $2)", [contract, (await db.query("select version from public.consignment_contracts where id = $1", [contract])).rows[0].version]));
    await setStatus(veh, "available");
    const dA = await demand(cA, salesA);
    const o = await order(cA, salesA, dA, [line(veh, "645000000")]);        // giảm 5 triệu ≤ 6,5 triệu quyền giảm giá
    expect((await lines(o))[0].na).toBe(false);
    await confirm(cA, salesA, o, { contract_ref: "HĐB-KG-1", contract_date: TODAY });
    expect(await saleStatus(veh)).toBe("sold");
  });
});
