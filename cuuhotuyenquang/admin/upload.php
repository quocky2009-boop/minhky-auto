<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
$fail = static function (string $msg, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
};

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    $fail('Phương thức không hợp lệ.', 405);
}
if (!current_user()) {
    $fail('Chưa đăng nhập.', 401);
}
csrf_check();

$f = $_FILES['file'] ?? null;
if (!$f || $f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
    $fail('Tải lên thất bại (tệp quá lớn hoặc bị lỗi).');
}
if ($f['size'] > 5 * 1024 * 1024) {
    $fail('Ảnh tối đa 5MB.');
}

$mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
$ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime] ?? null;
if ($ext === null || @getimagesize($f['tmp_name']) === false) {
    $fail('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.');
}

$dir = SITE_ROOT . '/uploads/' . date('Y/m');
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    $fail('Không tạo được thư mục lưu ảnh.', 500);
}
$name = bin2hex(random_bytes(10)) . '.' . $ext;
if (!move_uploaded_file($f['tmp_name'], "$dir/$name")) {
    $fail('Không lưu được ảnh.', 500);
}
echo json_encode(['url' => url('uploads/' . date('Y/m') . '/' . $name)], JSON_UNESCAPED_SLASHES);
