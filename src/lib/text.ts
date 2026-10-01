/** Bỏ dấu tiếng Việt, gộp khoảng trắng, chữ thường — dùng so khớp màu/tên. */
export function normText(input: string | null | undefined): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
