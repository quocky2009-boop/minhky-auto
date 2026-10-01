"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: string } | undefined;

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email: z.email(), password: z.string().min(1) }).safeParse({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
  if (!parsed.success) return { error: "Nhập email và mật khẩu hợp lệ." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email hoặc mật khẩu không đúng." };
  redirect("/tong-quan");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/dang-nhap");
}

export async function setPassword(_: FormState, form: FormData): Promise<FormState> {
  const pw = String(form.get("password") ?? "");
  const pw2 = String(form.get("password2") ?? "");
  if (pw.length < 10) return { error: "Mật khẩu cần ít nhất 10 ký tự." };
  if (pw !== pw2) return { error: "Hai lần nhập mật khẩu không khớp." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { error: "Không đặt được mật khẩu. Liên kết có thể đã hết hạn — nhờ quản trị gửi lại lời mời." };
  redirect("/tong-quan");
}
