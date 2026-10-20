<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/_layout.php';
$user = require_role(['admin']);

$activeAdmins = static fn(): int => (int) q_val("SELECT COUNT(*) FROM users WHERE role='admin' AND active=1");

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $act = (string) ($_POST['action'] ?? '');
    $id = (int) ($_POST['id'] ?? 0);
    $err = null;

    if ($act === 'create') {
        $username = mb_strtolower(trim((string) ($_POST['username'] ?? '')));
        $name = trim((string) ($_POST['full_name'] ?? ''));
        $role = (string) ($_POST['role'] ?? 'staff');
        $pw = (string) ($_POST['password'] ?? '');
        if (!preg_match('/^[a-z0-9._-]{3,50}$/', $username)) {
            $err = 'Tên đăng nhập: 3–50 ký tự thường, số, . _ -';
        } elseif ($name === '' || mb_strlen($name) > 120) {
            $err = 'Họ tên bắt buộc.';
        } elseif (!isset(ROLES[$role])) {
            $err = 'Vai trò không hợp lệ.';
        } elseif ($p = password_problem($pw)) {
            $err = $p;
        } elseif (q_val('SELECT COUNT(*) FROM users WHERE username = ?', [$username])) {
            $err = 'Tên đăng nhập đã tồn tại.';
        } else {
            q('INSERT INTO users (username, full_name, password_hash, role, active, created_at) VALUES (?,?,?,?,1,?)',
                [$username, $name, password_hash($pw, PASSWORD_DEFAULT), $role, date('Y-m-d H:i:s')]);
            flash('Đã tạo tài khoản ' . $username . '.');
        }
    } elseif (in_array($act, ['update', 'reset'], true)) {
        $target = q_one('SELECT * FROM users WHERE id = ?', [$id]);
        if (!$target) {
            $err = 'Không tìm thấy tài khoản.';
        } elseif ($act === 'reset') {
            $pw = (string) ($_POST['password'] ?? '');
            if ($p = password_problem($pw)) {
                $err = $p;
            } else {
                q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $id]);
                flash('Đã đặt lại mật khẩu cho ' . $target['username'] . '.');
            }
        } else {
            $role = (string) ($_POST['role'] ?? '');
            $active = isset($_POST['active']) ? 1 : 0;
            if (!isset(ROLES[$role])) {
                $err = 'Vai trò không hợp lệ.';
            } else {
                $loses = $target['role'] === 'admin' && (int) $target['active'] === 1 && ($role !== 'admin' || !$active);
                if ($loses && $activeAdmins() <= 1) {
                    $err = 'Phải còn ít nhất một Admin đang hoạt động.';
                } else {
                    q('UPDATE users SET role = ?, active = ? WHERE id = ?', [$role, $active, $id]);
                    flash('Đã cập nhật tài khoản ' . $target['username'] . '.');
                }
            }
        }
    }
    if ($err) {
        flash($err, 'err');
    }
    redirect(url('admin/users.php'));
}

$users = q_all('SELECT id, username, full_name, role, active, created_at FROM users ORDER BY id');
admin_head('Quản lý tài khoản', $user);
?>
<p class="muted"><strong>Admin</strong>: sửa landing page, quản lý tài khoản, đăng/xóa mọi bài. <strong>Marketing</strong>: duyệt, đăng, sửa mọi bài. <strong>Nhân viên</strong>: viết nhật ký/tin của mình, gửi chờ duyệt.</p>
<div class="tbl-wrap"><table class="tbl">
  <thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Vai trò / Hoạt động</th><th>Đặt lại mật khẩu</th></tr></thead>
  <tbody>
  <?php foreach ($users as $u): ?>
    <tr>
      <td><?= e($u['username']) ?></td>
      <td><?= e($u['full_name']) ?></td>
      <td><form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="update"><input type="hidden" name="id" value="<?= (int) $u['id'] ?>">
        <select name="role"><?php foreach (ROLES as $k => $l): ?><option value="<?= $k ?>"<?= $u['role'] === $k ? ' selected' : '' ?>><?= e($l) ?></option><?php endforeach; ?></select>
        <label class="chk"><input type="checkbox" name="active"<?= (int) $u['active'] ? ' checked' : '' ?>> Hoạt động</label>
        <button class="btn-sec" type="submit">Lưu</button></form></td>
      <td><form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="reset"><input type="hidden" name="id" value="<?= (int) $u['id'] ?>">
        <input type="password" name="password" placeholder="Mật khẩu mới" autocomplete="new-password" required>
        <button class="btn-sec" type="submit">Đặt lại</button></form></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table></div>

<h2>Tạo tài khoản mới</h2>
<form method="post" class="stack" style="max-width:520px">
  <?= csrf_field() ?><input type="hidden" name="action" value="create">
  <label>Tên đăng nhập<input name="username" required autocomplete="off"></label>
  <label>Họ tên<input name="full_name" required></label>
  <label>Vai trò<select name="role"><?php foreach (ROLES as $k => $l): ?><option value="<?= $k ?>"<?= $k === 'staff' ? ' selected' : '' ?>><?= e($l) ?></option><?php endforeach; ?></select></label>
  <label>Mật khẩu (tối thiểu 10 ký tự)<input type="password" name="password" required autocomplete="new-password"></label>
  <button class="btn-primary" type="submit">Tạo tài khoản</button>
</form>
<?php admin_foot();
