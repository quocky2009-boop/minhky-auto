import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TermsRow } from "@/lib/consignment";

export type ContractRow = {
  id: string; code: string; status: "draft" | "active" | "returned" | "cancelled"; version: number;
  owner_name: string; owner_phone: string | null; owner_id_number: string | null; acts_by_proxy: boolean; proxy_note: string | null;
  start_date: string | null; end_date: string | null;
  received_at: string | null; keys_count: number | null; documents_received: string | null; condition_at_receipt: string | null; receipt_note: string | null;
  activated_at: string | null;
  return_date: string | null; return_reason: string | null; return_condition: string | null; return_keys_count: number | null; return_documents: string | null;
  return_cost_note: string | null; return_owner_cost_confirmed: unknown; return_owner_cost_unpaid: unknown;
  cancel_reason: string | null; created_at: string;
};

const CONTRACT_COLS = "id, code, status, version, owner_name, owner_phone, owner_id_number, acts_by_proxy, proxy_note, start_date, end_date, received_at, keys_count, documents_received, condition_at_receipt, receipt_note, activated_at, return_date, return_reason, return_condition, return_keys_count, return_documents, return_cost_note, return_owner_cost_confirmed, return_owner_cost_unpaid, cancel_reason, created_at";

/** Hợp đồng hiện tại của xe: ưu tiên bản đang soạn/hiệu lực; không có thì bản mới nhất (đã trả/hủy) để xem lịch sử. Chỉ quản lý/kế toán đọc được (RLS). */
export async function loadConsignment(supabase: SupabaseClient, vehicleId: string) {
  const { data: rows } = await supabase.from("consignment_contracts").select(CONTRACT_COLS).eq("vehicle_id", vehicleId).order("created_at", { ascending: false });
  const all = (rows ?? []) as unknown as ContractRow[];
  const contract = all.find((c) => c.status === "draft" || c.status === "active") ?? all[0] ?? null;
  const earlier = all.filter((c) => c.id !== contract?.id);
  if (!contract) return { contract: null, terms: [] as TermsRow[], earlier };
  const { data: terms } = await supabase.from("consignment_terms")
    .select("id, version_no, owner_expected_amount, list_price, discount_limit_type, discount_limit_amount, discount_limit_percent, fee_type, fee_fixed_amount, fee_percent, buyer_contract_party, payment_collector, other_terms, signed_on, agreement_ref, created_at")
    .eq("contract_id", contract.id).order("version_no", { ascending: false });
  return { contract, terms: (terms ?? []) as unknown as TermsRow[], earlier };
}
