/**
 * Nghiệm thu bảo mật (CLAUDE.md §11): kiểm toàn bộ schema public, không chỉ từng tính năng.
 * Chạy trên database test cục bộ sau khi áp mọi migration; cùng truy vấn này được chạy trên Supabase thật sau mỗi lần áp migration.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { DB_URL, connect } from "./helpers";

const d = DB_URL ? describe : describe.skip;

d("Nền bảo mật toàn schema public — nghiệm thu", () => {
  let sys: Client;
  beforeAll(async () => { sys = await connect(); });
  afterAll(async () => { await sys.end(); });
  const rows = async (sql: string) => (await sys.query(sql)).rows as Record<string, string>[];

  it("mọi bảng đều bật RLS", async () => {
    expect(await rows("select tablename from pg_tables where schemaname = 'public' and not rowsecurity")).toEqual([]);
  });

  it("anon không có quyền nào trên bảng/view; không ai có TRUNCATE; DELETE chỉ ở các bảng liên kết/cấu hình mà ứng dụng thật sự xóa (4200)", async () => {
    expect(await rows("select table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'")).toEqual([]);
    expect(await rows("select table_name from information_schema.role_table_grants g join pg_class c on c.relname = g.table_name and c.relkind in ('r', 'p') join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public' where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type = 'TRUNCATE'")).toEqual([]);
    const del = (await rows("select distinct table_name from information_schema.role_table_grants g join pg_class c on c.relname = g.table_name and c.relkind in ('r', 'p') join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public' where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type = 'DELETE' order by 1")).map((r) => r.table_name);
    expect(del).toEqual(["appraisal_items", "demand_shares", "demand_vehicle_options", "saved_filters", "user_roles", "vehicle_capital_shares"]);
  });

  it("view chỉ cấp SELECT cho người đăng nhập (4100) và đều chạy theo quyền người gọi (security invoker)", async () => {
    expect(await rows("select table_name, privilege_type from information_schema.role_table_grants g join pg_class c on c.relname = g.table_name and c.relkind = 'v' join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public' where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type <> 'SELECT'")).toEqual([]);
    expect(await rows("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v' and coalesce(c.reloptions::text, '') not like '%security_invoker=true%'")).toEqual([]);
  });

  it("anon không gọi được hàm nào của schema public; hàm SECURITY DEFINER công khai nằm trong danh sách đã rà", async () => {
    expect(await rows("select routine_name from information_schema.routine_privileges where routine_schema = 'public' and grantee = 'anon'")).toEqual([]);
    const definers = (await rows("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef order by 1")).map((r) => r.proname);
    // Mỗi hàm dưới đây trả về dữ liệu hẹp (id + tên, cờ, số) và tự kiểm quyền bên trong; thêm hàm mới phải được rà rồi mới thêm vào đây.
    const reviewed = ["find_customers_by_phone", "list_sellers", "list_staff", "match_pool_buy_demands", "match_pool_sell_offers", "my_roles", "public_reservation_info"];
    // Hàm cho agent định giá bên ngoài (đã xuất từ Supabase vào repository, docs/EXTERNAL_MIGRATIONS.md): chỉ được phép nếu KHÔNG ai ngoài chủ hàm/service_role gọi được.
    const agent = definers.filter((n) => n.startsWith("valuation_agent_"));
    expect(agent.length).toBeGreaterThan(0);
    expect(definers.filter((n) => !reviewed.includes(n) && !n.startsWith("valuation_agent_"))).toEqual([]);
    expect(await rows("select routine_name, grantee from information_schema.routine_privileges where routine_schema = 'public' and routine_name like 'valuation_agent_%' and grantee in ('anon', 'authenticated', 'PUBLIC')")).toEqual([]);
  });

  it("agent định giá: bản dựng từ repository (băm token được che) từ chối mọi token; bảng kết quả AI chỉ đọc với người đăng nhập", async () => {
    await expect(sys.query("select public.valuation_agent_get_case('bat-ky-token-nao', null, 'DX00001')")).rejects.toThrow(/unauthorized/);
    expect(await rows("select table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name like 'appraisal_ai_%' and grantee = 'authenticated' and privilege_type <> 'SELECT'")).toEqual([]);
  });

  it("bảng chứng từ tiền không cho vai trò đăng nhập ghi thẳng ngoài chính sách RLS (không có chính sách INSERT cho bảng chỉ ghi qua trigger)", async () => {
    expect(await rows("select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'commission_entries' and grantee in ('authenticated', 'anon') and privilege_type = 'INSERT'")).toEqual([]);
  });
});
