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
  href: string;
  roles: AppRole[];
  /** Gợi ý ngắn hiện khi rê chuột: chức năng nằm trong trang này nhưng không có mục menu riêng. */
  hint?: string;
};

export const MODULES: ModuleDef[] = [
  { key: "overview", label: "Tổng quan", group: "Điều hành", href: "/tong-quan", roles: ALL },
  { key: "today", label: "Việc hôm nay", group: "Khách & nhu cầu", href: "/viec-hom-nay", roles: SELLERS },
  { key: "demands", label: "Nhu cầu mua/bán", group: "Khách & nhu cầu", href: "/nhu-cau", roles: SELLERS },
  { key: "customers", label: "Khách hàng", group: "Khách & nhu cầu", href: "/khach-hang", roles: SELLERS },
  { key: "inventory", label: "Kho xe", group: "Xe", href: "/kho-xe", roles: ALL, hint: "Kho xe, mua & thẩm định, ký gửi, chi phí chuẩn bị xe, vốn góp và vay đều nằm trong từng xe" },
  { key: "sales", label: "Đơn bán", group: "Giao dịch", href: "/don-ban", roles: [...SELLERS, "accountant"], hint: "Báo giá, đơn bán và thu cũ đổi mới nằm trong từng đơn" },
  { key: "docs", label: "Hồ sơ & bàn giao", group: "Giao dịch", href: "/ban-giao", roles: ["admin", "manager", "sales", "accountant"] },
  { key: "cashbook", label: "Thu chi & công nợ", group: "Tài chính", href: "/thu-chi", roles: ["admin", "manager", "accountant"] },
  { key: "aftersales", label: "Hậu mãi", group: "Giao dịch", href: "/hau-mai", roles: ALL },
  { key: "commission", label: "Hoa hồng", group: "Giao dịch", href: "/hoa-hong", roles: ["admin", "manager", "accountant", "sales"] },
  { key: "settlement", label: "Quyết toán", group: "Tài chính", href: "/quyet-toan", roles: ["admin", "manager", "accountant"] },
  { key: "reports", label: "Báo cáo", group: "Tài chính", href: "/bao-cao", roles: ["admin", "manager", "accountant"] },
  { key: "guide", label: "Hướng dẫn sử dụng", group: "Trợ giúp", href: "/huong-dan", roles: SELLERS },
  { key: "users", label: "Người dùng & vai trò", group: "Cài đặt", href: "/cai-dat/nguoi-dung", roles: ["admin"] },
];

export function canUse(roles: AppRole[], key: string): boolean {
  const m = MODULES.find((x) => x.key === key);
  return !!m && m.roles.some((r) => roles.includes(r));
}
export const isManager = (roles: AppRole[]) => roles.includes("admin") || roles.includes("manager");

/** Vai trò được xem giá mua / giá sàn / lợi nhuận. Chỉ để ẩn/hiện giao diện; database vẫn là nơi chặn thật. */
export const canSeeFinance = (roles: AppRole[]) => roles.some((r) => r === "admin" || r === "manager" || r === "accountant");
