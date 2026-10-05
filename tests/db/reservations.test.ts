/**
 * Chặng 5 (lát 1): giữ xe và đặt cọc — độc quyền theo xe (§12.4: hai người giữ/cọc cùng xe, chỉ một giao dịch thắng — thử đồng thời THẬT ở database).
 * Chạy SQL dưới vai trò `authenticated` của từng người (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;
const IN_DAYS = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

d("Giữ xe và đặt cọc — chặng 5 lát 1 (database thật)", () => {
  let sys: Client, cM: Client, cM2: Client, cA: Client, cB: Client;
  let manager: string, accountant: string, salesA: string, salesB: string, tech: string;

  beforeAll(async () => {
    sys = await connect(); cM = await connect(); cM2 = await connect(); cA = await connect(); cB = await connect();
    manager = await createUser(sys, "QL Giữ xe", ["manager"]);
    accountant = await createUser(sys, "KT Giữ xe", ["accountant"]);
    salesA = await createUser(sys, "Sales A Giữ xe", ["sales"]);
    salesB = await createUser(sys, "Sales B Giữ xe", ["sales"]);
    tech = await createUser(sys, "KTV Giữ xe", ["technician"]);
  });
  afterAll(async () => { await sys.end(); await cM.end(); await cM2.end(); await cA.end(); await cB.end(); });

  const call = <T = string>(client: Client, user: string, sql: string, params: unknown[] = []): Promise<T> =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0]?.r as T);
  /** Xe sở hữu đang bán (available). */
  const listedVehicle = async (business = "owned") => {
    const v = await call(cM, manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), condition: "used", make: "Mazda", model: "CX-5", business_type: business, source_type: "individual", year_made: "2021" })]);
    if (business === "owned") {
      await as(cM, manager, async (db) => {
        const ver = (await db.query("select version from public.vehicles where id = $1", [v])).rows[0].version;
        return db.query("select public.update_vehicle($1, $2, '{\"sale_status\":\"available\"}'::jsonb)", [v, ver]);
      });
    }
    return v;
  };
  const demand = (client: Client, user: string, extra: Record<string, unknown> = {}) =>
    call(client, user, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "buy", customer: { full_name: "Khách " + uuid().slice(0, 5) }, ...extra })]);
  const reserve = (client: Client, user: string, vehicle: string, dem: string, extra: Record<string, unknown> = {}) =>
    call(client, user, "select public.reserve_vehicle($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: vehicle, demand_id: dem, kind: "hold", valid_until: IN_DAYS(2), ...extra })]);
  const deposit = (client: Client, user: string, vehicle: string, dem: string, extra: Record<string, unknown> = {}) =>
    reserve(client, user, vehicle, dem, { kind: "deposit", valid_until: undefined, deposit_amount: "30000000", ...extra });
  const rver = async (id: string) => (await sys.query("select version from public.vehicle_reservations where id = $1", [id])).rows[0].version as number;
  const saleStatus = async (vehicle: string) => (await sys.query("select sale_status from public.vehicles where id = $1", [vehicle])).rows[0].sale_status as string;
  const rstatus = async (id: string) => (await sys.query("select status from public.vehicle_reservations where id = $1", [id])).rows[0].status as string;
  const release = (client: Client, user: string, id: string, reason = "Khách đổi ý") =>
    as(client, user, async (db) => db.query("select public.release_reservation($1, $2, $3)", [id, await rver(id), reason]));

  it("Giữ xe: xe chuyển 'đang giữ', chỉ người phụ trách/quản lý/kế toán thấy bản ghi; sales khác, kỹ thuật, anon không thấy; nhật ký nhu cầu không ghi số tiền", async () => {
    const v = await listedVehicle(), dA = await demand(cA, salesA);
    const r = await reserve(cA, salesA, v, dA, { note: "Khách hẹn xem lại" });
    expect(await saleStatus(v)).toBe("held");
    expect(await as(cA, salesA, async (db) => (await db.query("select count(*)::int n from public.vehicle_reservations where id = $1", [r])).rows[0].n)).toBe(1);
    for (const u of [manager, accountant]) expect(await as(cM, u, async (db) => (await db.query("select count(*)::int n from public.vehicle_reservations where id = $1", [r])).rows[0].n)).toBe(1);
    for (const [cl, u] of [[cB, salesB], [cB, tech]] as const) expect(await as(cl, u, async (db) => (await db.query("select count(*)::int n from public.vehicle_reservations where id = $1", [r])).rows[0].n)).toBe(0);
    await expect(as(cB, null, (db) => db.query("select count(*) from public.vehicle_reservations"))).rejects.toThrow(/permission denied/);
    const logs = (await sys.query("select content from public.demand_activities where demand_id = $1 and channel = 'system'", [dA])).rows.map((x) => x.content as string);
    expect(logs.some((c) => /Đã giữ xe XE\d+ đến/.test(c))).toBe(true);
    await expect(as(cM, manager, (db) => db.query("delete from public.vehicle_reservations where id = $1", [r]))).rejects.toThrow(/permission denied/);
  });

  it("§12.4 ĐỘC QUYỀN: hai sales giữ/cọc CÙNG LÚC cùng một xe → chỉ một thắng; xe không bao giờ có hai giữ/cọc hiệu lực", async () => {
    for (const round of [["hold", "hold"], ["hold", "deposit"], ["deposit", "deposit"]] as const) {
      const v = await listedVehicle(), dA = await demand(cA, salesA), dB = await demand(cB, salesB);
      const go = (kind: string, client: Client, user: string, dem: string) => (kind === "hold" ? reserve(client, user, v, dem) : deposit(client, user, v, dem));
      const results = await Promise.allSettled([go(round[0], cA, salesA, dA), go(round[1], cB, salesB, dB)]);
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const lost = results.find((x) => x.status === "rejected") as PromiseRejectedResult;
      expect(String(lost.reason)).toMatch(/vừa được người khác giữ hoặc đặt cọc|đang được người khác giữ|đã có người đặt cọc/);
      expect((await sys.query("select count(*)::int n from public.vehicle_reservations where vehicle_id = $1 and status = 'active'", [v])).rows[0].n).toBe(1);
      expect(["held", "deposited"]).toContain(await saleStatus(v));
    }
    // nhiều người cùng lúc (6 yêu cầu song song, hai kết nối đan xen) vẫn đúng một người thắng
    const v = await listedVehicle();
    const demands = [await demand(cA, salesA), await demand(cA, salesA)];      // tạo tuần tự: một kết nối chỉ chạy một giao dịch tại một thời điểm
    const demandsB = [await demand(cB, salesB), await demand(cB, salesB)];
    const many = await Promise.allSettled([
      reserve(cA, salesA, v, demands[0]), reserve(cB, salesB, v, demandsB[0]),
      deposit(cM, manager, v, demands[1]), deposit(cM2, manager, v, demandsB[1]),   // mỗi yêu cầu một kết nối riêng
    ]);
    expect(many.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await sys.query("select count(*)::int n from public.vehicle_reservations where vehicle_id = $1 and status = 'active'", [v])).rows[0].n).toBe(1);
  });

  it("Gửi lặp cùng request_id (kể cả song song) chỉ giữ một lần", async () => {
    const v = await listedVehicle(), dA = await demand(cA, salesA);
    const req = uuid();
    const mk = (client: Client) => call(client, salesA, "select public.reserve_vehicle($1::jsonb) r", [JSON.stringify({ request_id: req, vehicle_id: v, demand_id: dA, kind: "hold", valid_until: IN_DAYS(1) })]);
    const [a, b] = await Promise.all([mk(cA), mk(cM)]);
    expect(a).toBe(b);
    expect((await sys.query("select count(*)::int n from public.vehicle_reservations where vehicle_id = $1", [v])).rows[0].n).toBe(1);
  });

  it("Điều kiện giữ/cọc: nhu cầu MUA còn mở của chính mình; xe đang bán; hạn ở tương lai; cọc có số tiền; khách lấy từ nhu cầu", async () => {
    const v = await listedVehicle(), dA = await demand(cA, salesA);
    const sell = await call(cA, salesA, "select public.create_demand($1::jsonb) r", [JSON.stringify({ request_id: uuid(), kind: "sell", customer: { full_name: "Khách bán" }, sell_offer: { make: "Kia" } })]);
    await expect(reserve(cA, salesA, v, sell)).rejects.toThrow(/nhu cầu MUA/);
    await expect(reserve(cB, salesB, v, dA)).rejects.toThrow(/Không tìm thấy nhu cầu mua|không có quyền/);            // nhu cầu của người khác
    await expect(reserve(cA, salesA, v, dA, { valid_until: IN_DAYS(-1) })).rejects.toThrow(/Hạn giữ xe phải ở tương lai/);
    await expect(reserve(cA, salesA, v, dA, { valid_until: undefined })).rejects.toThrow(/reservations_hold_shape/);          // giữ xe phải nhập hạn, không có hạn mặc định
    await expect(deposit(cA, salesA, v, dA, { deposit_amount: "0" })).rejects.toThrow(/deposit_amount/);
    await expect(deposit(cA, salesA, v, dA, { deposit_amount: undefined })).rejects.toThrow(/reservations_hold_shape/);
    await expect(reserve(cA, salesA, v, dA, { deposit_amount: "1000000" })).rejects.toThrow(/reservations_hold_shape/);
    // kế toán/kỹ thuật không giữ xe
    await expect(reserve(cA, accountant, v, dA)).rejects.toThrow(/không có quyền giữ xe|row-level security/);
    await expect(reserve(cA, tech, v, dA)).rejects.toThrow(/không có quyền giữ xe|row-level security/);
    // xe chưa chào bán
    const unlisted = await listedVehicle("consignment");
    await expect(reserve(cA, salesA, unlisted, dA)).rejects.toThrow(/chưa chào bán|Không tìm thấy xe/);   // sales không thấy xe chưa chào bán
    // khách lấy từ nhu cầu (không tin dữ liệu gửi lên)
    const r = await reserve(cA, salesA, v, dA, { customer_id: uuid() });
    const row = (await sys.query("select r.customer_id, d.customer_id as dc, r.owner_id from public.vehicle_reservations r join public.demands d on d.id = r.demand_id where r.id = $1", [r])).rows[0];
    expect(row.customer_id).toBe(row.dc);
    expect(row.owner_id).toBe(salesA);
  });

  it("Xe ký gửi chưa có hợp đồng hiệu lực không giữ/cọc được (kể cả khi trạng thái bị đặt sai)", async () => {
    const dA = await demand(cA, salesA);
    const cons = await listedVehicle("consignment");
    await sys.query("update public.vehicles set sale_status = 'available' where id = $1", [cons]).catch(() => null);
    const status = await saleStatus(cons);
    const dM = await demand(cM, manager);
    // Nếu trạng thái đã bị đặt sai thành 'đang bán' thì trigger của xe chặn vì chưa có hợp đồng; nếu không thì xe 'chưa chào bán'.
    await expect(reserve(cM, manager, cons, dM)).rejects.toThrow(status === "available" ? /hợp đồng ký gửi/ : /chưa chào bán|hợp đồng ký gửi/);
    await expect(reserve(cA, salesA, cons, dA)).rejects.toThrow(/chưa chào bán|Không tìm thấy xe|hợp đồng ký gửi/);   // sales không thấy xe chưa chào bán
  });

  it("Nhả giữ: người phụ trách hoặc quản lý, bắt buộc lý do; xe về 'đang bán' và người khác giữ được ngay; hồ sơ kết thúc không sửa", async () => {
    const v = await listedVehicle(), dA = await demand(cA, salesA), dB = await demand(cB, salesB);
    const r = await reserve(cA, salesA, v, dA);
    await expect(release(cB, salesB, r)).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    await expect(as(cA, salesA, async (db) => db.query("select public.release_reservation($1, $2, '  ')", [r, await rver(r)]))).rejects.toThrow(/lý do/);
    await release(cA, salesA, r, "x");
    expect(await rstatus(r)).toBe("released");
    expect(await saleStatus(v)).toBe("available");
    const row = (await sys.query("select end_reason, ended_by, ended_at is not null as at from public.vehicle_reservations where id = $1", [r])).rows[0];
    expect(row).toMatchObject({ end_reason: "x", ended_by: salesA, at: true });
    await reserve(cB, salesB, v, dB);   // sales B giữ được ngay
    expect(await saleStatus(v)).toBe("held");
    await expect(as(cA, salesA, (db) => db.query("update public.vehicle_reservations set note = 'sửa' where id = $1", [r]))).rejects.toThrow(/đã kết thúc, không sửa/);
    // quản lý nhả hộ
    const v2 = await listedVehicle(), r2 = await reserve(cA, salesA, v2, await demand(cA, salesA));
    await release(cM, manager, r2, "Quản lý nhả: khách không liên lạc được");
    expect(await saleStatus(v2)).toBe("available");
  });

  it("Giữ HẾT HẠN: người khác giữ/cọc được ngay (nhả lười, ghi lý do hệ thống); không gia hạn bản hết hạn; quản lý nhả hàng loạt", async () => {
    const v = await listedVehicle(), dA = await demand(cA, salesA), dB = await demand(cB, salesB);
    const soon = new Date(Date.now() + 1500).toISOString();
    const r = await reserve(cA, salesA, v, dA, { valid_until: soon });
    await expect(reserve(cB, salesB, v, dB)).rejects.toThrow(/đang được người khác giữ|vừa được người khác giữ/);   // chưa hết hạn
    await new Promise((res) => setTimeout(res, 2000));
    await expect(as(cA, salesA, async (db) => db.query("select public.extend_hold($1, $2, $3)", [r, await rver(r), IN_DAYS(3)]))).rejects.toThrow(/hết hạn/);
    const r2 = await reserve(cB, salesB, v, dB);
    expect(await rstatus(r)).toBe("released");
    const old = (await sys.query("select end_reason, ended_by from public.vehicle_reservations where id = $1", [r])).rows[0];
    expect(old).toEqual({ end_reason: "Hết hạn giữ xe", ended_by: null });
    expect(await rstatus(r2)).toBe("active");
    expect(await saleStatus(v)).toBe("held");
    // nhả hàng loạt: chỉ quản lý
    const v3 = await listedVehicle(), d3 = await demand(cA, salesA);
    await reserve(cA, salesA, v3, d3, { valid_until: new Date(Date.now() + 1200).toISOString() });
    await new Promise((res) => setTimeout(res, 1700));
    await expect(call(cA, salesA, "select public.release_expired_holds() r")).rejects.toThrow(/Chỉ quản lý/);
    expect(Number(await call(cM, manager, "select public.release_expired_holds() r"))).toBeGreaterThanOrEqual(1);
    expect(await saleStatus(v3)).toBe("available");
  });

  it("Gia hạn giữ xe: chỉ người phụ trách/quản lý, hạn mới phải sau hạn cũ; không gia hạn đặt cọc", async () => {
    const v = await listedVehicle(), dA = await demand(cA, salesA);
    const r = await reserve(cA, salesA, v, dA, { valid_until: IN_DAYS(1) });
    const ext = (client: Client, user: string, until: string) => as(client, user, async (db) => db.query("select public.extend_hold($1, $2, $3)", [r, await rver(r), until]));
    await expect(ext(cB, salesB, IN_DAYS(3))).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    await expect(ext(cA, salesA, IN_DAYS(0.5))).rejects.toThrow(/Hạn mới phải sau hạn hiện tại/);
    await ext(cA, salesA, IN_DAYS(3));
    await ext(cM, manager, IN_DAYS(4));
    const logs = (await sys.query("select content from public.demand_activities where demand_id = $1 and channel = 'system'", [dA])).rows.map((x) => x.content as string);
    expect(logs.filter((c) => /Đã gia hạn giữ xe/.test(c))).toHaveLength(2);
    const v2 = await listedVehicle(), dep = await deposit(cA, salesA, v2, await demand(cA, salesA));
    await expect(as(cA, salesA, async (db) => db.query("select public.extend_hold($1, $2, $3)", [dep, await rver(dep), IN_DAYS(3)]))).rejects.toThrow(/vừa được cập nhật|không có quyền/);
  });

  it("Chuyển giữ xe thành đặt cọc trong một giao dịch: xe 'đã cọc', bản giữ 'đã chuyển'; không chuyển được nếu không phải người phụ trách", async () => {
    const v = await listedVehicle(), dA = await demand(cA, salesA);
    const h = await reserve(cA, salesA, v, dA, { agreed_price: "640000000" });
    const conv = (client: Client, user: string, extra: Record<string, unknown> = {}) =>
      as(client, user, async (db) => (await db.query("select public.convert_hold_to_deposit($1, $2, $3::jsonb) r", [h, await rver(h), JSON.stringify({ request_id: uuid(), deposit_amount: "50000000", ...extra })])).rows[0].r as string);
    await expect(conv(cB, salesB)).rejects.toThrow(/vừa được cập nhật|không có quyền/);
    await expect(conv(cA, salesA, { deposit_amount: "0" })).rejects.toThrow(/deposit_amount/);
    expect(await rstatus(h)).toBe("active");   // lỗi thì không đổi gì (giao dịch hoàn tác)
    expect(await saleStatus(v)).toBe("held");
    const dep = await conv(cA, salesA);
    expect(await rstatus(h)).toBe("converted");
    expect(await rstatus(dep)).toBe("active");
    expect(await saleStatus(v)).toBe("deposited");
    const row = (await sys.query("select kind, deposit_amount::text a, agreed_price::text p, converted_from, owner_id from public.vehicle_reservations where id = $1", [dep])).rows[0];
    expect(row).toMatchObject({ kind: "deposit", a: "50000000", p: "640000000", converted_from: h, owner_id: salesA });   // giá chốt kế thừa từ bản giữ
    expect((await sys.query("select count(*)::int n from public.vehicle_reservations where vehicle_id = $1 and status = 'active'", [v])).rows[0].n).toBe(1);
  });

  it("Đặt cọc: không 'nhả giữ'; chỉ quản lý hủy cọc (có lý do); hủy xong xe về 'đang bán'; số tiền cọc không sửa được", async () => {
    const v = await listedVehicle(), dA = await demand(cA, salesA);
    const dep = await deposit(cA, salesA, v, dA);
    expect(await saleStatus(v)).toBe("deposited");
    await expect(release(cA, salesA, dep)).rejects.toThrow(/Đặt cọc không "nhả giữ"|vừa được cập nhật/);
    const cancel = (client: Client, user: string, reason = "Khách không mua nữa") =>
      as(client, user, async (db) => db.query("select public.cancel_deposit($1, $2, $3)", [dep, await rver(dep), reason]));
    await expect(cancel(cA, salesA)).rejects.toThrow(/Chỉ quản lý được hủy cọc|vừa được cập nhật|không có quyền/);
    await expect(cancel(cM, manager, " ")).rejects.toThrow(/lý do/);
    await expect(as(cM, manager, (db) => db.query("update public.vehicle_reservations set deposit_amount = 1 where id = $1", [dep]))).rejects.toThrow(/Không đổi xe, khách, loại, số tiền cọc/);
    await cancel(cM, manager);
    expect(await rstatus(dep)).toBe("cancelled");
    expect(await saleStatus(v)).toBe("available");
    expect((await sys.query("select ended_by from public.vehicle_reservations where id = $1", [dep])).rows[0].ended_by).toBe(manager);
    const logs = (await sys.query("select content from public.demand_activities where demand_id = $1 and channel = 'system'", [dA])).rows.map((x) => x.content as string);
    expect(logs.some((c) => /Đã hủy cọc xe/.test(c))).toBe(true);
    expect(logs.join(" ")).not.toMatch(/30\.?000\.?000/);   // không ghi số tiền vào nhật ký nhu cầu
  });

  it("Sales khác chỉ biết 'xe đang bị giữ/cọc' + người phụ trách + hạn giữ; không lộ khách, số tiền cọc, giá chốt", async () => {
    const v = await listedVehicle(), dA = await demand(cA, salesA);
    expect(await as(cB, salesB, async (db) => (await db.query("select * from public.public_reservation_info($1)", [v])).rowCount)).toBe(0);   // xe còn trống
    const until = IN_DAYS(2);
    await reserve(cA, salesA, v, dA, { valid_until: until, agreed_price: "600000000" });
    const rows = await as(cB, salesB, async (db) => (await db.query("select * from public.public_reservation_info($1)", [v])).rows);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["is_mine", "kind", "owner_name", "valid_until"]);
    expect(rows[0]).toMatchObject({ kind: "hold", owner_name: "Sales A Giữ xe", is_mine: false });
    const mine = await as(cA, salesA, async (db) => (await db.query("select is_mine from public.public_reservation_info($1)", [v])).rows[0].is_mine);
    expect(mine).toBe(true);
    await expect(as(cB, null, (db) => db.query("select * from public.public_reservation_info($1)", [v]))).rejects.toThrow(/permission denied/);
    // xe đã cọc: không lộ hạn giữ
    const v2 = await listedVehicle(), dep = await deposit(cA, salesA, v2, await demand(cA, salesA), { valid_until: IN_DAYS(5) });
    expect(dep).toBeTruthy();
    const depRow = await as(cB, salesB, async (db) => (await db.query("select kind, valid_until from public.public_reservation_info($1)", [v2])).rows[0]);
    expect(depRow).toEqual({ kind: "deposit", valid_until: null });
  });

  it("Giữ xe hết hạn của sales khác không bị sales B 'cướp' khi chưa hết hạn; kỹ thuật không đổi được trạng thái giữ", async () => {
    const v = await listedVehicle(), dA = await demand(cA, salesA), dB = await demand(cB, salesB);
    const r = await reserve(cA, salesA, v, dA);
    await expect(reserve(cB, salesB, v, dB)).rejects.toThrow(/đang được người khác giữ|vừa được người khác giữ/);
    expect(await rstatus(r)).toBe("active");
    await expect(as(cB, tech, (db) => db.query("update public.vehicles set sale_status = 'available' where id = $1", [v]))).resolves.toBeTruthy();   // RLS: 0 dòng bị sửa
    expect(await saleStatus(v)).toBe("held");
    await expect(as(cM, manager, async (db) => db.query("select public.update_vehicle($1, $2, '{\"sale_status\":\"held\"}'::jsonb)", [v, (await db.query("select version from public.vehicles where id = $1", [v])).rows[0].version]))).resolves.toBeTruthy();
  });
});
