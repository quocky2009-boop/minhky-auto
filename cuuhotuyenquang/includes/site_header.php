<?php
/** @var array $meta  title, desc, canonical, image, jsonld(optional), og_type */
$hotline = setting('hotline');
$zaloNum = trim(setting('zalo')) !== '' ? setting('zalo') : $hotline;
$brand = setting('brand_name');
$gaId = trim(setting('ga_id'));
$canonical = $meta['canonical'] ?? site_url();
$ogImage = $meta['image'] ?? '';
if ($ogImage !== '' && str_starts_with($ogImage, '/')) {
    $ogImage = site_url($ogImage);
}
?><!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($meta['title']) ?></title>
<meta name="description" content="<?= e($meta['desc']) ?>">
<link rel="canonical" href="<?= e($canonical) ?>">
<meta name="theme-color" content="#b91c1c">
<meta property="og:type" content="<?= e($meta['og_type'] ?? 'website') ?>">
<meta property="og:locale" content="vi_VN">
<meta property="og:title" content="<?= e($meta['title']) ?>">
<meta property="og:description" content="<?= e($meta['desc']) ?>">
<meta property="og:url" content="<?= e($canonical) ?>">
<?php if ($ogImage !== ''): ?><meta property="og:image" content="<?= e($ogImage) ?>"><?php endif; ?>

<link rel="stylesheet" href="<?= e(url('assets/css/site.css')) ?>?v=1">
<?php if (!empty($meta['jsonld'])): ?>
<script type="application/ld+json"><?= json_encode($meta['jsonld'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?></script>
<?php endif; ?>
<?php if (preg_match('/^G-[A-Z0-9]+$/', $gaId)): ?>
<script async src="https://www.googletagmanager.com/gtag/js?id=<?= e($gaId) ?>"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','<?= e($gaId) ?>');</script>
<?php endif; ?>
</head>
<body>
<div class="topbar">
  <div class="wrap">
    <span><?= e(setting('hours')) ?></span>
    <a href="<?= e(phone_href($hotline)) ?>" data-call>Hotline: <strong><?= e($hotline) ?></strong></a>
  </div>
</div>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="<?= e(url('/')) ?>" aria-label="<?= e($brand) ?>">
      <span class="brand-mark" aria-hidden="true">SOS</span>
      <span class="brand-text"><?= e($brand) ?></span>
    </a>
    <nav class="nav" aria-label="Điều hướng chính">
      <a href="<?= e(url('/#dich-vu')) ?>">Dịch vụ</a>
      <a href="<?= e(url('/#quy-trinh')) ?>">Quy trình</a>
      <a href="<?= e(url('/#khu-vuc')) ?>">Khu vực</a>
      <a href="<?= e(url('nhat-ky-cuu-ho')) ?>">Nhật ký cứu hộ</a>
      <a href="<?= e(url('tin-tuc')) ?>">Tin tức</a>
    </nav>
    <a class="btn btn-call btn-sm" href="<?= e(phone_href($hotline)) ?>" data-call>📞 <?= e($hotline) ?></a>
  </div>
</header>
<main>
