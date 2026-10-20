<?php
declare(strict_types=1);
define('ALLOW_NO_CONFIG', true);
require __DIR__ . '/includes/bootstrap.php';

if ($CONFIG) {
    http_response_code(403);
    exit('Website đã được cài đặt. Hãy XÓA tệp install.php khỏi hosting.');
}

$errors = [];
$v = [
    'db_driver' => 'mysql', 'db_host' => 'localhost', 'db_name' => '', 'db_user' => '',
    'site_url' => 'https://cuuhotuyenquang.vn',
    'username' => 'admin', 'full_name' => 'Quản trị viên',
];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    foreach ($v as $k => $_) {
        $v[$k] = trim((string) ($_POST[$k] ?? $v[$k]));
    }
    $dbPass = (string) ($_POST['db_pass'] ?? '');
    $adminPass = (string) ($_POST['password'] ?? '');

    if (!in_array($v['db_driver'], ['mysql', 'sqlite'], true)) {
        $errors[] = 'Loại cơ sở dữ liệu không hợp lệ.';
    }
    if (!preg_match('/^[a-z0-9._-]{3,50}$/', $v['username'])) {
        $errors[] = 'Tên đăng nhập: 3–50 ký tự thường, số, . _ -';
    }
    if ($p = password_problem($adminPass)) {
        $errors[] = $p;
    }
    if ($adminPass !== (string) ($_POST['password2'] ?? '')) {
        $errors[] = 'Hai lần nhập mật khẩu không khớp.';
    }
    if (!str_starts_with($v['site_url'], 'http')) {
        $errors[] = 'Địa chỉ website phải bắt đầu bằng https://';
    }

    if (!$errors) {
        $conf = [
            'db_driver' => $v['db_driver'],
            'site_url' => rtrim($v['site_url'], '/'),
            'base_path' => '',
            'secret' => bin2hex(random_bytes(32)),
            'debug' => false,
        ];
        if ($v['db_driver'] === 'sqlite') {
            $conf['db_path'] = __DIR__ . '/includes/data.sqlite';
        } else {
            $conf += ['db_host' => $v['db_host'], 'db_port' => 3306, 'db_name' => $v['db_name'], 'db_user' => $v['db_user'], 'db_pass' => $dbPass];
        }
        try {
            $pdo = connect_db($conf);
            create_schema($pdo, $v['db_driver']);
            $exists = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            if ($exists === 0) {
                $pdo->prepare('INSERT INTO users (username, full_name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)')
                    ->execute([$v['username'], $v['full_name'], password_hash($adminPass, PASSWORD_DEFAULT), 'admin', date('Y-m-d H:i:s')]);
            }
            $php = "<?php\nreturn " . var_export($conf, true) . ";\n";
            if (file_put_contents(__DIR__ . '/includes/config.php', $php, LOCK_EX) === false) {
                throw new RuntimeException('Không ghi được includes/config.php — kiểm tra quyền thư mục includes/.');
            }
            @chmod(__DIR__ . '/includes/config.php', 0640);
            header('Content-Type: text/html; charset=utf-8');
            echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="assets/css/admin.css">';
            echo '<div class="login-box"><h1>Cài đặt xong ✔</h1><p>Hãy <strong>xóa tệp install.php</strong> khỏi hosting, sau đó <a href="admin/login.php">đăng nhập Dashboard</a> và cập nhật hotline, địa chỉ ở mục Nội dung landing page.</p></div>';
            exit;
        } catch (Throwable $ex) {
            $errors[] = 'Không hoàn tất được cài đặt: ' . $ex->getMessage();
        }
    }
}
header('Content-Type: text/html; charset=utf-8');
?><!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cài đặt website</title><link rel="stylesheet" href="assets/css/admin.css"></head>
<body>
<div class="login-box" style="max-width:560px">
  <h1>Cài đặt website cứu hộ</h1>
  <?php foreach ($errors as $er): ?><div class="notice err"><?= e($er) ?></div><?php endforeach; ?>
  <form method="post" class="stack">
    <?= csrf_field() ?>
    <label>Cơ sở dữ liệu
      <select name="db_driver">
        <option value="mysql"<?= $v['db_driver'] === 'mysql' ? ' selected' : '' ?>>MySQL / MariaDB (khuyên dùng cho hosting)</option>
        <option value="sqlite"<?= $v['db_driver'] === 'sqlite' ? ' selected' : '' ?>>SQLite (thử nghiệm / site nhỏ)</option>
      </select></label>
    <fieldset><legend>MySQL (bỏ qua nếu dùng SQLite)</legend>
      <label>Máy chủ<input name="db_host" value="<?= e($v['db_host']) ?>"></label>
      <label>Tên database<input name="db_name" value="<?= e($v['db_name']) ?>"></label>
      <label>Tài khoản database<input name="db_user" value="<?= e($v['db_user']) ?>"></label>
      <label>Mật khẩu database<input type="password" name="db_pass" autocomplete="off"></label>
    </fieldset>
    <label>Địa chỉ website chính<input name="site_url" value="<?= e($v['site_url']) ?>"></label>
    <fieldset><legend>Tài khoản Admin đầu tiên</legend>
      <label>Họ tên<input name="full_name" value="<?= e($v['full_name']) ?>" required></label>
      <label>Tên đăng nhập<input name="username" value="<?= e($v['username']) ?>" required></label>
      <label>Mật khẩu (tối thiểu 10 ký tự)<input type="password" name="password" required autocomplete="new-password"></label>
      <label>Nhập lại mật khẩu<input type="password" name="password2" required autocomplete="new-password"></label>
    </fieldset>
    <button class="btn-primary" type="submit">Cài đặt</button>
  </form>
</div>
</body></html>
