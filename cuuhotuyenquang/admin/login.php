<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';

if (current_user()) {
    redirect(url('admin/index.php'));
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    if (login_blocked()) {
        $error = 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.';
    } elseif (login_attempt((string) ($_POST['username'] ?? ''), (string) ($_POST['password'] ?? ''))) {
        redirect(url('admin/index.php'));
    } else {
        $error = 'Sai tên đăng nhập hoặc mật khẩu, hoặc tài khoản đã bị khóa.';
    }
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
?><!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Đăng nhập Dashboard</title>
<link rel="stylesheet" href="<?= e(url('assets/css/admin.css')) ?>?v=1"></head>
<body>
<div class="login-box">
  <h1>Đăng nhập Dashboard</h1>
  <p class="muted"><?= e(setting('brand_name')) ?></p>
  <?php if ($error): ?><div class="notice err" role="alert"><?= e($error) ?></div><?php endif; ?>
  <form method="post" class="stack">
    <?= csrf_field() ?>
    <label>Tên đăng nhập<input name="username" required autofocus autocomplete="username"></label>
    <label>Mật khẩu<input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn-primary" type="submit">Đăng nhập</button>
  </form>
  <p class="muted"><a href="<?= e(url('/')) ?>">← Về trang chủ</a></p>
</div>
</body></html>
