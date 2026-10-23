<?php
declare(strict_types=1);

function e(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function cfg(string $key, mixed $default = null): mixed
{
    global $CONFIG;
    return $CONFIG[$key] ?? $default;
}

function url(string $path = ''): string
{
    return rtrim((string) cfg('base_path', ''), '/') . '/' . ltrim($path, '/');
}

function site_url(string $path = ''): string
{
    return rtrim((string) cfg('site_url', 'https://cuuhotuyenquang.com'), '/') . '/' . ltrim($path, '/');
}

function redirect(string $to): never
{
    header('Location: ' . $to);
    exit;
}

function slugify(string $s): string
{
    static $map = null;
    if ($map === null) {
        $map = [];
        $groups = [
            'a' => 'àáạảãâầấậẩẫăằắặẳẵ',
            'e' => 'èéẹẻẽêềếệểễ',
            'i' => 'ìíịỉĩ',
            'o' => 'òóọỏõôồốộổỗơờớợởỡ',
            'u' => 'ùúụủũưừứựửữ',
            'y' => 'ỳýỵỷỹ',
            'd' => 'đ',
        ];
        foreach ($groups as $ascii => $chars) {
            foreach (mb_str_split($chars) as $ch) {
                $map[$ch] = $ascii;
            }
        }
    }
    $s = strtr(mb_strtolower(trim($s)), $map);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
    $s = trim($s, '-');
    return mb_substr($s !== '' ? $s : 'bai-viet', 0, 120);
}

/** Số điện thoại -> dạng tel: quốc tế (+84...). */
function phone_href(string $phone): string
{
    $d = preg_replace('/\D+/', '', $phone) ?? '';
    if (str_starts_with($d, '84')) {
        return 'tel:+' . $d;
    }
    if (str_starts_with($d, '0')) {
        return 'tel:+84' . substr($d, 1);
    }
    return 'tel:' . $d;
}

function zalo_href(string $phone): string
{
    return 'https://zalo.me/' . preg_replace('/\D+/', '', $phone);
}

/** Chuỗi nhiều dòng -> mảng các dòng không rỗng. */
function text_lines(string $text): array
{
    $out = [];
    foreach (preg_split('/\R/u', $text) ?: [] as $line) {
        $line = trim($line);
        if ($line !== '') {
            $out[] = $line;
        }
    }
    return $out;
}

/** Dòng "A | B" -> [A, B]. */
function split_pair(string $line): array
{
    $parts = array_map('trim', explode('|', $line, 2));
    return [$parts[0], $parts[1] ?? ''];
}

/** Dòng "A | B | C" -> mảng đúng $n phần (thiếu thì để rỗng). */
function split_parts(string $line, int $n): array
{
    $parts = array_map('trim', explode('|', $line, $n));
    return array_pad($parts, $n, '');
}

function fmt_date(?string $ts, bool $withTime = false): string
{
    if (!$ts) {
        return '';
    }
    $t = strtotime($ts);
    return $t ? date($withTime ? 'd/m/Y H:i' : 'd/m/Y', $t) : '';
}

function is_safe_url(string $u): bool
{
    return (str_starts_with($u, '/') && !str_starts_with($u, '//')) || str_starts_with($u, 'https://');
}

/**
 * Định dạng nội dung bài viết (markup đơn giản, luôn escape trước nên không XSS):
 * "## Tiêu đề", "### Tiêu đề nhỏ", "- gạch đầu dòng", **đậm**, ![mô tả](ảnh), [chữ](liên kết).
 */
function format_content(string $text): string
{
    $inline = static function (string $line): string {
        $line = e($line);
        $line = preg_replace_callback(
            '/!\[([^\]]*)\]\(([^)\s]+)\)/u',
            static fn(array $m): string => is_safe_url(html_entity_decode($m[2]))
                ? '<img src="' . $m[2] . '" alt="' . $m[1] . '" loading="lazy">'
                : $m[0],
            $line
        ) ?? $line;
        $line = preg_replace_callback(
            '/\[([^\]]+)\]\(([^)\s]+)\)/u',
            static fn(array $m): string => is_safe_url(html_entity_decode($m[2]))
                ? '<a href="' . $m[2] . '" rel="noopener">' . $m[1] . '</a>'
                : $m[0],
            $line
        ) ?? $line;
        return preg_replace('/\*\*(.+?)\*\*/u', '<strong>$1</strong>', $line) ?? $line;
    };

    $html = '';
    $para = [];
    $list = [];
    $flush = static function () use (&$html, &$para, &$list, $inline): void {
        if ($para) {
            $html .= '<p>' . implode('<br>', array_map($inline, $para)) . '</p>';
            $para = [];
        }
        if ($list) {
            $html .= '<ul>' . implode('', array_map(static fn($i) => '<li>' . $inline($i) . '</li>', $list)) . '</ul>';
            $list = [];
        }
    };

    foreach (preg_split('/\R/u', $text) ?: [] as $raw) {
        $line = rtrim($raw);
        if (trim($line) === '') {
            $flush();
        } elseif (str_starts_with($line, '### ')) {
            $flush();
            $html .= '<h3>' . $inline(substr($line, 4)) . '</h3>';
        } elseif (str_starts_with($line, '## ')) {
            $flush();
            $html .= '<h2>' . $inline(substr($line, 3)) . '</h2>';
        } elseif (str_starts_with($line, '- ')) {
            if ($para) {
                $flush();
            }
            $list[] = substr($line, 2);
        } else {
            if ($list) {
                $flush();
            }
            $para[] = $line;
        }
    }
    $flush();
    return $html;
}

function plain_excerpt(string $content, int $len = 160): string
{
    $t = preg_replace('/!\[[^\]]*\]\([^)]*\)/u', '', $content) ?? '';
    $t = preg_replace('/\[([^\]]+)\]\([^)]*\)/u', '$1', $t) ?? '';
    $t = preg_replace('/^(#{2,3} |- )/mu', '', $t) ?? '';
    $t = trim(preg_replace('/\s+/u', ' ', str_replace('**', '', $t)) ?? '');
    return mb_strlen($t) > $len ? rtrim(mb_substr($t, 0, $len - 1)) . '…' : $t;
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

/* ---- Token ký (chống bot cho form công khai, không cần session) ---- */
function signed_token(): string
{
    $ts = (string) time();
    return $ts . '.' . hash_hmac('sha256', $ts, (string) cfg('secret', ''));
}

function signed_token_valid(string $token, int $minAge = 3, int $maxAge = 7200): bool
{
    $parts = explode('.', $token, 2);
    if (count($parts) !== 2 || !ctype_digit($parts[0])) {
        return false;
    }
    if (!hash_equals(hash_hmac('sha256', $parts[0], (string) cfg('secret', '')), $parts[1])) {
        return false;
    }
    $age = time() - (int) $parts[0];
    return $age >= $minAge && $age <= $maxAge;
}

function normalize_phone(string $raw): ?string
{
    $d = preg_replace('/[\s.\-()]+/', '', $raw) ?? '';
    if (str_starts_with($d, '+84')) {
        $d = '0' . substr($d, 3);
    } elseif (str_starts_with($d, '84') && strlen($d) >= 11) {
        $d = '0' . substr($d, 2);
    }
    return preg_match('/^0\d{9,10}$/', $d) ? $d : null;
}
