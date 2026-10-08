/**
 * Chặng 3 (lát 4): hợp đồng ký gửi.
 * Quyết định đã chốt: phí = số tiền cố định HOẶC phần trăm trên giá bán; chi phí phát sinh KHÔNG cần chủ xe duyệt.
 * Chạy SQL dưới vai trò `authenticated` của từng người (tương đương gọi Data API bỏ qua giao diện).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, as, connect, bigAccount, createUser, uuid } from "./helpers";

const d = DB_URL ? describe : describe.skip;
const SIGNED = "2026-01-15";

d("Hợp đồng ký gửi — chặng 3 lát 4 (database thật)", () => {
  let sys: Client, c: Client, c2: Client;
  let acct = "";
  let manager: string, accountant: string, sales: string, tech: string;

  beforeAll(async () => {
    sys = await connect(); c = await connect(); c2 = await connect();
    acct = await bigAccount(sys);
    manager = await createUser(sys, "QL Ký gửi", ["manager"]);
    accountant = await createUser(sys, "KT Ký gửi", ["accountant"]);
    sales = await createUser(sys, "Sales Ký gửi", ["sales"]);
    tech = await createUser(sys, "KTV Ký gửi", ["technician"]);
  });
  afterAll(async () => { await sys.end(); await c.end(); await c2.end(); });

  const newVehicle = (business = "consignment") =>
    as(c, manager, async (db) => (await db.query("select public.create_vehicle($1::jsonb) id", [JSON.stringify({
      request_id: uuid(), condition: "used", make: "Honda", model: "Accord", business_type: business, source_type: "individual", year_made: "2020" })])).rows[0].id as string);
  const header = (vehicle: string, extra: Record<string, unknown> = {}) => ({
    request_id: uuid(), vehicle_id: vehicle, owner_name: "Nguyễn Văn Chủ", owner_phone: "0912345678", owner_id_number: "008099001234",
    start_date: "2026-10-01", end_date: "2026-12-31", received_at: "2026-10-01", keys_count: 2,
    documents_received: "Cà vẹt bản gốc, sổ bảo hành", condition_at_receipt: "Trầy nhẹ cản trước, nội thất sạch", ...extra });
  const terms = (extra: Record<string, unknown> = {}) => ({
    request_id: uuid(), owner_expected_amount: "600000000", list_price: "650000000", discount_limit_type: "percent", discount_limit_percent: "1",
    fee_type: "percent_of_sale_price", fee_percent: "3", buyer_contract_party: "showroom", payment_collector: "showroom", signed_on: SIGNED, ...extra });

  const createContract = (user: string, vehicle: string, extra: Record<string, unknown> = {}) =>
    as(c, user, async (db) => (await db.query("select public.create_consignment_contract($1::jsonb) id", [JSON.stringify(header(vehicle, extra))])).rows[0].id as string);
  const addTerms = (user: string, contract: string, extra: Record<string, unknown> = {}, client: Client = c) =>
    as(client, user, async (db) => (await db.query("select public.add_consignment_terms($1, $2::jsonb) id", [contract, JSON.stringify(terms(extra))])).rows[0].id as string);
  const ver = async (id: string) => (await sys.query("select version from public.consignment_contracts where id = $1", [id])).rows[0].version as number;
  const activate = (user: string, id: string) => as(c, user, async (db) => db.query("select public.activate_consignment_contract($1, $2)", [id, await ver(id)]));
  const returnCar = (user: string, id: string, extra: Record<string, unknown> = {}) =>
    as(c, user, async (db) => db.query("select public.return_consignment_vehicle($1, $2, $3::jsonb)", [id, await ver(id), JSON.stringify({
      return_date: "2026-11-20", return_reason: "Chủ xe đã bán được xe nơi khác", return_condition: "Như lúc nhận", return_keys_count: 2,
      return_documents: "Cà vẹt bản gốc, sổ bảo hành", ...extra })]));
  const setStatus = (user: string, vehicle: string, status: string) =>
    as(c, user, async (db) => {
      const v = (await db.query("select version from public.vehicles where id = $1", [vehicle])).rows[0].version;
      return db.query("select public.update_vehicle($1, $2, $3::jsonb)", [vehicle, v, JSON.stringify({ sale_status: status })]);
    });
  const saleStatus = async (vehicle: string) => (await sys.query("select sale_status from public.vehicles where id = $1", [vehicle])).rows[0].sale_status as string;
  /** Xe ký gửi + hợp đồng đã kích hoạt (thỏa thuận có ngày ký, đủ biên bản nhận xe). */
  const activeContract = async () => {
    const vehicle = await newVehicle();
    const contract = await createContract(manager, vehicle);
    await addTerms(manager, contract);
    await activate(manager, contract);
    return { vehicle, contract };
  };

  it("Phân quyền: quản lý lập; kế toán chỉ đọc; sales và kỹ thuật không thấy và không ghi; anon bị chặn", async () => {
    const vehicle = await newVehicle();
    const contract = await createContract(manager, vehicle);
    await addTerms(manager, contract);
    expect(await as(c, accountant, async (db) => (await db.query("select count(*)::int n from public.consignment_contracts where id = $1", [contract])).rows[0].n)).toBe(1);
    expect(await as(c, accountant, async (db) => (await db.query("select count(*)::int n from public.consignment_terms where contract_id = $1", [contract])).rows[0].n)).toBe(1);
    await expect(createContract(accountant, await newVehicle())).rejects.toThrow(/Chỉ quản lý được lập hợp đồng ký gửi/);
    await expect(addTerms(accountant, contract)).rejects.toThrow(/row-level security|Chỉ quản lý/);
    await expect(as(c, accountant, async (db) => db.query("select public.activate_consignment_contract($1, $2)", [contract, await ver(contract)]))).rejects.toThrow(/vừa được người khác cập nhật|không có quyền/);
    for (const u of [sales, tech]) {
      const seen = await as(c, u, async (db) => ({
        contracts: (await db.query("select count(*)::int n from public.consignment_contracts")).rows[0].n,
        terms: (await db.query("select count(*)::int n from public.consignment_terms")).rows[0].n,
      }));
      expect(seen).toEqual({ contracts: 0, terms: 0 });
      await expect(createContract(u, await newVehicle())).rejects.toThrow(/Chỉ quản lý được lập hợp đồng ký gửi/);
      await expect(addTerms(u, contract)).rejects.toThrow(/row-level security|Chỉ quản lý|Không tìm thấy/);
      // sửa/trả bằng ID trực tiếp cũng bị chặn
      await expect(as(c, u, (db) => db.query("select public.update_consignment_contract($1, 1, '{\"owner_name\":\"X\"}'::jsonb)", [contract]))).rejects.toThrow(/không có quyền|Không tìm thấy/);
      await expect(as(c, u, (db) => db.query("select public.return_consignment_vehicle($1, 1, '{}'::jsonb)", [contract]))).rejects.toThrow(/vừa được người khác|không có quyền/);
    }
    await expect(as(c, null, (db) => db.query("select count(*) from public.consignment_contracts"))).rejects.toThrow(/permission denied/);
    // không ai xóa được (kể cả quản lý)
    await expect(as(c, manager, (db) => db.query("delete from public.consignment_contracts where id = $1", [contract]))).rejects.toThrow(/permission denied/);
    await expect(as(c, manager, (db) => db.query("delete from public.consignment_terms where contract_id = $1", [contract]))).rejects.toThrow(/permission denied/);
  });

  it("Chỉ lập hợp đồng cho xe ký gửi; mỗi xe một hợp đồng đang soạn/hiệu lực; hủy nháp rồi lập lại được", async () => {
    await expect(createContract(manager, await newVehicle("owned"))).rejects.toThrow(/Chỉ lập hợp đồng ký gửi cho xe ký gửi/);
    const vehicle = await newVehicle();
    const first = await createContract(manager, vehicle);
    await expect(createContract(manager, vehicle)).rejects.toThrow(/đã có hợp đồng ký gửi đang soạn/);
    await expect(as(c, manager, async (db) => db.query("select public.cancel_consignment_contract($1, $2, '  ')", [first, await ver(first)]))).rejects.toThrow(/lý do/);
    await as(c, manager, async (db) => db.query("select public.cancel_consignment_contract($1, $2, 'Chủ xe đổi ý')", [first, await ver(first)]));
    const second = await createContract(manager, vehicle);
    expect(second).not.toBe(first);
    expect((await sys.query("select status from public.consignment_contracts where id = $1", [first])).rows[0].status).toBe("cancelled");
    await expect(sys.query("update public.consignment_contracts set owner_name = 'Sửa' where id = $1", [first])).rejects.toThrow(/đã kết thúc, không sửa/);
  });

  it("Bấm lặp/thử lại cùng request_id không sinh trùng hợp đồng hoặc thỏa thuận", async () => {
    const vehicle = await newVehicle();
    const h = header(vehicle);
    const call = () => as(c, manager, async (db) => (await db.query("select public.create_consignment_contract($1::jsonb) id", [JSON.stringify(h)])).rows[0].id as string);
    const [a, b] = await Promise.all([
      as(c, manager, async (db) => (await db.query("select public.create_consignment_contract($1::jsonb) id", [JSON.stringify(h)])).rows[0].id as string),
      as(c2, manager, async (db) => (await db.query("select public.create_consignment_contract($1::jsonb) id", [JSON.stringify(h)])).rows[0].id as string),
    ]);
    expect(a).toBe(b);
    expect(await call()).toBe(a);
    const t = terms();
    const addSame = () => as(c, manager, async (db) => (await db.query("select public.add_consignment_terms($1, $2::jsonb) id", [a, JSON.stringify(t)])).rows[0].id as string);
    expect(await addSame()).toBe(await addSame());
    expect((await sys.query("select count(*)::int n from public.consignment_contracts where vehicle_id = $1", [vehicle])).rows[0].n).toBe(1);
    expect((await sys.query("select count(*)::int n from public.consignment_terms where contract_id = $1", [a])).rows[0].n).toBe(1);
  });

  it("Thỏa thuận: phí cố định HOẶC phần trăm giá bán, không lẫn; phiên bản tăng dần, không sửa, không xóa", async () => {
    const vehicle = await newVehicle();
    const contract = await createContract(manager, vehicle);
    // phí phần trăm thiếu %, hoặc kèm cả số tiền cố định → sai
    await expect(addTerms(manager, contract, { fee_percent: undefined })).rejects.toThrow(/consignment_terms_fee_shape/);
    await expect(addTerms(manager, contract, { fee_fixed_amount: "20000000" })).rejects.toThrow(/consignment_terms_fee_shape/);
    await expect(addTerms(manager, contract, { fee_percent: "101" })).rejects.toThrow(/fee_percent/);
    // phí cố định đúng
    const v1 = await addTerms(manager, contract, { fee_type: "fixed", fee_fixed_amount: "20000000", fee_percent: undefined, signed_on: undefined });
    // quyền giảm giá: loại 'none' không được kèm số
    await expect(addTerms(manager, contract, { discount_limit_type: "none" })).rejects.toThrow(/consignment_terms_discount_shape/);
    await expect(addTerms(manager, contract, { discount_limit_type: "amount", discount_limit_percent: "1" })).rejects.toThrow(/consignment_terms_discount_shape/);
    await expect(addTerms(manager, contract, { signed_on: "2099-01-01" })).rejects.toThrow(/không được ở tương lai/);
    await expect(addTerms(manager, contract, { list_price: "0" })).rejects.toThrow(/list_price/);
    const v2 = await addTerms(manager, contract, { discount_limit_type: "amount", discount_limit_amount: "5000000", discount_limit_percent: undefined });
    const rows = (await sys.query("select id, version_no, signed_on is not null as signed from public.consignment_terms where contract_id = $1 order by version_no", [contract])).rows;
    expect(rows.map((r) => r.version_no)).toEqual([1, 2]);
    expect(rows[0].id).toBe(v1);
    expect(rows[1].id).toBe(v2);
    expect(rows[0].signed).toBe(false);
    expect(rows[1].signed).toBe(true);
    // không sửa nội dung, không xóa, kể cả với quyền hệ thống
    await expect(sys.query("update public.consignment_terms set fee_percent = null, fee_type = 'fixed', fee_fixed_amount = 1 where id = $1", [v2])).rejects.toThrow(/đã được ký xác nhận, không sửa/);
    await expect(sys.query("update public.consignment_terms set list_price = 1 where id = $1", [v1])).rejects.toThrow(/không sửa nội dung/);
    await expect(sys.query("delete from public.consignment_terms where id = $1", [v1])).rejects.toThrow(/Không xóa thỏa thuận/);
    // bản chưa ký: bổ sung ngày ký một lần
    await as(c, manager, (db) => db.query("select public.confirm_consignment_terms($1, $2, 'HĐKG-001')", [v1, SIGNED]));
    expect((await sys.query("select agreement_ref from public.consignment_terms where id = $1", [v1])).rows[0].agreement_ref).toBe("HĐKG-001");
    await expect(as(c, manager, (db) => db.query("select public.confirm_consignment_terms($1, $2, null)", [v1, SIGNED]))).rejects.toThrow(/đã được ký xác nhận/);
  });

  it("Hai người thêm thỏa thuận cùng lúc: số phiên bản không trùng", async () => {
    const contract = await createContract(manager, await newVehicle());
    await Promise.all([addTerms(manager, contract, {}, c), addTerms(manager, contract, {}, c2)]);
    const nos = (await sys.query("select version_no from public.consignment_terms where contract_id = $1 order by 1", [contract])).rows.map((r) => r.version_no);
    expect(nos).toEqual([1, 2]);
  });

  it("Không kích hoạt khi thiếu thỏa thuận đã ký hoặc biên bản nhận xe; kích hoạt xong chốt biên bản", async () => {
    const vehicle = await newVehicle();
    const contract = await createContract(manager, vehicle, { keys_count: undefined, condition_at_receipt: undefined });
    await expect(activate(manager, contract)).rejects.toThrow(/Chưa có thỏa thuận .* ký xác nhận/);
    await addTerms(manager, contract, { signed_on: undefined });
    await expect(activate(manager, contract)).rejects.toThrow(/Chưa có thỏa thuận .* ký xác nhận/);   // chưa ký ≠ có hiệu lực
    const t2 = await addTerms(manager, contract);
    expect(t2).toBeTruthy();
    await expect(activate(manager, contract)).rejects.toThrow(/Chưa đủ thông tin kích hoạt/);        // thiếu biên bản nhận xe
    await as(c, manager, async (db) => db.query("select public.update_consignment_contract($1, $2, $3::jsonb)", [contract, await ver(contract),
      JSON.stringify({ keys_count: "0", condition_at_receipt: "Nguyên bản, không trầy xước" })]));   // 0 chìa khóa là số thật, khác "chưa ghi"
    await activate(manager, contract);
    const row = (await sys.query("select status, activated_by, activated_at is not null as at, keys_count from public.consignment_contracts where id = $1", [contract])).rows[0];
    expect(row).toMatchObject({ status: "active", activated_by: manager, at: true, keys_count: 0 });
    // biên bản nhận xe đã chốt; hạn ký gửi vẫn gia hạn được; không đổi trạng thái/giả mạo người kích hoạt bằng sửa trực tiếp
    await expect(as(c, manager, async (db) => db.query("select public.update_consignment_contract($1, $2, '{\"keys_count\":\"5\"}'::jsonb)", [contract, await ver(contract)]))).rejects.toThrow(/Biên bản nhận xe .* đã chốt/);
    await as(c, manager, async (db) => db.query("select public.update_consignment_contract($1, $2, '{\"end_date\":\"2027-03-31\"}'::jsonb)", [contract, await ver(contract)]));
    await expect(as(c, manager, (db) => db.query("update public.consignment_contracts set activated_by = null where id = $1", [contract]))).rejects.toThrow(/Không sửa trực tiếp/);
    // sửa với phiên bản cũ → báo xung đột, không ghi đè âm thầm
    await expect(as(c, manager, (db) => db.query("select public.update_consignment_contract($1, 1, '{\"owner_name\":\"Người khác\"}'::jsonb)", [contract]))).rejects.toThrow(/vừa được người khác cập nhật/);
  });

  it("Xe ký gửi chỉ chào bán khi có hợp đồng hiệu lực; trả chủ chỉ qua biên bản trả xe", async () => {
    const vehicle = await newVehicle();
    await expect(setStatus(manager, vehicle, "available")).rejects.toThrow(/cần có hợp đồng ký gửi đang hiệu lực/);
    const contract = await createContract(manager, vehicle);
    await addTerms(manager, contract);
    await expect(setStatus(manager, vehicle, "available")).rejects.toThrow(/cần có hợp đồng ký gửi đang hiệu lực/);   // mới là nháp
    await activate(manager, contract);
    await setStatus(manager, vehicle, "available");
    expect(await saleStatus(vehicle)).toBe("available");
    // trả chủ bằng cách sửa trạng thái trực tiếp là không được, dù là quản lý
    await expect(setStatus(manager, vehicle, "returned_to_owner")).rejects.toThrow(/phải lập biên bản trả xe/);
    await expect(as(c, manager, (db) => db.query("update public.vehicles set sale_status = 'returned_to_owner' where id = $1", [vehicle]))).rejects.toThrow(/phải lập biên bản trả xe/);
    // xe sở hữu không bị ảnh hưởng bởi luật ký gửi
    const owned = await newVehicle("owned");
    await setStatus(manager, owned, "available");
    expect(await saleStatus(owned)).toBe("available");
  });

  it("Trả xe: chặn khi còn chi phí dự kiến chưa xử lý; chi phí chủ xe chưa trả phải ghi cách xử lý; ảnh chụp do database tính", async () => {
    const { vehicle, contract } = await activeContract();
    const cost = (p: Record<string, unknown>) => as(c, manager, async (db) => (await db.query("select public.create_vehicle_cost($1::jsonb) id", [JSON.stringify({
      request_id: uuid(), vehicle_id: vehicle, category: "repair", description: "Sơn dặm", ...p })])).rows[0].id as string);
    // Quyết định D30: chi phí xe ký gửi phát sinh KHÔNG cần chủ xe duyệt — quản lý/kế toán xác nhận và ghi chi là đủ
    const ownerCost = await cost({ borne_by: "owner", estimated_amount: "3000000" });
    await expect(returnCar(manager, contract)).rejects.toThrow(/Còn 1 khoản chi phí chưa xác nhận hoặc hủy/);
    await as(c, accountant, async (db) => db.query("select public.confirm_vehicle_cost($1, $2, $3::jsonb)", [ownerCost,
      (await db.query("select version from public.vehicle_costs where id = $1", [ownerCost])).rows[0].version, JSON.stringify({ confirmed_amount: "2800000" })]));
    await as(c, accountant, (db) => db.query("select public.record_cost_payment($1::jsonb)", [JSON.stringify({ request_id: uuid(), cost_id: ownerCost, amount: "1000000", account_id: acct })]));
    // đã có 1.800.000 chi phí chủ xe chịu chưa thanh toán → phải ghi cách xử lý
    await expect(returnCar(manager, contract)).rejects.toThrow(/Còn 1800000 đ chi phí chủ xe chịu chưa thanh toán/);
    // thiếu ngày trả/lý do
    await expect(returnCar(manager, contract, { return_cost_note: "Chủ xe hoàn trả 1,8tr khi nhận xe", return_reason: "" })).rejects.toThrow(/Biên bản trả xe cần/);
    // xe đang giữ → chưa trả được
    await sys.query("update public.vehicles set sale_status = 'available' where id = $1", [vehicle]);
    await sys.query("update public.vehicles set sale_status = 'held' where id = $1", [vehicle]);
    await expect(returnCar(manager, contract, { return_cost_note: "x" })).rejects.toThrow(/đang giữ\/cọc\/đã bán/);
    await sys.query("update public.vehicles set sale_status = 'available' where id = $1", [vehicle]);
    // số ảnh chụp gửi lên bị bỏ qua: database tự tính
    await returnCar(manager, contract, { return_cost_note: "Chủ xe hoàn trả 1,8tr khi nhận xe", return_owner_cost_confirmed: "1", return_owner_cost_unpaid: "1" });
    const row = (await sys.query(
      "select status, return_owner_cost_confirmed::text conf, return_owner_cost_unpaid::text unpaid, returned_by, returned_at is not null as at from public.consignment_contracts where id = $1", [contract])).rows[0];
    expect(row).toMatchObject({ status: "returned", conf: "2800000", unpaid: "1800000", returned_by: manager, at: true });
    expect(await saleStatus(vehicle)).toBe("returned_to_owner");
    // hồ sơ không bị xóa; hợp đồng và xe đã kết thúc vòng không sửa lại
    expect((await sys.query("select count(*)::int n from public.vehicles where id = $1", [vehicle])).rows[0].n).toBe(1);
    await expect(sys.query("update public.consignment_contracts set owner_name = 'Sửa' where id = $1", [contract])).rejects.toThrow(/đã kết thúc, không sửa/);
    await expect(createContract(manager, vehicle)).rejects.toThrow(/đã kết thúc vòng ký gửi/);
    await expect(setStatus(manager, vehicle, "available")).rejects.toThrow(/Xe đã kết thúc một vòng/);
    // chi phí và thanh toán của chủ xe vẫn nguyên vẹn
    expect((await sys.query("select count(*)::int n from public.vehicle_cost_payments where cost_id = $1 and status = 'posted'", [ownerCost])).rows[0].n).toBe(1);
  });

  it("Trả xe khi không có chi phí chủ xe chịu: không cần ghi chú xử lý chi phí; ảnh chụp bằng 0 thật", async () => {
    const { vehicle, contract } = await activeContract();
    await returnCar(manager, contract);
    const row = (await sys.query("select return_owner_cost_confirmed::text conf, return_owner_cost_unpaid::text unpaid from public.consignment_contracts where id = $1", [contract])).rows[0];
    expect(row).toEqual({ conf: "0", unpaid: "0" });
    expect(await saleStatus(vehicle)).toBe("returned_to_owner");
  });

  it("Hợp đồng nháp hủy được, hợp đồng hiệu lực không hủy (kết thúc bằng biên bản trả xe)", async () => {
    const { contract } = await activeContract();
    await expect(as(c, manager, async (db) => db.query("select public.cancel_consignment_contract($1, $2, 'Muốn hủy')", [contract, await ver(contract)]))).rejects.toThrow(/Chỉ hợp đồng nháp mới hủy/);
  });

  it("Phí: tính một nguồn ở database — cố định, phần trăm trên giá bán, làm tròn nửa lên đến 1 VND", async () => {
    const fee = async (type: string, fixed: string | null, pct: string | null, price: string) =>
      (await sys.query("select private.consignment_fee($1, $2::numeric, $3::numeric, $4::numeric)::text f", [type, fixed, pct, price])).rows[0].f as string;
    expect(await fee("fixed", "20000000", null, "650000000")).toBe("20000000");
    expect(await fee("percent_of_sale_price", null, "3", "650000000")).toBe("19500000");
    expect(await fee("percent_of_sale_price", null, "2", "650000000")).toBe("13000000");
    expect(await fee("percent_of_sale_price", null, "4", "650000000")).toBe("26000000");
    expect(await fee("percent_of_sale_price", null, "0.5", "5100")).toBe("26");        // 25,5 → 26 (nửa lên)
    expect(await fee("percent_of_sale_price", null, "2.5", "1000001")).toBe("25000");   // 25000,025 → 25000
  });

  it("Nhật ký kiểm toán của hợp đồng không chứa số điện thoại, số giấy tờ, ghi chú ủy quyền của chủ xe", async () => {
    const vehicle = await newVehicle();
    const contract = await createContract(manager, vehicle, { owner_phone: "0987000111", owner_id_number: "001099999999", acts_by_proxy: true, proxy_note: "Giấy ủy quyền số 123" });
    await as(c, manager, async (db) => db.query("select public.update_consignment_contract($1, $2, '{\"owner_phone\":\"0987000222\",\"end_date\":\"2027-01-31\"}'::jsonb)", [contract, await ver(contract)]));
    const logs = (await sys.query("select old_data::text o, new_data::text n, changed_fields from public.audit_logs where table_name = 'consignment_contracts' and record_id = $1", [contract])).rows;
    expect(logs.length).toBeGreaterThanOrEqual(2);
    for (const l of logs) {
      const blob = `${l.o ?? ""}${l.n ?? ""}`;
      expect(blob).not.toMatch(/0987000111|0987000222|001099999999|Giấy ủy quyền/);
    }
    // vẫn truy vết được việc đổi hạn ký gửi
    expect(logs.some((l) => (l.changed_fields ?? []).includes("end_date"))).toBe(true);
  });

  it("Ủy quyền: khai là người được ủy quyền thì bắt buộc ghi thông tin ủy quyền", async () => {
    await expect(createContract(manager, await newVehicle(), { acts_by_proxy: true })).rejects.toThrow(/consignment_proxy_note/);
    await createContract(manager, await newVehicle(), { acts_by_proxy: true, proxy_note: "Giấy ủy quyền số 45, người ủy quyền: Trần Thị B" });
  });

  it("Ngày kết thúc không trước ngày bắt đầu", async () => {
    await expect(createContract(manager, await newVehicle(), { start_date: "2026-12-31", end_date: "2026-10-01" })).rejects.toThrow(/consignment_dates_order/);
  });
});
