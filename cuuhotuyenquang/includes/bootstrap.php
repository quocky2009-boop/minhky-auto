<?php
declare(strict_types=1);

define('SITE_ROOT', dirname(__DIR__));
date_default_timezone_set('Asia/Ho_Chi_Minh');
mb_internal_encoding('UTF-8');

$CONFIG = [];
$configFile = __DIR__ . '/config.php';
if (is_file($configFile)) {
    $CONFIG = require $configFile;
}

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/settings_def.php';

ini_set('display_errors', cfg('debug', false) ? '1' : '0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');

if (!$CONFIG && !defined('ALLOW_NO_CONFIG')) {
    redirect(url('install.php'));
}
