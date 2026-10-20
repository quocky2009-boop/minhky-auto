<?php
// Router cho `php -S` khi phát triển cục bộ (thay cho .htaccess).
// Chạy:  php -S 127.0.0.1:8080 -t cuuhotuyenquang cuuhotuyenquang/tests/dev-router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$root = dirname(__DIR__);

if (preg_match('#^/(includes|tests)/#', $path)) {
    http_response_code(403);
    exit('Forbidden');
}
if ($path !== '/' && is_file($root . $path)) {
    return false; // phục vụ tệp tĩnh / php trực tiếp
}
$routes = [
    '#^/tin-tuc/?$#' => ['news.php', ['type' => 'news']],
    '#^/nhat-ky-cuu-ho/?$#' => ['news.php', ['type' => 'journal']],
    '#^/tin-tuc/([a-z0-9-]+)/?$#' => ['post.php', ['type' => 'news'], 'slug'],
    '#^/nhat-ky-cuu-ho/([a-z0-9-]+)/?$#' => ['post.php', ['type' => 'journal'], 'slug'],
    '#^/sitemap\.xml$#' => ['sitemap.php', []],
];
foreach ($routes as $re => $r) {
    if (preg_match($re, $path, $m)) {
        $_GET = array_merge($_GET, $r[1]);
        if (isset($r[2])) {
            $_GET[$r[2]] = $m[1];
        }
        require $root . '/' . $r[0];
        return true;
    }
}
if ($path === '/') {
    require $root . '/index.php';
    return true;
}
http_response_code(404);
echo 'Not found';
