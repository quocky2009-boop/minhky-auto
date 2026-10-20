<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/_layout.php';
$user = require_login();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $row = q_one('SELECT password_hash FROM users WHERE id = ?', [$user['id']]);
    $new = (string) ($_POST['new'] ?? '');
    if (!$row || !password_verify((string) ($_POST['current'] ?? ''), $row['password_hash'])) {
        flash('Mật khẩu hiện tại không đúng.', 'err');
    } elseif ($p = password_problem($new)) {
        flash($p, 'err');
    } elseif ($new !== (string) ($_POST['new2'] ?? '')) {
        flash('Hai lần nhập mật khẩu mới không khớp.', 'err');
    } else {
        q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $user['id']]);
        session_regenerate_id(true);
        flash('Đã đổi mật khẩu.');
    }
    redirect(url('admin/profile.php'));
}

admin_head('Tài khoản của tôi', $user);
?>
<p>Tài khoản: <strong><?= e($user['username']) ?></strong> · Vai trò: <?= e(ROLES[$user['role']] ?? $user['role']) ?></p>
<h2>Đổi mật khẩu</h2>
<form method="post" class="stack" style="max-width:420px">
  <?= csrf_field() ?>
  <label>Mật khẩu hiện tại<input type="password" name="current" required autocomplete="current-password"></label>
  <label>Mật khẩu mới (tối thiểu 10 ký tự)<input type="password" name="new" required autocomplete="new-password"></label>
  <label>Nhập lại mật khẩu mới<input type="password" name="new2" required autocomplete="new-password"></label>
  <button class="btn-primary" type="submit">Đổi mật khẩu</button>
</form>
<?php admin_foot();
