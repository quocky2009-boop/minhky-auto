<?php
declare(strict_types=1);

function admin_head(string $title, array $user): void
{
    $self = basename($_SERVER['SCRIPT_NAME']);
    $items = [
        'index.php' => ['Tổng quan', ['admin', 'marketing', 'staff']],
        'posts.php' => ['Bài viết & nhật ký', ['admin', 'marketing', 'staff']],
        'callbacks.php' => ['Khách xin gọi lại', ['admin', 'marketing', 'staff']],
        'settings.php' => ['Nội dung landing page', ['admin']],
        'users.php' => ['Tài khoản', ['admin']],
        'profile.php' => ['Tài khoản của tôi', ['admin', 'marketing', 'staff']],
    ];
    $f = flash();
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    ?><!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title><?= e($title) ?> – Dashboard</title>
<link rel="stylesheet" href="<?= e(url('assets/css/admin.css')) ?>?v=1">
</head><body class="adm">
<header class="adm-top">
  <button class="menu-btn" type="button" aria-label="Mở menu" onclick="document.body.classList.toggle('menu-open')">☰</button>
  <strong>Dashboard cứu hộ</strong>
  <span class="who"><?= e($user['full_name']) ?> · <?= e(ROLES[$user['role']] ?? $user['role']) ?></span>
</header>
<div class="adm-body">
<aside class="adm-side">
  <nav>
    <?php foreach ($items as $file => [$label, $roles]): if (!in_array($user['role'], $roles, true)) { continue; } ?>
      <a href="<?= e(url('admin/' . $file)) ?>"<?= $self === $file ? ' class="on"' : '' ?>><?= e($label) ?></a>
    <?php endforeach; ?>
    <a href="<?= e(url('/')) ?>" target="_blank" rel="noopener">Xem website ↗</a>
    <a href="<?= e(url('admin/logout.php')) ?>">Đăng xuất</a>
  </nav>
</aside>
<main class="adm-main">
  <h1><?= e($title) ?></h1>
  <?php if ($f): ?><div class="notice <?= e($f[0]) ?>" role="status"><?= e($f[1]) ?></div><?php endif; ?>
<?php
}

function admin_foot(): void
{
    ?>
</main></div>
<script src="<?= e(url('assets/js/admin.js')) ?>?v=1"></script>
</body></html>
<?php
}
