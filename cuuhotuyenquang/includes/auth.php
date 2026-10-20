<?php
declare(strict_types=1);

const ROLES = [
    'admin' => 'Quản trị (Admin)',
    'marketing' => 'Marketing',
    'staff' => 'Nhân viên',
];

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('cuuho_sid');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function csrf_token(): string
{
    start_session();
    return $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(csrf_token()) . '">';
}

function csrf_check(): void
{
    start_session();
    $sent = (string) ($_POST['_csrf'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($sent === '' || !hash_equals((string) ($_SESSION['csrf'] ?? ''), $sent)) {
        http_response_code(419);
        exit('Phiên làm việc đã hết hạn hoặc yêu cầu không hợp lệ. Hãy tải lại trang và thử lại.');
    }
}

function flash(?string $msg = null, string $type = 'ok'): ?array
{
    start_session();
    if ($msg !== null) {
        $_SESSION['flash'] = [$type, $msg];
        return null;
    }
    $f = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return $f;
}

function current_user(): ?array
{
    static $cache = false;
    start_session();
    if (empty($_SESSION['uid'])) {
        return null;
    }
    // Luôn đọc lại từ DB để thu hồi quyền/khóa tài khoản có hiệu lực ngay.
    if ($cache === false || ($cache['id'] ?? null) !== $_SESSION['uid']) {
        $cache = q_one('SELECT id, username, full_name, role, active FROM users WHERE id = ?', [$_SESSION['uid']]);
        if (!$cache || !(int) $cache['active']) {
            $cache = null;
            $_SESSION = [];
            return null;
        }
        $cache['id'] = (int) $cache['id'];
    }
    return $cache;
}

function require_login(): array
{
    $u = current_user();
    if (!$u) {
        redirect(url('admin/login.php'));
    }
    return $u;
}

/** @param string[] $roles */
function require_role(array $roles): array
{
    $u = require_login();
    if (!in_array($u['role'], $roles, true)) {
        http_response_code(403);
        exit('Bạn không có quyền truy cập chức năng này.');
    }
    return $u;
}

function can_publish(array $u): bool
{
    return in_array($u['role'], ['admin', 'marketing'], true);
}

function login_blocked(): bool
{
    $since = date('Y-m-d H:i:s', time() - 900);
    return (int) q_val('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND created_at > ?', [client_ip(), $since]) >= 8;
}

function login_attempt(string $username, string $password): bool
{
    $u = q_one('SELECT * FROM users WHERE username = ?', [mb_strtolower(trim($username))]);
    // Luôn chạy password_verify để thời gian phản hồi không lộ tài khoản tồn tại.
    $hash = $u['password_hash'] ?? '$2y$10$usesomesillystringforsaltuseless.abcdefghijklmnopqrstuv';
    $ok = password_verify($password, $hash) && $u && (int) $u['active'] === 1;
    if (!$ok) {
        q('INSERT INTO login_attempts (ip, created_at) VALUES (?, ?)', [client_ip(), date('Y-m-d H:i:s')]);
        return false;
    }
    q('DELETE FROM login_attempts WHERE ip = ?', [client_ip()]);
    start_session();
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $u['id'];
    return true;
}

function logout_user(): void
{
    start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 3600, $p['path'], $p['domain'] ?? '', (bool) $p['secure'], true);
    }
    session_destroy();
}

function password_problem(string $pw): ?string
{
    if (mb_strlen($pw) < 10) {
        return 'Mật khẩu cần tối thiểu 10 ký tự.';
    }
    return null;
}
