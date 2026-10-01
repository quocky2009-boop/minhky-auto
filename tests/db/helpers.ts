import { Client } from "pg";
import { randomUUID } from "node:crypto";

export const DB_URL = process.env.TEST_DATABASE_URL;

export async function connect(): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

export type Role = "admin" | "manager" | "accountant" | "sales" | "technician";

export async function createUser(sys: Client, name: string, roles: Role[]): Promise<string> {
  const id = randomUUID();
  await sys.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@test.local`]);
  await sys.query("insert into public.profiles (id, full_name) values ($1, $2)", [id, name]);
  for (const r of roles) await sys.query("insert into public.user_roles (user_id, role) values ($1, $2)", [id, r]);
  return id;
}

/** Chạy câu lệnh với quyền người dùng đã đăng nhập (giống PostgREST: role authenticated + JWT claims). */
export async function as<T>(c: Client, userId: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
  await c.query("begin");
  try {
    if (userId) {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    } else {
      await c.query("set local role anon");
      await c.query("select set_config('request.jwt.claims', '', true)");
    }
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

export const uuid = randomUUID;
