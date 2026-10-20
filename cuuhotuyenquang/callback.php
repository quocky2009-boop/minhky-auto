<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    redirect(url('/'));
}

$back = static fn(string $s) => redirect(url('?gui=' . $s . '#goi-lai'));

// Bẫy bot: ô ẩn phải để trống; token ký phải hợp lệ (form mở 3 giây – 2 giờ).
if (trim((string) ($_POST['website'] ?? '')) !== '' || !signed_token_valid((string) ($_POST['t'] ?? ''))) {
    $back('loi');
}

$phone = normalize_phone((string) ($_POST['phone'] ?? ''));
if ($phone === null) {
    $back('loi');
}

// Giới hạn 5 yêu cầu/giờ/IP
$since = date('Y-m-d H:i:s', time() - 3600);
if ((int) q_val('SELECT COUNT(*) FROM callbacks WHERE ip = ? AND created_at > ?', [client_ip(), $since]) >= 5) {
    $back('loi');
}

q(
    'INSERT INTO callbacks (name, phone, note, status, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
        mb_substr(trim((string) ($_POST['name'] ?? '')), 0, 120),
        $phone,
        mb_substr(trim((string) ($_POST['note'] ?? '')), 0, 500),
        'new',
        client_ip(),
        date('Y-m-d H:i:s'),
    ]
);
$back('ok');
