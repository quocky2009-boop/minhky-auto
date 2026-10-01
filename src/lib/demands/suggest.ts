/**
 * Chuyển dữ liệu nguồn ghép (RPC match_pool_*) thành kiểu của bộ quy tắc ghép và xếp hạng gợi ý.
 * Thuần TypeScript — kiểm thử được, không gọi database.
 */
import { evaluateMatch, type BuyCriteria, type CandidateVehicle, type Criterion, type MatchResult } from "@/lib/matching";
import { toVnd } from "@/lib/money";

export type BuyDemandRow = {
  demand_id?: string; id?: string;
  budget_min: unknown; budget_max: unknown; year_min: number | null; year_max: number | null;
  odo_max: number | null; fuel_types: string[] | null; seats: number[] | null; condition_pref: string | null;
  colors_accepted: string[] | null; colors_rejected: string[] | null; strict_criteria: string[] | null;
  last_activity_at?: string | null; status?: string;
  options: { make_id: string; model_id: string | null; variant_id: string | null; make?: string; model?: string | null; variant?: string | null }[];
};

export function toBuyCriteria(d: BuyDemandRow, staleDays: number, now = new Date()): BuyCriteria {
  const stale = !!d.last_activity_at && new Date(d.last_activity_at).getTime() < now.getTime() - staleDays * 86400000;
  return {
    options: (d.options ?? []).map((o) => ({ makeId: o.make_id, modelId: o.model_id, variantId: o.variant_id })),
    yearMin: d.year_min, yearMax: d.year_max,
    budgetMin: toVnd(d.budget_min), budgetMax: toVnd(d.budget_max),
    odoMax: d.odo_max,
    fuelTypes: d.fuel_types ?? [],
    seats: (d.seats ?? []).map(Number),
    condition: (d.condition_pref as BuyCriteria["condition"]) ?? null,
    colorsAccepted: d.colors_accepted ?? [],
    colorsRejected: d.colors_rejected ?? [],
    strict: (d.strict_criteria ?? []) as Criterion[],
    stale,
  };
}

export type VehiclePoolRow = {
  vehicle_id: string; code: string; condition: string; business_type: string; sale_status: string;
  make_id: string; model_id: string | null; variant_id: string | null; make_name: string; model_name: string | null; variant_name: string | null;
  year_made: number | null; color: string | null; fuel_type: string | null; seats: number | null; odo: number | null; asking_price: unknown;
};
export type SellPoolRow = {
  demand_id: string; code: string; status: string; owner_id: string | null; owner_name: string | null; can_open: boolean; last_activity_at: string;
  make_id: string | null; model_id: string | null; variant_id: string | null; make_name: string | null; model_name: string | null; variant_name: string | null;
  year_made: number | null; color: string | null; fuel_type: string | null; seats: number | null; odo: number | null; asking_price: unknown; sale_mode: string;
};

export function vehicleToCandidate(v: VehiclePoolRow): CandidateVehicle {
  return {
    makeId: v.make_id, modelId: v.model_id, variantId: v.variant_id, year: v.year_made, color: v.color,
    fuelType: v.fuel_type, seats: v.seats, odo: v.odo, price: toVnd(v.asking_price),
    condition: v.condition === "new" ? "new" : v.condition === "used" ? "used" : null,
    availability: v.sale_status === "held" ? "held" : v.business_type === "consignment" ? "consignment" : "in_stock",
  };
}

/** Xe khách đang chào bán: luôn là "nguồn chưa thu mua"; xe khách bán là xe đã qua sử dụng. */
export function sellOfferToCandidate(s: SellPoolRow): CandidateVehicle | null {
  if (!s.make_id) return null; // chưa biết hãng -> không ghép được
  return {
    makeId: s.make_id, modelId: s.model_id, variantId: s.variant_id, year: s.year_made, color: s.color,
    fuelType: s.fuel_type, seats: s.seats, odo: s.odo, price: toVnd(s.asking_price),
    condition: "used", availability: "source_not_acquired",
  };
}

export type Suggestion<T> = { item: T; result: MatchResult };

/** Giữ các gợi ý không bị loại, xếp hạng giảm dần. */
export function rank<T>(items: T[], evaluate: (t: T) => MatchResult | null, limit = 20): Suggestion<T>[] {
  return items
    .map((item) => ({ item, result: evaluate(item) }))
    .filter((x): x is Suggestion<T> => !!x.result && x.result.level !== "excluded")
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, limit);
}

export const suggestForBuy = (criteria: BuyCriteria, vehicles: VehiclePoolRow[], offers: SellPoolRow[], excludeDemandId?: string) => ({
  vehicles: rank(vehicles, (v) => evaluateMatch(criteria, vehicleToCandidate(v))),
  offers: rank(offers.filter((o) => o.demand_id !== excludeDemandId), (o) => {
    const c = sellOfferToCandidate(o);
    return c ? evaluateMatch(criteria, c) : null;
  }),
});

/** Nhu cầu bán mới -> gợi ý khách mua đang cần (mỗi khách mua dùng tiêu chí của chính họ). */
export function suggestBuyersForOffer<T extends BuyDemandRow>(offer: SellPoolRow, buyers: T[], staleDays: number, now = new Date()) {
  const cand = sellOfferToCandidate(offer);
  if (!cand) return [];
  return rank(buyers, (b) => evaluateMatch(toBuyCriteria(b, staleDays, now), cand));
}
