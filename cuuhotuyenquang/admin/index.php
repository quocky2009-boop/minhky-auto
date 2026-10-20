<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/_layout.php';
$user = require_login();

$cnt = static fn(string $where, array $p = []): int => (int) q_val("SELECT COUNT(*) FROM posts WHERE $where", $p);
$stats = [
    ['Tin tức đã đăng', $cnt("type='news' AND status='published'")],
    ['Nhật ký đã đăng', $cnt("type='journal' AND status='published'")],
    ['Chờ duyệt', $cnt("status='pending'")],
    ['Bản nháp của tôi', $cnt("status='draft' AND author_id=?", [$user['id']])],
    ['Khách xin gọi lại (mới)', (int) q_val("SELECT COUNT(*) FROM callbacks WHERE status='new'")],
];
$recent = q_all("SELECT phone, name, note, created_at FROM callbacks WHERE status='new' ORDER BY id DESC LIMIT 5");
$pending = can_publish($user)
    ? q_all("SELECT p.id, p.title, p.type, u.full_name FROM posts p LEFT JOIN users u ON u.id=p.author_id WHERE p.status='pending' ORDER BY p.updated_at DESC LIMIT 5")
    : [];

admin_head('Tổng quan', $user);
if ($user['role'] === 'admin' && hotline_is_placeholder()): ?>
  <div class="notice err">⚠ Hotline trên website vẫn là số mẫu <strong><?= e(PLACEHOLDER_HOTLINE) ?></strong>. Vào <a href="settings.php">Nội dung landing page</a> để nhập số thật trước khi chạy chính thức.</div>
<?php endif; ?>
<div class="stats">
  <?php foreach ($stats as [$label, $n]): ?><div class="stat"><b><?= $n ?></b><span><?= e($label) ?></span></div><?php endforeach; ?>
</div>
<div class="actions">
  <a class="btn-primary" href="post-edit.php?type=journal">+ Viết nhật ký cứu hộ</a>
  <a class="btn-sec" href="post-edit.php?type=news">+ Viết tin tức</a>
</div>

<?php if ($pending): ?>
<h2>Bài chờ duyệt</h2>
<table class="tbl"><tbody>
  <?php foreach ($pending as $p): ?>
    <tr><td><a href="post-edit.php?id=<?= (int) $p['id'] ?>"><?= e($p['title']) ?></a></td><td><?= $p['type'] === 'journal' ? 'Nhật ký' : 'Tin tức' ?></td><td><?= e($p['full_name'] ?? '') ?></td></tr>
  <?php endforeach; ?>
</tbody></table>
<?php endif; ?>

<h2>Khách xin gọi lại gần đây</h2>
<?php if (!$recent): ?><p class="muted">Chưa có yêu cầu mới.</p><?php else: ?>
<table class="tbl"><tbody>
  <?php foreach ($recent as $c): ?>
    <tr><td><a href="<?= e(phone_href($c['phone'])) ?>"><?= e($c['phone']) ?></a></td><td><?= e($c['name']) ?></td><td><?= e($c['note']) ?></td><td><?= e(fmt_date($c['created_at'], true)) ?></td></tr>
  <?php endforeach; ?>
</tbody></table>
<p><a href="callbacks.php">Xem tất cả →</a></p>
<?php endif;
admin_foot();
