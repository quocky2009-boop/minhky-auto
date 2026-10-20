<?php
declare(strict_types=1);
// Test các hàm thuần: php cuuhotuyenquang/tests/run.php
require __DIR__ . '/../includes/helpers.php';

$fail = 0;
$eq = static function (mixed $got, mixed $want, string $name) use (&$fail): void {
    if ($got !== $want) {
        $fail++;
        echo "FAIL $name\n  got:  " . var_export($got, true) . "\n  want: " . var_export($want, true) . "\n";
    } else {
        echo "ok   $name\n";
    }
};

$eq(slugify('Cứu hộ xe Đường QL2 – Tuyên Quang!'), 'cuu-ho-xe-duong-ql2-tuyen-quang', 'slugify tiếng Việt');
$eq(slugify('???'), 'bai-viet', 'slugify rỗng');
$eq(phone_href('0912 345 678'), 'tel:+84912345678', 'tel 0xxx');
$eq(phone_href('+84 912 345 678'), 'tel:+84912345678', 'tel +84');
$eq(normalize_phone('0912.345.678'), '0912345678', 'normalize_phone');
$eq(normalize_phone('+84912345678'), '0912345678', 'normalize +84');
$eq(normalize_phone('12345'), null, 'normalize sai');
$eq(split_pair('A | B | C'), ['A', 'B | C'], 'split_pair');

$xss = format_content("<script>alert(1)</script>\n[x](javascript:alert(1))\n![i](javascript:alert(1))");
$eq(str_contains($xss, '<script>'), false, 'format_content escape script');
$eq(str_contains($xss, 'href="javascript'), false, 'format_content chặn link javascript');
$eq(str_contains($xss, '<img'), false, 'format_content chặn ảnh javascript');
$eq(format_content("## Tiêu đề\n\nĐoạn **đậm**\n- a\n- b"), '<h2>Tiêu đề</h2><p>Đoạn <strong>đậm</strong></p><ul><li>a</li><li>b</li></ul>', 'format_content cơ bản');
$eq(str_contains(format_content('![ảnh](/uploads/a.jpg)'), '<img src="/uploads/a.jpg"'), true, 'format_content ảnh nội bộ');
$eq(str_contains(format_content('[l](//evil.com)'), '<a '), false, 'chặn protocol-relative');

$GLOBALS['CONFIG'] = ['secret' => 'x'];
$eq(signed_token_valid(signed_token()), false, 'token quá mới bị từ chối');
$old = (time() - 10) . '';
$eq(signed_token_valid($old . '.' . hash_hmac('sha256', $old, 'x')), true, 'token hợp lệ');
$eq(signed_token_valid($old . '.deadbeef'), false, 'token sai chữ ký');

exit($fail ? 1 : 0);
