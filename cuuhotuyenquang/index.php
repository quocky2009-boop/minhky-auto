<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';

$hotline = setting('hotline');
$zaloNum = trim(setting('zalo')) !== '' ? setting('zalo') : $hotline;

$journals = q_all(
    "SELECT title, slug, excerpt, cover, rescue_location, rescue_service, rescue_date, published_at
       FROM posts WHERE type = 'journal' AND status = 'published'
      ORDER BY published_at DESC LIMIT 3"
);
$news = q_all(
    "SELECT title, slug, excerpt, cover, published_at
       FROM posts WHERE type = 'news' AND status = 'published'
      ORDER BY published_at DESC LIMIT 3"
);

$meta = [
    'title' => setting('seo_title'),
    'desc' => setting('seo_desc'),
    'canonical' => site_url(),
    'image' => trim(setting('hero_image')),
    'jsonld' => [
        '@context' => 'https://schema.org',
        '@type' => 'AutoRepair',
        'name' => setting('brand_name'),
        'url' => site_url(),
        'telephone' => preg_replace('/\s+/', '', $hotline),
        'address' => ['@type' => 'PostalAddress', 'streetAddress' => setting('address'), 'addressRegion' => 'Tuyên Quang', 'addressCountry' => 'VN'],
        'areaServed' => ['@type' => 'AdministrativeArea', 'name' => 'Tỉnh Tuyên Quang'],
        'openingHours' => 'Mo-Su 00:00-23:59',
    ],
];

$sent = $_GET['gui'] ?? '';
$heroImg = trim(setting('hero_image'));

require __DIR__ . '/includes/site_header.php';
?>
<section class="hero"<?= $heroImg !== '' && is_safe_url($heroImg) ? ' style="--hero-img:url(\'' . e($heroImg) . '\')"' : '' ?>>
  <div class="wrap hero-grid">
    <div>
      <p class="eyebrow">🚨 Cứu hộ ô tô tỉnh Tuyên Quang</p>
      <h1><?= e(setting('hero_title')) ?></h1>
      <p class="lead"><?= e(setting('hero_sub')) ?></p>
      <div class="cta">
        <a class="btn btn-call btn-xl pulse" href="<?= e(phone_href($hotline)) ?>" data-call>📞 Gọi ngay <?= e($hotline) ?></a>
        <a class="btn btn-zalo btn-xl" href="<?= e(zalo_href($zaloNum)) ?>" target="_blank" rel="noopener">💬 Nhắn Zalo gửi vị trí</a>
      </div>
      <p class="hint"><?= e(setting('hours')) ?> · Bấm gọi là kết nối trực tiếp tới điều phối viên.</p>
    </div>
    <ul class="trust">
      <?php foreach (text_lines(setting('trust')) as $line): [$t, $d] = split_pair($line); ?>
        <li><strong><?= e($t) ?></strong><span><?= e($d) ?></span></li>
      <?php endforeach; ?>
    </ul>
  </div>
</section>

<section class="sec" id="dich-vu">
  <div class="wrap">
    <h2><?= e(setting('services_title')) ?></h2>
    <div class="cards">
      <?php foreach (text_lines(setting('services')) as $i => $line): [$t, $d] = split_pair($line); ?>
        <article class="card">
          <span class="num"><?= $i + 1 ?></span>
          <h3><?= e($t) ?></h3>
          <p><?= e($d) ?></p>
        </article>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="band">
  <div class="wrap band-in">
    <p><strong>Xe đang gặp sự cố?</strong> Đừng chờ đợi — gọi ngay để được hướng dẫn và điều xe hỗ trợ.</p>
    <a class="btn btn-light btn-lg" href="<?= e(phone_href($hotline)) ?>" data-call>📞 <?= e($hotline) ?></a>
  </div>
</section>

<section class="sec" id="quy-trinh">
  <div class="wrap">
    <h2>Quy trình cứu hộ</h2>
    <ol class="steps">
      <?php foreach (text_lines(setting('steps')) as $i => $line): [$t, $d] = split_pair($line); ?>
        <li><span class="num"><?= $i + 1 ?></span><h3><?= e($t) ?></h3><p><?= e($d) ?></p></li>
      <?php endforeach; ?>
    </ol>
  </div>
</section>

<section class="sec alt" id="khu-vuc">
  <div class="wrap two">
    <div>
      <h2><?= e(setting('areas_title')) ?></h2>
      <p><?= e(setting('areas_intro')) ?></p>
      <a class="btn btn-call" href="<?= e(phone_href($hotline)) ?>" data-call>📞 Gọi xác nhận khu vực</a>
    </div>
    <ul class="chips">
      <?php foreach (text_lines(setting('areas')) as $a): ?><li><?= e($a) ?></li><?php endforeach; ?>
    </ul>
  </div>
</section>

<?php if ($journals): ?>
<section class="sec" id="nhat-ky">
  <div class="wrap">
    <div class="sec-head"><h2>Nhật ký cứu hộ gần đây</h2><a href="<?= e(url('nhat-ky-cuu-ho')) ?>">Xem tất cả →</a></div>
    <div class="cards">
      <?php foreach ($journals as $p): $p['type'] = 'journal'; include __DIR__ . '/includes/post_card.php'; endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<?php if ($news): ?>
<section class="sec alt" id="tin-tuc">
  <div class="wrap">
    <div class="sec-head"><h2>Tin tức &amp; kinh nghiệm</h2><a href="<?= e(url('tin-tuc')) ?>">Xem tất cả →</a></div>
    <div class="cards">
      <?php foreach ($news as $p): $p['type'] = 'news'; include __DIR__ . '/includes/post_card.php'; endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<section class="sec" id="hoi-dap">
  <div class="wrap narrow">
    <h2>Câu hỏi thường gặp</h2>
    <?php foreach (text_lines(setting('faq')) as $line): [$qn, $an] = split_pair($line); ?>
      <details class="faq"><summary><?= e($qn) ?></summary><p><?= e($an) ?></p></details>
    <?php endforeach; ?>
  </div>
</section>

<section class="sec alt" id="goi-lai">
  <div class="wrap narrow">
    <h2>Để lại số — chúng tôi gọi lại ngay</h2>
    <p>Không tiện gọi? Để lại số điện thoại, điều phối viên sẽ liên hệ lại. Với sự cố khẩn cấp, hãy gọi trực tiếp <a href="<?= e(phone_href($hotline)) ?>" data-call><strong><?= e($hotline) ?></strong></a>.</p>
    <?php if ($sent === 'ok'): ?>
      <div class="notice ok" role="status">Đã nhận thông tin. Chúng tôi sẽ gọi lại sớm nhất có thể.</div>
    <?php elseif ($sent === 'loi'): ?>
      <div class="notice err" role="alert">Chưa gửi được: vui lòng nhập số điện thoại hợp lệ hoặc thử lại sau ít phút. Nếu khẩn cấp hãy gọi trực tiếp hotline.</div>
    <?php endif; ?>
    <form class="form" method="post" action="<?= e(url('callback.php')) ?>">
      <input type="hidden" name="t" value="<?= e(signed_token()) ?>">
      <input type="text" name="website" value="" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label>Họ tên (không bắt buộc)<input type="text" name="name" maxlength="120" autocomplete="name"></label>
      <label>Số điện thoại *<input type="tel" name="phone" required inputmode="tel" maxlength="20" autocomplete="tel" placeholder="09xx xxx xxx"></label>
      <label>Tình trạng xe / vị trí (không bắt buộc)<textarea name="note" rows="3" maxlength="500"></textarea></label>
      <button class="btn btn-call btn-lg" type="submit">Gọi lại cho tôi</button>
    </form>
  </div>
</section>
<?php require __DIR__ . '/includes/site_footer.php'; ?>
