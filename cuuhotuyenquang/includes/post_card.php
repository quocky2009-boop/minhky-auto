<?php
/** @var array $p  Bài viết (có 'type') */
$href = url(($p['type'] === 'journal' ? 'nhat-ky-cuu-ho/' : 'tin-tuc/') . $p['slug']);
?>
<article class="card post">
  <?php if (!empty($p['cover'])): ?>
    <a href="<?= e($href) ?>" class="thumb"><img src="<?= e($p['cover']) ?>" alt="<?= e($p['title']) ?>" loading="lazy"></a>
  <?php endif; ?>
  <div class="post-body">
    <p class="meta">
      <?= e(fmt_date($p['published_at'] ?? null)) ?>
      <?php if (!empty($p['rescue_location'])): ?> · 📍 <?= e($p['rescue_location']) ?><?php endif; ?>
    </p>
    <h3><a href="<?= e($href) ?>"><?= e($p['title']) ?></a></h3>
    <p><?= e($p['excerpt']) ?></p>
  </div>
</article>
