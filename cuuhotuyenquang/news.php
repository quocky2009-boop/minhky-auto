<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';

$type = ($_GET['type'] ?? 'news') === 'journal' ? 'journal' : 'news';
$title = $type === 'journal' ? 'Nhật ký cứu hộ' : 'Tin tức & kinh nghiệm';
$intro = $type === 'journal'
    ? 'Những ca cứu hộ thực tế của ' . setting('brand_name') . ' tại Tuyên Quang.'
    : 'Tin tức, kinh nghiệm xử lý sự cố và chăm sóc xe từ ' . setting('brand_name') . '.';
$base = $type === 'journal' ? 'nhat-ky-cuu-ho' : 'tin-tuc';

$perPage = 9;
$page = max(1, (int) ($_GET['trang'] ?? 1));
$total = (int) q_val("SELECT COUNT(*) FROM posts WHERE type = ? AND status = 'published'", [$type]);
$pages = max(1, (int) ceil($total / $perPage));
$page = min($page, $pages);
$offset = ($page - 1) * $perPage;
$rows = q_all(
    "SELECT title, slug, excerpt, cover, rescue_location, published_at FROM posts
      WHERE type = ? AND status = 'published'
      ORDER BY published_at DESC, id DESC LIMIT $perPage OFFSET $offset",
    [$type]
);

$meta = [
    'title' => $title . ' – ' . setting('brand_name'),
    'desc' => $intro,
    'canonical' => site_url($base . ($page > 1 ? '?trang=' . $page : '')),
];
require __DIR__ . '/includes/site_header.php';
?>
<section class="sec">
  <div class="wrap">
    <h1 class="page-title"><?= e($title) ?></h1>
    <p><?= e($intro) ?></p>
    <?php if (!$rows): ?>
      <p class="empty">Chưa có bài viết nào được đăng.</p>
    <?php else: ?>
      <div class="cards">
        <?php foreach ($rows as $p): $p['type'] = $type; include __DIR__ . '/includes/post_card.php'; endforeach; ?>
      </div>
      <?php if ($pages > 1): ?>
        <nav class="pager" aria-label="Phân trang">
          <?php for ($i = 1; $i <= $pages; $i++): ?>
            <a href="<?= e(url($base) . ($i > 1 ? '?trang=' . $i : '')) ?>"<?= $i === $page ? ' class="cur" aria-current="page"' : '' ?>><?= $i ?></a>
          <?php endfor; ?>
        </nav>
      <?php endif; ?>
    <?php endif; ?>
  </div>
</section>
<?php require __DIR__ . '/includes/site_footer.php'; ?>
