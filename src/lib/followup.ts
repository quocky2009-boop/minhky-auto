import { todayRangeVN } from "./dates";

export type FollowupState = "overdue" | "today" | "stale" | "ok" | "none";
const INACTIVE = ["closed", "won", "acquired", "paused"];

export function followupState(
  d: { status: string; next_action_due: string | null; last_activity_at: string | null },
  staleDays: number,
  now = new Date(),
): FollowupState {
  if (INACTIVE.includes(d.status)) return "none";
  const { start, end } = todayRangeVN(now);
  if (d.next_action_due && d.next_action_due < start) return "overdue";
  if (d.next_action_due && d.next_action_due < end) return "today";
  if (d.last_activity_at && new Date(d.last_activity_at).getTime() < now.getTime() - staleDays * 86400000) return "stale";
  return d.next_action_due ? "ok" : "none";
}

export const FOLLOWUP_LABEL: Record<FollowupState, string> = {
  overdue: "Quá hạn",
  today: "Đến hạn hôm nay",
  stale: "Lâu chưa cập nhật — cần xác minh lại",
  ok: "Đúng hạn",
  none: "Chưa có lịch",
};
