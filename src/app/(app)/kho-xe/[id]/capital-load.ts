import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PartyRow = { id: string; code: string; name: string; kind: string; is_active: boolean };
export type ShareRow = { party_id: string; ratio_percent: string };
export type TermsRow = {
  id: string; version_no: number; status: "draft" | "approved" | "superseded" | "void"; version: number; company_rate: string;
  cost_basis: string | null; loss_policy: string | null; basis_note: string | null; agreement_ref: string | null;
  approved_at: string | null; reconfirmed_at: string | null; reconfirm_note: string | null; void_reason: string | null; created_at: string;
  shares: ShareRow[];
};
export type EntryRow = { id: string; party_id: string; entry_type: string; amount: unknown; entry_date: string; reference: string | null; note: string | null; status: string; void_reason: string | null };
export type SummaryRow = { party_id: string; committed: unknown; received: unknown; withdrawn: unknown; net_received: unknown };
export type LoanPaymentRow = { id: string; kind: string; amount: unknown; paid_on: string; reference: string | null; status: string };
export type LoanRow = {
  id: string; party_id: string; principal: unknown; drawn_date: string; due_date: string | null; interest_terms: string; reference: string | null; status: string;
  payments: LoanPaymentRow[]; principal_paid: unknown; interest_paid: unknown; principal_outstanding: unknown;
};

/** Toàn bộ dữ liệu vốn góp của một xe sở hữu. Chỉ quản lý/kế toán đọc được (RLS); sales/kỹ thuật nhận về rỗng. */
export async function loadCapital(supabase: SupabaseClient, vehicleId: string) {
  const [parties, terms, entries, summary, status, loans, loanSummary] = await Promise.all([
    supabase.from("capital_parties").select("id, code, name, kind, is_active").order("name"),
    supabase.from("vehicle_capital_terms")
      .select("id, version_no, status, version, company_rate, cost_basis, loss_policy, basis_note, agreement_ref, approved_at, reconfirmed_at, reconfirm_note, void_reason, created_at, shares:vehicle_capital_shares(party_id, ratio_percent)")
      .eq("vehicle_id", vehicleId).order("version_no", { ascending: false }),
    supabase.from("vehicle_capital_entries").select("id, party_id, entry_type, amount, entry_date, reference, note, status, void_reason")
      .eq("vehicle_id", vehicleId).order("entry_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("vehicle_capital_summary").select("party_id, committed, received, withdrawn, net_received").eq("vehicle_id", vehicleId),
    supabase.from("vehicle_capital_status").select("terms_id, needs_reconfirm, last_change_at").eq("vehicle_id", vehicleId).maybeSingle(),
    supabase.from("vehicle_loans")
      .select("id, party_id, principal, drawn_date, due_date, interest_terms, reference, status, payments:vehicle_loan_payments(id, kind, amount, paid_on, reference, status)")
      .eq("vehicle_id", vehicleId).order("drawn_date", { ascending: false }),
    supabase.from("vehicle_loan_summary").select("loan_id, principal_paid, interest_paid, principal_outstanding").eq("vehicle_id", vehicleId),
  ]);
  const sums = new Map(((loanSummary.data ?? []) as { loan_id: string; principal_paid: unknown; interest_paid: unknown; principal_outstanding: unknown }[]).map((s) => [s.loan_id, s]));
  const loanRows = ((loans.data ?? []) as unknown as (Omit<LoanRow, "principal_paid" | "interest_paid" | "principal_outstanding">)[]).map((l) => ({
    ...l, payments: [...(l.payments ?? [])].sort((a, b) => a.paid_on.localeCompare(b.paid_on)),
    principal_paid: sums.get(l.id)?.principal_paid ?? 0, interest_paid: sums.get(l.id)?.interest_paid ?? 0, principal_outstanding: sums.get(l.id)?.principal_outstanding ?? l.principal,
  })) as LoanRow[];
  return {
    parties: (parties.data ?? []) as PartyRow[],
    terms: ((terms.data ?? []) as unknown as TermsRow[]),
    entries: (entries.data ?? []) as EntryRow[],
    summary: (summary.data ?? []) as SummaryRow[],
    needsReconfirm: !!(status.data as { needs_reconfirm?: boolean } | null)?.needs_reconfirm,
    loans: loanRows,
  };
}
