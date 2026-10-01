import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Option = { id: string; name: string };
export type ModelOption = Option & { make_id: string };
export type VariantOption = Option & { model_id: string };
export type Catalog = { makes: Option[]; models: ModelOption[]; variants: VariantOption[]; colors: string[] };

export const getStaleDays = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "demand_stale_after_days").maybeSingle();
  const n = Number(data?.value);
  return Number.isInteger(n) && n > 0 ? n : 14;
});

export const getSources = cache(async (): Promise<(Option & { is_self_found: boolean })[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("customer_sources").select("id, name, is_self_found").eq("is_active", true).order("sort_order");
  return data ?? [];
});

export const getSellers = cache(async (): Promise<Option[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_sellers");
  return ((data as { id: string; full_name: string }[] | null) ?? []).map((x) => ({ id: x.id, name: x.full_name }));
});

export const getCatalog = cache(async (): Promise<Catalog> => {
  const supabase = await createClient();
  const [makes, models, variants, colors] = await Promise.all([
    supabase.from("vehicle_makes").select("id, name").order("name"),
    supabase.from("vehicle_models").select("id, name, make_id").order("name"),
    supabase.from("vehicle_variants").select("id, name, model_id").order("name"),
    supabase.from("vehicle_colors").select("name").order("sort_order"),
  ]);
  return {
    makes: makes.data ?? [],
    models: models.data ?? [],
    variants: variants.data ?? [],
    colors: (colors.data ?? []).map((c) => c.name),
  };
});

export type SavedFilter = { id: string; name: string; query: string };
export async function getSavedFilters(scope = "demands"): Promise<SavedFilter[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("saved_filters").select("id, name, query").eq("scope", scope).order("name");
  return data ?? [];
}

/** Một dòng kết quả của search_demands (view demand_search). */
export type DemandRow = {
  id: string; code: string; kind: "buy" | "sell"; status: string; priority: string;
  owner_id: string | null; owner_name: string | null; customer_id: string; customer_name: string; customer_phone: string | null; customer_area: string | null;
  next_action: string | null; next_action_due: string | null; last_contact_at: string | null; last_activity_at: string;
  created_at: string; is_trade_in: boolean; price_low: unknown; price_high: unknown; year_low: number | null; year_high: number | null;
  colors: string[]; vehicle_summary: string | null; version: number;
};

export async function searchDemands(rpc: Record<string, string>, limit: number, offset: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_demands", { f: rpc, p_limit: limit, p_offset: offset });
  if (error) return { total: 0, rows: [] as DemandRow[], error: error.message };
  const res = data as { total: number; rows: DemandRow[] };
  return { total: Number(res.total), rows: res.rows, error: null as string | null };
}
