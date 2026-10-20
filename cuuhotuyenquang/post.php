<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';

$type = ($_GET['type'] ?? 'news') === 'journal' ? 'journal' : 'news';
$slug = (string) ($_GET['slug'] ?? '');
$base = $type === 'journal' ? 'nhat-ky-cuu-ho' : 'tin-tuc';

$post = preg_match('/^[a-z0-9-]{1,160}$/', $slug)
    ? q_one(
        "SELECT p.*, u.full_name AS author FROM posts p LEFT JOIN users u ON u.id = p.author_id
          WHERE p.slug = ? AND p.type = ? AND p.status = 'published'",
        [$slug, $type]
    )
    : null;

if (!$post) {
    http_response_code(404);
    $meta = ['title' => 'Không tìm thấy bài viết – ' . setting('brand_name'), 'desc' => ''];
    require __DIR__ . '/includes/site_header.php';
    echo '<section class="sec"><div class="wrap narrow"><h1>Không tìm thấy bài viết</h1><p><a href="' . e(url($base)) . '">← Quay lại danh sách</a></p></div></section>';
    require __DIR__ . '/includes/site_footer.php';
    exit;
}

$desc = $post['excerpt'] !== '' ? $post['excerpt'] : plain_excerpt($post['content']);
$meta = [
    'title' => $post['title'] . ' – ' . setting('brand_name'),
    'desc' => $desc,
    'canonical' => site_url($base . '/' . $post['slug']),
    'image' => $post['cover'],
    'og_type' => 'article',
    'jsonld' => [
        '@context' => 'https://schema.org',
        '@type' => 'Article',
        'headline' => $post['title'],
        'datePublished' => date('c', strtotime((string) $post['published_at'])),
        'dateModified' => date('c', strtotime((string) $post['updated_at'])),
        'author' => ['@type' => 'Organization', 'name' => setting('brand_name')],
        'mainEntityOfPage' => site_url($base . '/' . $post['slug']),
    ],
];

$related = q_all(
    "SELECT title, slug, excerpt, cover, rescue_location, published_at FROM posts
      WHERE type = ? AND status = 'published' AND id <> ? ORDER BY published_at DESC LIMIT 3",
    [$type, (int) $post['id']]
);
$hotline = setting('hotline');

require __DIR__ . '/includes/site_header.php';
?>
<article class="sec">
  <div class="wrap narrow article">
    <p class="crumb"><a href="<?= e(url($base)) ?>">← <?= $type === 'journal' ? 'Nhật ký cứu hộ' : 'Tin tức' ?></a></p>
    <h1><?= e($post['title']) ?></h1>
    <p class="meta">Đăng ngày <?= e(fmt_date($post['published_at'])) ?></p>

    <?php if ($type === 'journal' && ($post['rescue_location'] || $post['rescue_vehicle'] || $post['rescue_service'] || $post['rescue_date'])): ?>
      <dl class="facts">
        <?php if ($post['rescue_date']): ?><div><dt>Ngày cứu hộ</dt><dd><?= e(fmt_date($post['rescue_date'])) ?></dd></div><?php endif; ?>
        <?php if ($post['rescue_location']): ?><div><dt>Địa điểm</dt><dd><?= e($post['rescue_location']) ?></dd></div><?php endif; ?>
        <?php if ($post['rescue_vehicle']): ?><div><dt>Loại xe</dt><dd><?= e($post['rescue_vehicle']) ?></dd></div><?php endif; ?>
        <?php if ($post['rescue_service']): ?><div><dt>Dịch vụ</dt><dd><?= e($post['rescue_service']) ?></dd></div><?php endif; ?>
      </dl>
    <?php endif; ?>

    <?php if ($post['cover'] !== ''): ?><img class="cover" src="<?= e($post['cover']) ?>" alt="<?= e($post['title']) ?>"><?php endif; ?>
    <div class="content"><?= format_content($post['content']) ?></div>

    <div class="callout">
      <strong>Xe bạn đang gặp sự cố?</strong>
      <a class="btn btn-call btn-lg" href="<?= e(phone_href($hotline)) ?>" data-call>📞 Gọi cứu hộ <?= e($hotline) ?></a>
    </div>
  </div>
</article>
<?php if ($related): ?>
<section class="sec alt">
  <div class="wrap">
    <h2>Bài viết khác</h2>
    <div class="cards">
      <?php foreach ($related as $p): $p['type'] = $type; include __DIR__ . '/includes/post_card.php'; endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>
<?php require __DIR__ . '/includes/site_footer.php'; ?>
