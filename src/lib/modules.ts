/**
 * Một nguồn duy nhất cho menu và quyền vào trang (tránh lỗi menu hard-code tách rời phân quyền).
 * Đây chỉ là lớp hiển thị/điều hướng; quyền thật được thực thi ở database (RLS).
 */
export type AppRole = "admin" | "manager" | "accountant" | "sales" | "technician";
export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Chủ tịch / Quản trị",
  manager: "Quản lý showroom",
  accountant: "Kế toán",
  sales: "Sales",
  technician: "Thẩm định / chuẩn bị xe",
};

const ALL: AppRole[] = ["admin", "manager", "accountant", "sales", "technician"];
const SELLERS: AppRole[] = ["admin", "manager", "sales"];

export type ModuleDef = {
  key: string;
  label: string;
  group: string;
  href?: string;
  roles: AppRole[];
  /** ready: dùng được; planned: chưa triển khai (hiện mờ, không bấm được) */
  status: "ready" | "partial" | "planned";
  phase?: number;
};

export const MODULES: ModuleDef[] = [
  { key: "overview", label: "Tổng quan", group: "Điều hành", href: "/tong-quan", roles: ALL, status: "partial", phase: 6 },
  { key: "today", label: "Việc hôm nay", group: "Khách & nhu cầu", href: "/viec-hom-nay", roles: SELLERS, status: "ready" },
  { key: "demands", label: "Nhu cầu mua/bán", group: "Khách & nhu cầu", href: "/nhu-cau", roles: SELLERS, status: "ready" },
  { key: "customers", label: "Khách hàng", group: "Khách & nhu cầu", href: "/khach-hang", roles: SELLERS, status: "ready" },
  { key: "inventory", label: "Kho xe", group: "Xe", href: "/kho-xe", roles: ALL, status: "partial", phase: 3 },
  { key: "purchasing", label: "Mua & thẩm định", group: "Xe", roles: ["admin", "manager", "technician"], status: "planned", phase: 3 },
  { key: "consignment", label: "Ký gửi", group: "Xe", roles: ["admin", "manager", "accountant"], status: "planned", phase: 3 },
  { key: "prep", label: "Chuẩn bị xe & chi phí", group: "Xe", roles: ["admin", "manager", "technician", "accountant"], status: "planned", phase: 3 },
  { key: "sales", label: "Bán hàng", group: "Giao dịch", roles: SELLERS, status: "planned", phase: 5 },
  { key: "tradein", label: "Thu cũ đổi mới", group: "Giao dịch", roles: SELLERS, status: "planned", phase: 5 },
  { key: "docs", label: "Hồ sơ & bàn giao", group: "Giao dịch", roles: ["admin", "manager", "sales", "accountant"], status: "planned", phase: 5 },
  { key: "capital", label: "Vốn góp & vay", group: "Tài chính", roles: ["admin", "manager", "accountant"], status: "planned", phase: 4 },
  { key: "cashbook", label: "Thu chi & công nợ", group: "Tài chính", roles: ["admin", "manager", "accountant"], status: "planned", phase: 5 },
  { key: "reports", label: "Báo cáo", group: "Tài chính", roles: ["admin", "manager", "accountant"], status: "planned", phase: 6 },
  { key: "users", label: "Người dùng & vai trò", group: "Cài đặt", href: "/cai-dat/nguoi-dung", roles: ["admin"], status: "ready" },
];

export function canUse(roles: AppRole[], key: string): boolean {
  const m = MODULES.find((x) => x.key === key);
  return !!m && m.roles.some((r) => roles.includes(r));
}
export const isManager = (roles: AppRole[]) => roles.includes("admin") || roles.includes("manager");

/** Vai trò được xem giá mua / giá sàn / lợi nhuận. Chỉ để ẩn/hiện giao diện; database vẫn là nơi chặn thật. */
export const canSeeFinance = (roles: AppRole[]) => roles.some((r) => r === "admin" || r === "manager" || r === "accountant");
