<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/_layout.php';
$user = require_login();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $id = (int) ($_POST['id'] ?? 0);
    $act = (string) ($_POST['action'] ?? '');
    if ($act === 'done' || $act === 'new') {
        q('UPDATE callbacks SET status = ? WHERE id = ?', [$act, $id]);
    } elseif ($act === 'delete' && $user['role'] === 'admin') {
        q('DELETE FROM callbacks WHERE id = ?', [$id]);
        flash('Đã xóa yêu cầu.');
    }
    redirect(url('admin/callbacks.php'));
}

$show = ($_GET['s'] ?? 'new') === 'all' ? 'all' : 'new';
$perPage = 30;
$where = $show === 'new' ? "WHERE status = 'new'" : '';
$total = (int) q_val("SELECT COUNT(*) FROM callbacks $where");
$pages = max(1, (int) ceil($total / $perPage));
$page = min(max(1, (int) ($_GET['trang'] ?? 1)), $pages);
$offset = ($page - 1) * $perPage;
$rows = q_all("SELECT * FROM callbacks $where ORDER BY id DESC LIMIT $perPage OFFSET $offset");

admin_head('Khách xin gọi lại', $user);
?>
<p class="actions">
  <a class="<?= $show === 'new' ? 'btn-primary' : 'btn-sec' ?>" href="?s=new">Chưa xử lý</a>
  <a class="<?= $show === 'all' ? 'btn-primary' : 'btn-sec' ?>" href="?s=all">Tất cả</a>
</p>
<?php if (!$rows): ?><p class="muted">Không có yêu cầu nào.</p><?php else: ?>
<div class="tbl-wrap"><table class="tbl">
  <thead><tr><th>Điện thoại</th><th>Họ tên</th><th>Ghi chú</th><th>Thời gian</th><th>Trạng thái</th><th></th></tr></thead>
  <tbody>
  <?php foreach ($rows as $c): ?>
    <tr>
      <td><a href="<?= e(phone_href($c['phone'])) ?>"><strong><?= e($c['phone']) ?></strong></a></td>
      <td><?= e($c['name']) ?></td>
      <td><?= e($c['note']) ?></td>
      <td><?= e(fmt_date($c['created_at'], true)) ?></td>
      <td><span class="tag tag-<?= $c['status'] === 'new' ? 'pending' : 'published' ?>"><?= $c['status'] === 'new' ? 'Mới' : 'Đã gọi' ?></span></td>
      <td class="row-actions"><form method="post"><?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $c['id'] ?>">
        <?php if ($c['status'] === 'new'): ?><button name="action" value="done" class="link">Đã gọi lại</button>
        <?php else: ?><button name="action" value="new" class="link">Mở lại</button><?php endif; ?>
        <?php if ($user['role'] === 'admin'): ?><button name="action" value="delete" class="link danger" onclick="return confirm('Xóa yêu cầu này?')">Xóa</button><?php endif; ?>
      </form></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table></div>
<?php if ($pages > 1): ?><nav class="pager"><?php for ($i = 1; $i <= $pages; $i++): ?>
  <a href="?s=<?= e($show) ?>&trang=<?= $i ?>"<?= $i === $page ? ' class="cur"' : '' ?>><?= $i ?></a>
<?php endfor; ?></nav><?php endif; endif;
admin_foot();
