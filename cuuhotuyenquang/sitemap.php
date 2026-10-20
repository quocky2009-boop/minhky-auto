<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';

header('Content-Type: application/xml; charset=utf-8');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
$add = static function (string $loc, ?string $lastmod = null): void {
    echo '<url><loc>' . e($loc) . '</loc>' . ($lastmod ? '<lastmod>' . date('Y-m-d', strtotime($lastmod)) . '</lastmod>' : '') . "</url>\n";
};
$add(site_url());
$add(site_url('tin-tuc'));
$add(site_url('nhat-ky-cuu-ho'));
foreach (q_all("SELECT type, slug, updated_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 5000") as $p) {
    $add(site_url(($p['type'] === 'journal' ? 'nhat-ky-cuu-ho/' : 'tin-tuc/') . $p['slug']), $p['updated_at']);
}
echo '</urlset>';
