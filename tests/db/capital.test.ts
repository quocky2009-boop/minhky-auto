/**
 * Chặng 4 (lát 1): bên góp vốn, điều khoản chia lợi nhuận theo xe (có phiên bản), sổ vốn góp, cho vay.
 * Chạy SQL dưới vai trò `authenticated` của từng người (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, bigAccount, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;

d("Vốn góp và điều khoản chia lợi nhuận — chặng 4 lát 1 (database thật)", () => {
  let sys: Client, c: Client, c2: Client;
  let acct = "";
  let manager: string, accountant: string, sales: string, tech: string;

  beforeAll(async () => {
    sys = await connect(); c = await connect(); c2 = await connect();
    acct = await bigAccount(sys);
    manager = await createUser(sys, "QL Vốn", ["manager"]);
    accountant = await createUser(sys, "KT Vốn", ["accountant"]);
    sales = await createUser(sys, "Sales Vốn", ["sales"]);
    tech = await createUser(sys, "KTV Vốn", ["technician"]);
  });
  afterAll(async () => { await sys.end(); await c.end(); await c2.end(); });

  const call = <T = string>(user: string, sql: string, params: unknown[] = [], client: Client = c): Promise<T> =>
    as(client, user, async (db) => (await db.query(sql, params)).rows[0]?.r as T);
  const newVehicle = (business = "owned") => call(manager, "select public.create_vehicle($1::jsonb) r", [JSON.stringify({
    request_id: uuid(), condition: "used", make: "Kia", model: "Seltos", business_type: business, source_type: "individual", year_made: "2021" })]);
  const newParty = (name: string, kind = "individual", user = manager) => call(user, "select public.create_capital_party($1::jsonb) r", [JSON.stringify({ request_id: uuid(), name, kind, phone: "0911222333" })]);
  const terms = (vehicle: string, shares: { party_id: string; ratio_percent: string }[], extra: Record<string, unknown> = {}, user = manager, client: Client = c) =>
    call(user, "select public.create_capital_terms($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: vehicle, company_rate: "20", shares, ...extra })], client);
  const termsVer = async (id: string) => (await sys.query("select version from public.vehicle_capital_terms where id = $1", [id])).rows[0].version as number;
  const approve = (id: string, user = manager) => as(c, user, async (db) => db.query("select public.approve_capital_terms($1, $2)", [id, await termsVer(id)]));
  const status = async (id: string) => (await sys.query("select status from public.vehicle_capital_terms where id = $1", [id])).rows[0].status as string;
  const entry = (user: string, vehicle: string, party: string, type: string, amount: string, extra: Record<string, unknown> = {}, client: Client = c) =>
    call(user, "select public.record_capital_entry($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: vehicle, party_id: party, entry_type: type, amount, ...(type === "commitment" ? {} : { account_id: acct }), ...extra })], client);
  const summary = async (vehicle: string, party: string) => (await sys.query(
    "select committed::text c, received::text r, withdrawn::text w, net_received::text n from public.vehicle_capital_summary where vehicle_id = $1 and party_id = $2", [vehicle, party])).rows[0];
  const needsReconfirm = async (vehicle: string) => (await sys.query("select needs_reconfirm from public.vehicle_capital_status where vehicle_id = $1", [vehicle])).rows[0]?.needs_reconfirm as boolean | undefined;

  /** Xe + hai bên 60/40 + điều khoản đã duyệt. */
  const approvedVehicle = async () => {
    const vehicle = await newVehicle();
    const a = await newParty("Bên A"), b = await newParty("Bên B");
    const t = await terms(vehicle, [{ party_id: a, ratio_percent: "60" }, { party_id: b, ratio_percent: "40" }]);
    await approve(t);
    return { vehicle, a, b, t };
  };

  it("Phân quyền: quản lý lập; kế toán đọc và ghi tiền thực nhận nhưng không lập điều khoản/vốn cam kết; sales và kỹ thuật không thấy; anon bị chặn; không xóa", async () => {
    const { vehicle, a, t } = await approvedVehicle();
    await entry(manager, vehicle, a, "commitment", "100000000");
    expect(await as(c, accountant, async (db) => (await db.query("select count(*)::int n from public.vehicle_capital_terms where id = $1", [t])).rows[0].n)).toBe(1);
    await entry(accountant, vehicle, a, "receipt", "50000000");
    await expect(entry(accountant, vehicle, a, "commitment", "1")).rejects.toThrow(/Chỉ quản lý được ghi vốn cam kết/);
    await expect(terms(vehicle, [{ party_id: a, ratio_percent: "100" }], {}, accountant)).rejects.toThrow(/Chỉ quản lý được lập điều khoản/);
    await expect(newParty("KT thêm", "individual", accountant)).rejects.toThrow(/Chỉ quản lý được thêm bên góp vốn/);
    for (const u of [sales, tech]) {
      const seen = await as(c, u, async (db) => ({
        parties: (await db.query("select count(*)::int n from public.capital_parties")).rows[0].n,
        terms: (await db.query("select count(*)::int n from public.vehicle_capital_terms")).rows[0].n,
        shares: (await db.query("select count(*)::int n from public.vehicle_capital_shares")).rows[0].n,
        entries: (await db.query("select count(*)::int n from public.vehicle_capital_entries")).rows[0].n,
        loans: (await db.query("select count(*)::int n from public.vehicle_loans")).rows[0].n,
        summary: (await db.query("select count(*)::int n from public.vehicle_capital_summary")).rows[0].n,
      }));
      expect(seen).toEqual({ parties: 0, terms: 0, shares: 0, entries: 0, loans: 0, summary: 0 });
      await expect(entry(u, vehicle, a, "receipt", "1000")).rejects.toThrow(/Anh\/chị không có quyền ghi sổ vốn góp|row-level security/);
      await expect(newParty("Sales thêm", "individual", u)).rejects.toThrow(/Chỉ quản lý được thêm bên góp vốn/);
      await expect(approve(t, u)).rejects.toThrow(/Điều khoản vừa được người khác cập nhật|không có quyền/);
    }
    await expect(as(c, null, (db) => db.query("select count(*) from public.vehicle_capital_terms"))).rejects.toThrow(/permission denied/);
    for (const tbl of ["capital_parties", "vehicle_capital_terms", "vehicle_capital_entries", "vehicle_loans", "vehicle_loan_payments"]) {
      await expect(as(c, manager, (db) => db.query(`delete from public.${tbl}`))).rejects.toThrow(/permission denied/);
    }
  });

  it("Chỉ xe showroom sở hữu mới có bên góp vốn; xe ký gửi bị từ chối", async () => {
    const a = await newParty("Bên A");
    await expect(terms(await newVehicle("consignment"), [{ party_id: a, ratio_percent: "100" }])).rejects.toThrow(/Chỉ xe showroom sở hữu/);
  });

  it("Tỷ lệ công ty KHÔNG có mặc định; trong 0–100; bên góp tỷ lệ > 0; không trùng bên", async () => {
    const vehicle = await newVehicle(), a = await newParty("A");
    await expect(call(manager, "select public.create_capital_terms($1::jsonb) r", [JSON.stringify({ request_id: uuid(), vehicle_id: vehicle, shares: [] })])).rejects.toThrow(/company_rate/);
    await expect(terms(vehicle, [], { company_rate: "100.5" })).rejects.toThrow(/company_rate/);
    await expect(terms(vehicle, [], { company_rate: "-1" })).rejects.toThrow(/company_rate/);
    await expect(terms(vehicle, [{ party_id: a, ratio_percent: "0" }])).rejects.toThrow(/ratio_percent/);
    await expect(terms(vehicle, [{ party_id: a, ratio_percent: "50" }, { party_id: a, ratio_percent: "50" }])).rejects.toThrow(/vehicle_capital_shares_pkey|duplicate/);
    await terms(vehicle, [], { company_rate: "0" });   // 0% công ty được nhập rõ ràng (khác để trống)
  });

  it("Duyệt chỉ khi tổng tỷ lệ chia đúng 100%; bản nháp sửa được, đã duyệt bất biến; phiên bản mới thay thế bản cũ", async () => {
    const vehicle = await newVehicle(), a = await newParty("A"), b = await newParty("B");
    const empty = await terms(vehicle, []);
    await expect(approve(empty)).rejects.toThrow(/Chưa có bên góp vốn/);
    const t1 = await terms(vehicle, [{ party_id: a, ratio_percent: "60" }, { party_id: b, ratio_percent: "39.9999" }]);
    await expect(approve(t1)).rejects.toThrow(/Tổng tỷ lệ chia hiện là 99.9999/);
    // sửa nháp: đổi tỷ lệ và c (kèm xác nhận căn cứ chi phí)
    await as(c, manager, async (db) => db.query("select public.update_capital_terms($1, $2, $3::jsonb)", [t1, await termsVer(t1),
      JSON.stringify({ company_rate: "15", cost_basis: "all_confirmed_costs", shares: [{ party_id: a, ratio_percent: "60" }, { party_id: b, ratio_percent: "40" }] })]));
    await approve(t1);
    const row = (await sys.query("select status, company_rate::text c, cost_basis, approved_by, version_no from public.vehicle_capital_terms where id = $1", [t1])).rows[0];
    expect(row).toMatchObject({ status: "approved", c: "15.0000", cost_basis: "all_confirmed_costs", approved_by: manager, version_no: 2 });   // v1 là bản rỗng ở trên
    // bản đã duyệt: không sửa nội dung, không sửa tỷ lệ, không đặt trạng thái trực tiếp
    await expect(as(c, manager, (db) => db.query("update public.vehicle_capital_terms set company_rate = 30 where id = $1", [t1]))).rejects.toThrow(/Điều khoản đã duyệt không sửa/);
    await expect(as(c, manager, (db) => db.query("update public.vehicle_capital_shares set ratio_percent = 50 where terms_id = $1 and party_id = $2", [t1, a]))).rejects.toThrow(/Chỉ sửa tỷ lệ khi điều khoản còn ở bản nháp/);
    await expect(as(c, manager, async (db) => db.query("select public.update_capital_terms($1, $2, '{\"company_rate\":\"40\"}'::jsonb)", [t1, await termsVer(t1)]))).rejects.toThrow(/không còn là bản nháp/);
    await expect(as(c, manager, (db) => db.query("update public.vehicle_capital_terms set status = 'superseded' where id = $1", [t1]))).rejects.toThrow(/chỉ được thay thế bằng cách duyệt phiên bản mới/);
    // phiên bản mới: duyệt thì bản cũ thành "đã thay thế"; chỉ một bản duyệt/xe
    const t2 = await terms(vehicle, [{ party_id: a, ratio_percent: "50" }, { party_id: b, ratio_percent: "50" }], { company_rate: "10" });
    expect(await status(t1)).toBe("approved");
    await approve(t2);
    expect(await status(t1)).toBe("superseded");
    expect(await status(t2)).toBe("approved");
    expect((await sys.query("select count(*)::int n from public.vehicle_capital_terms where vehicle_id = $1 and status = 'approved'", [vehicle])).rows[0].n).toBe(1);
    await expect(sys.query("update public.vehicle_capital_terms set company_rate = 1 where id = $1", [t1])).rejects.toThrow(/đã kết thúc/);
    await expect(sys.query("delete from public.vehicle_capital_terms where id = $1", [t1])).rejects.toThrow(/Không xóa điều khoản/);
  });

  it("Hủy bản nháp cần lý do; bản nháp đã hủy không duyệt được", async () => {
    const vehicle = await newVehicle(), a = await newParty("A");
    const t = await terms(vehicle, [{ party_id: a, ratio_percent: "100" }]);
    await expect(as(c, manager, async (db) => db.query("select public.discard_capital_terms($1, $2, ' ')", [t, await termsVer(t)]))).rejects.toThrow(/lý do/);
    await as(c, manager, async (db) => db.query("select public.discard_capital_terms($1, $2, 'Nhập nhầm xe')", [t, await termsVer(t)]));
    expect(await status(t)).toBe("void");
    await expect(approve(t)).rejects.toThrow(/không còn là bản nháp/);
  });

  it("Gửi lặp/song song không sinh trùng; hai người lập điều khoản cùng lúc: số phiên bản không trùng", async () => {
    const vehicle = await newVehicle(), a = await newParty("A");
    const req = uuid();
    const mk = (client: Client) => call(manager, "select public.create_capital_terms($1::jsonb) r", [JSON.stringify({ request_id: req, vehicle_id: vehicle, company_rate: "20", shares: [{ party_id: a, ratio_percent: "100" }] })], client);
    const [x, y] = await Promise.all([mk(c), mk(c2)]);
    expect(x).toBe(y);
    await Promise.all([terms(vehicle, [], {}, manager, c), terms(vehicle, [], {}, manager, c2)]);
    const nos = (await sys.query("select version_no from public.vehicle_capital_terms where vehicle_id = $1 order by 1", [vehicle])).rows.map((r) => r.version_no);
    expect(nos).toEqual([1, 2, 3]);
    const pReq = uuid();
    const [p1, p2] = await Promise.all([c, c2].map((cl) => call(manager, "select public.create_capital_party($1::jsonb) r", [JSON.stringify({ request_id: pReq, name: "Trùng?", kind: "individual" })], cl)));
    expect(p1).toBe(p2);
  });

  it("Sổ vốn: bên phải có trong điều khoản; cam kết/thực nhận/rút tách riêng; rút không vượt vốn thực nhận ròng; không sửa, hủy có lý do", async () => {
    const { vehicle, a, b } = await approvedVehicle();
    const outsider = await newParty("Người lạ");
    await expect(entry(manager, vehicle, outsider, "receipt", "1000")).rejects.toThrow(/chưa có trong điều khoản góp vốn/);
    await entry(manager, vehicle, a, "commitment", "300000000");
    const r1 = await entry(accountant, vehicle, a, "receipt", "100000000");
    await entry(accountant, vehicle, a, "receipt", "50000000", { entry_date: "2026-10-03", reference: "UNC 123" });
    expect(await summary(vehicle, a)).toEqual({ c: "300000000", r: "150000000", w: "0", n: "150000000" });   // cam kết ≠ thực nhận
    await expect(entry(accountant, vehicle, a, "withdrawal", "150000001")).rejects.toThrow(/vượt vốn thực nhận ròng/);
    await entry(accountant, vehicle, a, "withdrawal", "20000000");
    expect(await summary(vehicle, a)).toEqual({ c: "300000000", r: "150000000", w: "20000000", n: "130000000" });
    expect(await summary(vehicle, b)).toBeUndefined();   // bên chưa ghi gì: không có dòng (không giả số 0 là đã góp)
    await entry(accountant, vehicle, a, "withdrawal", "40000000");   // đã rút 60tr; còn nhận ròng 90tr
    // hủy khoản nhận 100tr sẽ để lại 50tr nhận nhưng đã rút 60tr → vốn ròng âm → chặn
    await expect(as(c, manager, (db) => db.query("select public.void_capital_entry($1, 'nhập nhầm')", [r1]))).rejects.toThrow(/vốn thực nhận ròng âm/);
    // dòng không sửa; hủy cần quản lý + lý do
    await expect(sys.query("update public.vehicle_capital_entries set amount = 1 where id = $1", [r1])).rejects.toThrow(/không sửa/);
    await expect(as(c, accountant, (db) => db.query("select public.void_capital_entry($1, 'x')", [r1]))).rejects.toThrow(/Không tìm thấy dòng đang hiệu lực|không có quyền/);
    await expect(as(c, manager, (db) => db.query("select public.void_capital_entry($1, ' ')", [r1]))).rejects.toThrow(/lý do/);
    const w2 = await entry(accountant, vehicle, a, "withdrawal", "10000000");
    await as(c, manager, (db) => db.query("select public.void_capital_entry($1, 'Ghi nhầm số')", [w2]));
    expect((await summary(vehicle, a)).n).toBe("90000000");
    await expect(as(c, manager, (db) => db.query("select public.void_capital_entry($1, 'lại')", [w2]))).rejects.toThrow(/Không tìm thấy dòng đang hiệu lực/);
    // gửi lặp cùng request_id (kể cả song song) chỉ ghi một dòng
    const req = uuid();
    const [x, y] = await Promise.all([c, c2].map((cl) => entry(accountant, vehicle, b, "receipt", "5000000", { request_id: req }, cl)));
    expect(x).toBe(y);
    expect((await summary(vehicle, b)).r).toBe("5000000");
  });

  it("Vốn thay đổi sau khi duyệt: đánh dấu 'cần xác nhận lại căn cứ phân chia', KHÔNG tự đổi tỷ lệ; xác nhận lại cần nội dung; duyệt bản mới thì dùng căn cứ mới", async () => {
    const { vehicle, a, t } = await approvedVehicle();
    await entry(manager, vehicle, a, "commitment", "100000000");   // trước/sau duyệt: ghi sau duyệt là thay đổi
    expect(await needsReconfirm(vehicle)).toBe(true);
    const ratioBefore = (await sys.query("select ratio_percent::text r from public.vehicle_capital_shares where terms_id = $1 and party_id = $2", [t, a])).rows[0].r;
    await expect(as(c, manager, async (db) => db.query("select public.reconfirm_capital_basis($1, $2, '  ')", [t, await termsVer(t)]))).rejects.toThrow(/Ghi nội dung xác nhận/);
    await as(c, accountant, async (db) => db.query("select 1")).catch(() => null);
    await expect(as(c, accountant, async (db) => db.query("select public.reconfirm_capital_basis($1, $2, 'ok')", [t, await termsVer(t)]))).rejects.toThrow(/không còn hiệu lực|không có quyền/);
    await as(c, manager, async (db) => db.query("select public.reconfirm_capital_basis($1, $2, 'Hai bên đã thống nhất giữ tỷ lệ 60/40 sau khi A bổ sung vốn')", [t, await termsVer(t)]));
    expect(await needsReconfirm(vehicle)).toBe(false);
    const row = (await sys.query("select reconfirmed_by, reconfirm_note, ratio_percent::text r from public.vehicle_capital_terms t join public.vehicle_capital_shares s on s.terms_id = t.id where t.id = $1 and s.party_id = $2", [t, a])).rows[0];
    expect(row).toMatchObject({ reconfirmed_by: manager, r: ratioBefore });
    expect(row.reconfirm_note).toMatch(/60\/40/);
    // rút vốn / hủy dòng sau xác nhận lại lại làm đổi căn cứ
    const rc = await entry(accountant, vehicle, a, "receipt", "10000000");
    expect(await needsReconfirm(vehicle)).toBe(true);
    await as(c, manager, (db) => db.query("select public.void_capital_entry($1, 'Ghi nhầm')", [rc]));
    expect(await needsReconfirm(vehicle)).toBe(true);
    // duyệt phiên bản mới = căn cứ mới
    const t2 = await terms(vehicle, [{ party_id: a, ratio_percent: "100" }]);
    await approve(t2);
    expect(await needsReconfirm(vehicle)).toBe(false);
    // bản đã thay thế không còn xác nhận lại được
    await expect(as(c, manager, async (db) => db.query("select public.reconfirm_capital_basis($1, $2, 'cũ')", [t, await termsVer(t)]))).rejects.toThrow(/không còn hiệu lực/);
  });

  it("Cho vay hưởng lãi TÁCH khỏi góp vốn: không vào tổng hợp vốn góp; trả gốc không vượt gốc; hủy cần lý do và không còn thanh toán", async () => {
    const { vehicle, a } = await approvedVehicle();
    const lender = await newParty("Chị Lan cho vay");
    const loan = await call(manager, "select public.create_vehicle_loan($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), vehicle_id: vehicle, party_id: lender, principal: "200000000", drawn_date: "2026-10-01", interest_terms: "1,2%/tháng, trả lãi cuối kỳ", account_id: acct })]);
    await expect(call(manager, "select public.create_vehicle_loan($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), vehicle_id: vehicle, party_id: lender, principal: "1", drawn_date: "2026-10-01", interest_terms: "  ", account_id: acct })])).rejects.toThrow(/interest_terms/);
    await expect(call(accountant, "select public.create_vehicle_loan($1::jsonb) r", [JSON.stringify({
      request_id: uuid(), vehicle_id: vehicle, party_id: lender, principal: "1", drawn_date: "2026-10-01", interest_terms: "x", account_id: acct })])).rejects.toThrow(/Chỉ quản lý được ghi khoản cho vay/);
    // tiền vay không làm tăng "vốn góp"
    expect(await summary(vehicle, lender)).toBeUndefined();
    await expect(entry(manager, vehicle, lender, "receipt", "1000")).rejects.toThrow(/chưa có trong điều khoản góp vốn/);
    const pay = (kind: string, amount: string, user = accountant) => call(user, "select public.record_loan_payment($1::jsonb) r", [JSON.stringify({ request_id: uuid(), loan_id: loan, kind, amount, account_id: acct })]);
    const p1 = await pay("principal", "150000000");
    await pay("interest", "2400000");
    await expect(pay("principal", "50000001")).rejects.toThrow(/vượt gốc vay/);
    await pay("principal", "50000000");   // đủ gốc
    await expect(pay("interest", "1", sales)).rejects.toThrow(/Anh\/chị không có quyền ghi thanh toán khoản vay|row-level security/);
    expect((await sys.query("select principal_paid::text pp, interest_paid::text ip, principal_outstanding::text po from public.vehicle_loan_summary where loan_id = $1", [loan])).rows[0])
      .toEqual({ pp: "200000000", ip: "2400000", po: "0" });
    await expect(as(c, manager, (db) => db.query("select public.void_vehicle_loan($1, 'nhập nhầm')", [loan]))).rejects.toThrow(/đã có thanh toán/);
    await as(c, manager, (db) => db.query("select public.void_loan_payment($1, 'ghi nhầm')", [p1]));
    // lãi trả không bị giới hạn bởi gốc; gốc sau khi hủy một khoản: còn trống 150tr
    expect((await sys.query("select principal_outstanding::text po from public.vehicle_loan_summary where loan_id = $1", [loan])).rows[0].po).toBe("150000000");
    // hai người trả gốc cùng lúc không cùng vượt hạn mức
    const results = await Promise.allSettled([c, c2].map((cl) => call(accountant, "select public.record_loan_payment($1::jsonb) r", [JSON.stringify({ request_id: uuid(), loan_id: loan, kind: "principal", amount: "100000000", account_id: acct })], cl)).flat());
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    void a;
  });

  it("Nhật ký kiểm toán của bên góp vốn không lưu số điện thoại", async () => {
    const party = await newParty("Bên có SĐT");
    await as(c, manager, async (db) => db.query("select public.update_capital_party($1, 1, '{\"phone\":\"0988777666\",\"note\":\"đổi số\"}'::jsonb)", [party]));
    const logs = (await sys.query("select old_data::text o, new_data::text n, changed_fields from public.audit_logs where table_name = 'capital_parties' and record_id = $1", [party])).rows;
    expect(logs.length).toBeGreaterThanOrEqual(2);
    for (const l of logs) expect(`${l.o ?? ""}${l.n ?? ""}`).not.toMatch(/0911222333|0988777666/);
    expect(logs.some((l) => (l.changed_fields ?? []).includes("phone"))).toBe(true);
  });
});
