<?php
$hotline = setting('hotline');
$zaloNum = trim(setting('zalo')) !== '' ? setting('zalo') : $hotline;
$hotline2 = trim(setting('hotline2'));
$mapUrl = trim(setting('map_url'));
$fb = trim(setting('facebook'));
?>
</main>
<footer class="site-footer">
  <div class="wrap grid-3">
    <div>
      <h3><?= e(setting('brand_name')) ?></h3>
      <p><?= e(setting('address')) ?></p>
      <p><?= e(setting('hours')) ?></p>
    </div>
    <div>
      <h3>Liên hệ nhanh</h3>
      <p><a href="<?= e(phone_href($hotline)) ?>" data-call>📞 <?= e($hotline) ?></a></p>
      <?php if ($hotline2 !== ''): ?><p><a href="<?= e(phone_href($hotline2)) ?>" data-call>📞 <?= e($hotline2) ?></a></p><?php endif; ?>
      <p><a href="<?= e(zalo_href($zaloNum)) ?>" target="_blank" rel="noopener">💬 Chat Zalo</a></p>
      <?php if (str_starts_with($mapUrl, 'https://')): ?><p><a href="<?= e($mapUrl) ?>" target="_blank" rel="noopener">📍 Chỉ đường Google Maps</a></p><?php endif; ?>
      <?php if (str_starts_with($fb, 'https://')): ?><p><a href="<?= e($fb) ?>" target="_blank" rel="noopener">Facebook</a></p><?php endif; ?>
    </div>
    <div>
      <h3>Chuyên mục</h3>
      <p><a href="<?= e(url('nhat-ky-cuu-ho')) ?>">Nhật ký cứu hộ</a></p>
      <p><a href="<?= e(url('tin-tuc')) ?>">Tin tức &amp; kinh nghiệm</a></p>
    </div>
  </div>
  <div class="wrap copy">© <?= date('Y') ?> <?= e(setting('brand_name')) ?>. Bảo lưu mọi quyền.</div>
</footer>

<!-- Thanh liên lạc cố định (điện thoại) -->
<nav class="quickbar" aria-label="Liên hệ nhanh">
  <a class="q-call" href="<?= e(phone_href($hotline)) ?>" data-call><span>📞</span>Gọi cứu hộ</a>
  <a class="q-zalo" href="<?= e(zalo_href($zaloNum)) ?>" target="_blank" rel="noopener"><span>💬</span>Zalo</a>
  <a class="q-back" href="<?= e(url('/#goi-lai')) ?>"><span>↩</span>Gọi lại cho tôi</a>
</nav>

<!-- Nút nổi (máy tính) -->
<div class="fab" aria-label="Liên hệ nhanh">
  <a class="fab-zalo" href="<?= e(zalo_href($zaloNum)) ?>" target="_blank" rel="noopener" title="Chat Zalo">Zalo</a>
  <a class="fab-call" href="<?= e(phone_href($hotline)) ?>" data-call title="Gọi hotline cứu hộ">📞<span><?= e($hotline) ?></span></a>
</div>
<script src="<?= e(url('assets/js/site.js')) ?>?v=1" defer></script>
</body>
</html>
