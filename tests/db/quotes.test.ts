/**
 * Chặng 5 (lát 2): báo giá có phiên bản + duyệt giảm giá (database thật).
 * Chạy SQL dưới vai trò `authenticated` của từng người (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;
const IN_DAYS = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

d("Báo giá có phiên bản — chặng 5 lát 2 (database thật)", () => {
  let sys: Client, cM: Client, cM2: Client, cA: Client, cA2: Client, cB: Client;
  let manager: string, accountant: string, salesA: string, salesB: string, tech: string;

  beforeAll(async () => {
    sys = await connect(); cM = await connect(); cM2 = await connect(); cA = await connect(); cA2 = await connect(); cB = await connect();
    manager = await createUser(sys, "QL Báo giá", ["manager"]);
    accountant = await createUser(sys, "KT Báo giá", ["accountant"]);
    salesA = await createUser(sys, "Sales A Báo giá", ["sales"]);
    salesB = await createUser(sys, "Sales B Báo giá", ["sales"]);
    tech = await createUser(sys, "KTV Báo giá", ["technician"]);
  });
  afterAll(async () => { for (const c of [sys, cM, cM2, cA, cA2, cB]) await c.end(); });

  const call = <T = string>(client: Client, user: string | null, sql: string, params: unknown[] = []): Promise<T> =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0]?.r as T);
  const count = (client: Client, user: string | null, sql: string, params: unknown[] = []) =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0].n as number);

  /** Xe sở hữu đang bán. floor = undefined → chưa có giá sàn. */
  const ownedVehicle = async (floor: string | null = "650000000", asking = "700000000") => {
    const v = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), condition: "used", make: "Mazda", model: "CX-5", business_type: "owned", source_type: "individual", year_made: "2021",
      asking_price: asking, purchase_price: "600000000", ...(floor ? { floor_price: floor } : {}) })]);
    await setStatus(v, "available");
    return v;
  };
  const setStatus = (vehicle: string, status: string) =>
    as(cM, manager, async (db) => {
      const ver = (await db.query("select version from public.vehicles where id = $1", [vehicle])).rows[0].version;
      return db.query("select public.update_vehicle($1, $2, $3::jsonb)", [vehicle, ver, JSON.stringify({ sale_status: status })]);
    });
  const demand = (client: Client, user: string, extra: Record<string, unknown> = {}) =>
    call(client, user, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "buy", customer: { full_name: "Khách " + uuid().slice(0, 5) }, ...extra })]);
  const quote = (client: Client, user: string, vehicle: string, dem: string, price: string, extra: Record<string, unknown> = {}) =>
    call(client, user, "select public.create_quote($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), version_request_id: uuid(), vehicle_id: vehicle, demand_id: dem, offered_price: price, valid_until: IN_DAYS(3), benefits: "Tặng phim cách nhiệt", ...extra })]);
  const qver = async (id: string) => (await sys.query("select version from public.quotes where id = $1", [id])).rows[0].version as number;
  const versions = async (id: string) =>
    (await sys.query("select version_no n, status, needs_approval na, offered_price::text price, list_price::text list from public.quote_versions where quote_id = $1 order by version_no", [id])).rows as
      { n: number; status: string; na: boolean; price: string; list: string }[];
  const vId = async (quoteId: string, no: number) => (await sys.query("select id from public.quote_versions where quote_id = $1 and version_no = $2", [quoteId, no])).rows[0].id as string;
  const revise = (client: Client, user: string, id: string, price: string, extra: Record<string, unknown> = {}, version?: number) =>
    as(client, user, async (db) => (await db.query("select public.revise_quote($1, $2, $3::jsonb) r", [id, version ?? await qver(id), JSON.stringify({
      request_id: uuid(), offered_price: price, valid_until: IN_DAYS(3), ...extra })])).rows[0].r as string);
  const decide = (client: Client, user: string, versionId: string, approve: boolean, reason = "Khách quen, đồng ý giảm") =>
    as(client, user, (db) => db.query("select public.decide_quote_version($1, $2, $3)", [versionId, approve, reason]));
  const accept = (client: Client, user: string, id: string, no: number) =>
    as(client, user, async (db) => db.query("select public.accept_quote($1, $2, $3)", [id, await qver(id), await vId(id, no)]));

  it("Giá báo ≥ giá sàn: phát hành ngay; giá niêm yết lấy từ hệ thống; sales không đọc được giá sàn; sales khác/kỹ thuật/anon không thấy báo giá; không xóa", async () => {
    const v = await ownedVehicle("650000000", "700000000"), dA = await demand(cA, salesA);
    const q = await quote(cA, salesA, v, dA, "680000000", { list_price: "1" });
    expect(await versions(q)).toEqual([{ n: 1, status: "issued", na: false, price: "680000000", list: "700000000" }]);
    expect(await count(cA, salesA, "select count(*)::int n from public.vehicle_financials where vehicle_id = $1", [v])).toBe(0);
    for (const u of [manager, accountant]) expect(await count(cM, u, "select count(*)::int n from public.quotes where id = $1", [q])).toBe(1);
    for (const [cl, u] of [[cB, salesB], [cB, tech]] as const) {
      expect(await count(cl, u, "select count(*)::int n from public.quotes where id = $1", [q])).toBe(0);
      expect(await count(cl, u, "select count(*)::int n from public.quote_versions where quote_id = $1", [q])).toBe(0);
    }
    await expect(as(cB, null, (db) => db.query("select count(*) from public.quotes"))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("delete from public.quotes where id = $1", [q]))).rejects.toThrow(/permission denied/);
    await expect(as(cM, manager, (db) => db.query("delete from public.quote_versions where quote_id = $1", [q]))).rejects.toThrow(/permission denied/);
    // giá đúng bằng giá sàn vẫn đạt
    const dA2 = await demand(cA, salesA);
    const q2 = await quote(cA, salesA, v, dA2, "650000000");
    expect((await versions(q2))[0]).toMatchObject({ status: "issued", na: false });
  });

  it("Giá báo < giá sàn hoặc xe CHƯA có giá sàn: chờ duyệt; sales không tự duyệt; duyệt/từ chối phải có lý do; chỉ bản đã duyệt mới chấp nhận được", async () => {
    const v = await ownedVehicle("650000000"), vNoFloor = await ownedVehicle(null);
    const dA = await demand(cA, salesA), dA2 = await demand(cA, salesA);
    const q = await quote(cA, salesA, v, dA, "640000000");
    expect(await versions(q)).toMatchObject([{ status: "pending_approval", na: true }]);
    const qNo = await quote(cA, salesA, vNoFloor, dA2, "999999999");   // thiếu giá sàn không coi là "đạt"
    expect(await versions(qNo)).toMatchObject([{ status: "pending_approval", na: true }]);

    await expect(accept(cA, salesA, q, 1)).rejects.toThrow(/đã phát hành/);
    await expect(decide(cA, salesA, await vId(q, 1), true)).rejects.toThrow(/Chỉ quản lý/);
    await expect(as(cA, salesA, (db) => db.query("update public.quote_versions set status = 'issued', decision_reason = 'tự duyệt' where quote_id = $1", [q]))).rejects.toThrow(/Chỉ quản lý/);
    await expect(decide(cM, manager, await vId(q, 1), true, "  ")).rejects.toThrow(/lý do/);
    await expect(decide(cM, accountant, await vId(q, 1), true)).rejects.toThrow(/Chỉ quản lý/);

    await decide(cM, manager, await vId(q, 1), true, "Khách quen, chốt hôm nay");
    expect(await versions(q)).toMatchObject([{ status: "issued", na: true }]);
    expect((await sys.query("select decided_by, decision_reason from public.quote_versions where quote_id = $1", [q])).rows[0]).toMatchObject({ decided_by: manager, decision_reason: "Khách quen, chốt hôm nay" });
    await expect(decide(cM, manager, await vId(q, 1), false, "Đổi ý")).rejects.toThrow(/đang chờ duyệt/);   // đã xử lý, không duyệt lại
    await accept(cA, salesA, q, 1);
    expect(await versions(q)).toMatchObject([{ status: "accepted" }]);
    expect((await sys.query("select status from public.quotes where id = $1", [q])).rows[0].status).toBe("accepted");
    await expect(accept(cA, salesA, q, 1)).rejects.toThrow(/vừa được cập nhật|đã kết thúc/);

    await decide(cM, manager, await vId(qNo, 1), false, "Chưa có giá sàn, chờ định giá");
    expect(await versions(qNo)).toMatchObject([{ status: "rejected" }]);
  });

  it("Phiên bản bất biến; sửa giá = phiên bản mới: bản đã phát hành → đã thay thế, bản chờ duyệt → hủy, bản bị từ chối giữ nguyên; retry cùng request_id không sinh trùng", async () => {
    const v = await ownedVehicle("650000000"), dA = await demand(cA, salesA);
    const q = await quote(cA, salesA, v, dA, "680000000");
    await expect(as(cA, salesA, (db) => db.query("update public.quote_versions set offered_price = 1 where quote_id = $1", [q]))).rejects.toThrow(/không sửa/);
    await expect(as(cM, manager, (db) => db.query("update public.quote_versions set needs_approval = true where quote_id = $1", [q]))).rejects.toThrow(/không sửa/);
    await expect(as(cM, manager, (db) => db.query("update public.quotes set vehicle_id = $2 where id = $1", [q, v]))).resolves.toBeDefined();   // không đổi giá trị → cho qua
    await expect(as(cM, manager, async (db) => db.query("update public.quotes set demand_id = $2 where id = $1", [q, await demand(cM, manager)]))).rejects.toThrow(/Không đổi xe, khách/);

    const rid = uuid();
    const r1 = await as(cA, salesA, async (db) => (await db.query("select public.revise_quote($1, $2, $3::jsonb) r", [q, await qver(q), JSON.stringify({ request_id: rid, offered_price: "640000000", valid_until: IN_DAYS(3) })])).rows[0].r as string);
    const r2 = await as(cA, salesA, async (db) => (await db.query("select public.revise_quote($1, $2, $3::jsonb) r", [q, 1, JSON.stringify({ request_id: rid, offered_price: "640000000", valid_until: IN_DAYS(3) })])).rows[0].r as string);
    expect(r2).toBe(r1);                                         // cùng request_id → cùng kết quả
    expect(await versions(q)).toMatchObject([{ n: 1, status: "superseded" }, { n: 2, status: "pending_approval", na: true }]);

    await revise(cA, salesA, q, "690000000");                    // bản chờ duyệt bị thay
    expect(await versions(q)).toMatchObject([{ status: "superseded" }, { status: "cancelled" }, { n: 3, status: "issued", na: false }]);
    await revise(cA, salesA, q, "630000000");                    // v4 chờ duyệt
    await decide(cM, manager, await vId(q, 4), false, "Giá quá thấp");
    await revise(cA, salesA, q, "670000000");                    // v5: bản bị từ chối giữ nguyên làm bằng chứng
    expect((await versions(q)).map((x) => x.status)).toEqual(["superseded", "cancelled", "superseded", "rejected", "issued"]);
    expect((await versions(q)).map((x) => x.n)).toEqual([1, 2, 3, 4, 5]);

    await expect(revise(cB, salesB, q, "600000000", {}, await qver(q))).rejects.toThrow(/không có quyền|Tải lại/);
    await expect(revise(cA, salesA, q, "670000000", { valid_until: IN_DAYS(-1) })).rejects.toThrow(/tương lai/);
  });

  it("§12.10 Đồng thời: hai người sửa cùng phiên bản báo giá → một thắng; hai báo giá mở cùng khách+xe → một thắng", async () => {
    const v = await ownedVehicle("650000000"), dA = await demand(cA, salesA);
    const q = await quote(cA, salesA, v, dA, "680000000");
    const ver = await qver(q);
    const results = await Promise.allSettled([
      revise(cA, salesA, q, "670000000", {}, ver),
      revise(cM, manager, q, "660000000", {}, ver),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((results.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/vừa được cập nhật|Tải lại/);
    expect((await versions(q)).map((x) => x.n)).toEqual([1, 2]);

    const v2 = await ownedVehicle("650000000"), dB = await demand(cA, salesA);
    const both = await Promise.allSettled([quote(cA, salesA, v2, dB, "680000000"), quote(cA2, salesA, v2, dB, "690000000")]);
    expect(both.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((both.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/Đã có báo giá đang mở/);
    expect((await sys.query("select count(*)::int n from public.quotes where vehicle_id = $1 and status = 'open'", [v2])).rows[0].n).toBe(1);
    // retry cùng request_id khi báo giá đã tạo → trả lại đúng báo giá cũ
    const rid = uuid(), vrid = uuid();
    const mk = () => call(cA, salesA, "select public.create_quote($1::jsonb) r", [JSON.stringify({ request_id: rid, version_request_id: vrid, vehicle_id: ownedVehicleId, demand_id: dRetry, offered_price: "680000000", valid_until: IN_DAYS(3) })]);
    const ownedVehicleId = await ownedVehicle("650000000"), dRetry = await demand(cA, salesA);
    const a = await mk(), b = await mk();
    expect(b).toBe(a);
    expect((await versions(a))).toHaveLength(1);
  });

  it("Hết hạn không chấp nhận; hạn phải ở tương lai; hủy báo giá phải có lý do và cho lập báo giá mới; xe chưa chào bán / nhu cầu không phải của mình bị từ chối", async () => {
    const v = await ownedVehicle("650000000"), dA = await demand(cA, salesA);
    await expect(quote(cA, salesA, v, dA, "680000000", { valid_until: IN_DAYS(-1) })).rejects.toThrow(/tương lai/);
    const soon = new Date(Date.now() + 1500).toISOString();
    const q = await quote(cA, salesA, v, dA, "680000000", { valid_until: soon });
    await new Promise((r) => setTimeout(r, 2000));
    await expect(accept(cA, salesA, q, 1)).rejects.toThrow(/hết hạn/);

    await expect(as(cA, salesA, async (db) => db.query("select public.cancel_quote($1, $2, '  ')", [q, await qver(q)]))).rejects.toThrow(/lý do/);
    await as(cA, salesA, async (db) => db.query("select public.cancel_quote($1, $2, 'Khách hết quan tâm')", [q, await qver(q)]));
    expect((await sys.query("select status, end_reason from public.quotes where id = $1", [q])).rows[0]).toMatchObject({ status: "cancelled", end_reason: "Khách hết quan tâm" });
    expect(await versions(q)).toMatchObject([{ status: "cancelled" }]);
    await expect(revise(cA, salesA, q, "670000000")).rejects.toThrow(/đã kết thúc|Tải lại/);
    expect(await quote(cA, salesA, v, dA, "680000000")).toBeTruthy();                       // hủy xong lập lại được

    const vNot = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({ request_id: uuid(), condition: "used", make: "Kia", model: "K3", business_type: "owned", source_type: "individual", year_made: "2020" })]);
    await expect(quote(cA, salesA, vNot, await demand(cA, salesA), "500000000")).rejects.toThrow(/chưa chào bán|Không tìm thấy xe/);
    await expect(quote(cB, salesB, v, dA, "680000000")).rejects.toThrow(/Không tìm thấy nhu cầu|Chỉ người phụ trách/);   // nhu cầu của sales A
    await expect(quote(cM, tech, v, dA, "680000000")).rejects.toThrow(/không có quyền|Không tìm thấy nhu cầu/);
    await expect(quote(cM, accountant, v, dA, "680000000")).rejects.toThrow(/không có quyền|Không tìm thấy nhu cầu/);
    // nhu cầu BÁN không báo giá được
    const dSell = await demand(cA, salesA, { kind: "sell", sell_offer: { make: "toyota", model: "vios", year_made: "2020", asking_price: "400000000", sale_mode: "consignment" } });
    await expect(quote(cA, salesA, v, dSell, "680000000")).rejects.toThrow(/nhu cầu MUA|Không tìm thấy nhu cầu/);
  });

  it("Xe đang được giữ/cọc cho KHÁCH KHÁC không báo giá được; khách đang giữ xe thì báo giá được", async () => {
    const v = await ownedVehicle("650000000"), dA = await demand(cA, salesA), dB = await demand(cB, salesB);
    await call(cB, salesB, "select public.reserve_vehicle($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: v, demand_id: dB, kind: "hold", valid_until: IN_DAYS(2) })]);
    await expect(quote(cA, salesA, v, dA, "680000000")).rejects.toThrow(/giữ\/đặt cọc cho khách khác/);
    expect(await quote(cB, salesB, v, dB, "680000000")).toBeTruthy();
  });

  it("Xe ký gửi: duyệt theo QUYỀN GIẢM GIÁ trong thỏa thuận đã ký (1% của 650 triệu = 6,5 triệu); sales không đọc được thỏa thuận", async () => {
    const mk = async (terms: Record<string, unknown>) => {
      const vehicle = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
        request_id: uuid(), condition: "used", make: "Honda", model: "Accord", business_type: "consignment", source_type: "individual", year_made: "2020", asking_price: "650000000" })]);
      const contract = await call(cM, manager, "select public.create_consignment_contract($1::jsonb) r", [JSON.stringify({
        request_id: uuid(), vehicle_id: vehicle, owner_name: "Nguyễn Văn Chủ", owner_phone: "0912345678", owner_id_number: "008099001234",
        start_date: "2026-10-01", end_date: "2026-12-31", received_at: "2026-10-01", keys_count: 2,
        documents_received: "Cà vẹt bản gốc", condition_at_receipt: "Trầy nhẹ cản trước" })]);
      await call(cM, manager, "select public.add_consignment_terms($1, $2::jsonb) r", [contract, JSON.stringify({
        request_id: uuid(), owner_expected_amount: "600000000", list_price: "650000000", discount_limit_type: "percent", discount_limit_percent: "1",
        fee_type: "percent_of_sale_price", fee_percent: "3", buyer_contract_party: "showroom", payment_collector: "showroom", signed_on: "2026-10-01", ...terms })]);
      await as(cM, manager, async (db) => db.query("select public.activate_consignment_contract($1, $2)", [contract, (await db.query("select version from public.consignment_contracts where id = $1", [contract])).rows[0].version]));
      await setStatus(vehicle, "available");
      return vehicle;
    };
    const v = await mk({});
    const dem = [await demand(cA, salesA), await demand(cA, salesA), await demand(cA, salesA)];
    const within = await quote(cA, salesA, v, dem[0], "643500000");     // giảm đúng 6,5 triệu
    const over = await quote(cA, salesA, v, dem[1], "643499999");       // vượt 1 đồng
    const above = await quote(cA, salesA, v, dem[2], "660000000");      // cao hơn giá chào
    expect((await versions(within))[0]).toMatchObject({ status: "issued", na: false });
    expect((await versions(over))[0]).toMatchObject({ status: "pending_approval", na: true });
    expect((await versions(above))[0]).toMatchObject({ status: "issued", na: false });
    expect(await count(cA, salesA, "select count(*)::int n from public.consignment_terms")).toBe(0);

    const vNone = await mk({ discount_limit_type: "none", discount_limit_percent: undefined });
    const q = await quote(cA, salesA, vNone, await demand(cA, salesA), "649999999");
    expect((await versions(q))[0]).toMatchObject({ status: "pending_approval", na: true });
    const vAmt = await mk({ discount_limit_type: "amount", discount_limit_amount: "10000000", discount_limit_percent: undefined });
    expect((await versions(await quote(cA, salesA, vAmt, await demand(cA, salesA), "640000000")))[0]).toMatchObject({ na: false });
    expect((await versions(await quote(cA, salesA, vAmt, await demand(cA, salesA), "639999999")))[0]).toMatchObject({ na: true });
  });
});
