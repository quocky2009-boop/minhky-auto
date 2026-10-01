export const BUY_STATUSES = ["new", "verified", "searching", "viewing", "negotiating", "won"] as const;
export const SELL_STATUSES = ["new", "info_collected", "inspection_scheduled", "appraised", "negotiating", "acquired"] as const;

export const STATUS_LABEL: Record<"buy" | "sell", Record<string, string>> = {
  buy: {
    new: "Mới", verified: "Đã xác minh", searching: "Đang tìm / đã giới thiệu xe", viewing: "Hẹn xem / lái thử",
    negotiating: "Thương lượng", won: "Đã cọc / đã mua", paused: "Tạm dừng", closed: "Đã đóng",
  },
  sell: {
    new: "Mới", info_collected: "Đã lấy thông tin", inspection_scheduled: "Hẹn thẩm định", appraised: "Đã thẩm định / báo giá",
    negotiating: "Thương lượng", acquired: "Đã mua vào / nhận ký gửi", paused: "Tạm dừng", closed: "Đã đóng",
  },
};
export const statusLabel = (kind: string, status: string) => STATUS_LABEL[kind === "sell" ? "sell" : "buy"][status] ?? status;

/** Các bước được phép chuyển tới (khớp private.demand_transition_allowed). */
export function nextStatuses(kind: "buy" | "sell", from: string, manager: boolean): string[] {
  const flow: readonly string[] = kind === "buy" ? BUY_STATUSES : SELL_STATUSES;
  const terminal = kind === "buy" ? "won" : "acquired";
  if (from === "closed" || from === terminal) return manager ? ["new"] : [];
  const out = new Set<string>();
  for (const s of flow) {
    if (s === from || s === "new") continue;
    if (s === terminal) {
      if (["viewing", "negotiating", "appraised"].includes(from)) out.add(s);
      continue;
    }
    out.add(s);
  }
  if (from === "paused") out.add("new");
  if (from !== "paused") out.add("paused");
  out.add("closed");
  out.delete(from);
  return [...out];
}
export const NEEDS_NEXT_ACTION = (status: string) => !["new", "paused", "closed", "won", "acquired"].includes(status);

export const KIND_LABEL: Record<string, string> = { buy: "Cần mua", sell: "Cần bán" };
export const PRIORITY_LABEL: Record<string, string> = { high: "Ưu tiên cao", normal: "Bình thường", low: "Thấp" };
export const FUEL_LABEL: Record<string, string> = { gasoline: "Xăng", diesel: "Dầu", hybrid: "Hybrid", phev: "Hybrid sạc ngoài", ev: "Điện", other: "Khác" };
export const CONDITION_LABEL: Record<string, string> = { new: "Xe mới", used: "Đã qua sử dụng", any: "Mới hoặc cũ" };
export const SALE_MODE_LABEL: Record<string, string> = { outright: "Bán thẳng", consignment: "Ký gửi", trade_in: "Đổi xe", undecided: "Chưa chốt" };
export const CHANNEL_LABEL: Record<string, string> = { call: "Gọi điện", zalo: "Zalo", meeting: "Gặp trực tiếp", sms: "Tin nhắn", other: "Khác", system: "Hệ thống" };
export const CRITERIA_LABEL: Record<string, string> = {
  model: "Hãng / model", year: "Đời xe", budget: "Ngân sách", color: "Màu", odo: "ODO", fuel: "Nhiên liệu", seats: "Số chỗ", condition: "Mới / cũ",
};
export const VEHICLE_SALE_STATUS: Record<string, string> = {
  not_listed: "Chưa chào bán", available: "Đang bán", held: "Đang giữ", deposited: "Đã cọc", sold: "Đã bán", delivered: "Đã bàn giao", returned_to_owner: "Đã trả chủ xe",
};
export const BUSINESS_TYPE_LABEL: Record<string, string> = { owned: "Showroom sở hữu", consignment: "Ký gửi" };
export const PREP_LABEL: Record<string, string> = { pending: "Chưa chuẩn bị", in_progress: "Đang chuẩn bị", ready: "Sẵn sàng" };
export const triLabel = (v: boolean | null | undefined, yes = "Có", no = "Không") => (v === true ? yes : v === false ? no : "Chưa rõ");
export const SOURCE_TYPE_LABEL: Record<string, string> = {
  manufacturer: "Hãng", distributor: "Nhà phân phối", individual: "Cá nhân", other_dealer: "Đại lý khác", trade_in: "Thu cũ đổi mới",
};
export const PAPERWORK_LABEL: Record<string, string> = { incomplete: "Chưa đủ hồ sơ", complete: "Đủ hồ sơ" };
