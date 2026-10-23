// Đóng gói docs/huong-dan-sales/huong-dan-sales.html thành module TS để app phục vụ sau đăng nhập.
// Chạy: node scripts/build-guide.mjs   (sửa HTML nguồn xong phải chạy lại; test kiểm tra hai bên khớp)
import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync(new URL("../docs/huong-dan-sales/huong-dan-sales.html", import.meta.url), "utf8");
const out = `// TỰ SINH từ docs/huong-dan-sales/huong-dan-sales.html bằng scripts/build-guide.mjs — không sửa tay.\nexport const SALES_GUIDE_HTML = ${JSON.stringify(html)};\n`;
writeFileSync(new URL("../src/content/sales-guide.ts", import.meta.url), out);
console.log("OK", html.length, "ký tự");
