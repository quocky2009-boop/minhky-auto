import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Template = { key: string; label: string; grp: string; sort_order: number; is_required: boolean; requires_note_on_pass: boolean; ev_only: boolean };
export type AppraisalView = {
  status: "draft" | "approved" | "rejected"; is_ev: boolean; summary: string | null; version: number; decided_at: string | null; reject_reason: string | null;
  items: Record<string, { result: string; note: string }>;
  proposed_price: unknown; approved_max_price: unknown; hasFinance: boolean;
};

export async function loadAppraisal(supabase: SupabaseClient, demandId: string, withFinance: boolean) {
  const [{ data: tpl }, { data: a }] = await Promise.all([
    supabase.from("appraisal_templates").select("key, label, grp, sort_order, is_required, requires_note_on_pass, ev_only").eq("is_active", true).order("sort_order"),
    supabase.from("appraisals").select("status, is_ev, summary, version, decided_at, reject_reason").eq("demand_id", demandId).maybeSingle(),
  ]);
  const templates = (tpl ?? []) as Template[];
  if (!a) return { templates, appraisal: null as AppraisalView | null };
  const [{ data: items }, fin] = await Promise.all([
    supabase.from("appraisal_items").select("template_key, result, note").eq("demand_id", demandId),
    withFinance ? supabase.from("appraisal_financials").select("proposed_price, approved_max_price").eq("demand_id", demandId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    templates,
    appraisal: {
      ...a,
      items: Object.fromEntries((items ?? []).map((i) => [i.template_key, { result: i.result, note: i.note ?? "" }])),
      proposed_price: fin.data?.proposed_price ?? null, approved_max_price: fin.data?.approved_max_price ?? null, hasFinance: !!fin.data,
    } as AppraisalView,
  };
}
