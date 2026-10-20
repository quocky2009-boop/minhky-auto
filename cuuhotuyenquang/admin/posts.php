<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/_layout.php';
$user = require_login();

const STATUS_LABELS = ['draft' => 'Nháp', 'pending' => 'Chờ duyệt', 'published' => 'Đã đăng'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    if (!can_publish($user)) {
        http_response_code(403);
        exit('Bạn không có quyền thực hiện thao tác này.');
    }
    $id = (int) ($_POST['id'] ?? 0);
    $act = (string) ($_POST['action'] ?? '');
    $post = q_one('SELECT id, status FROM posts WHERE id = ?', [$id]);
    if ($post) {
        $now = date('Y-m-d H:i:s');
        if ($act === 'delete') {
            q('DELETE FROM posts WHERE id = ?', [$id]);
            flash('Đã xóa bài viết.');
        } elseif ($act === 'publish') {
            q("UPDATE posts SET status='published', published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?", [$now, $now, $id]);
            flash('Đã đăng bài.');
        } elseif ($act === 'unpublish') {
            q("UPDATE posts SET status='draft', updated_at=? WHERE id=?", [$now, $id]);
            flash('Đã gỡ bài về bản nháp.');
        }
    }
    redirect(url('admin/posts.php'));
}

$type = in_array($_GET['type'] ?? '', ['news', 'journal'], true) ? $_GET['type'] : '';
$status = array_key_exists($_GET['status'] ?? '', STATUS_LABELS) ? $_GET['status'] : '';
$search = trim((string) ($_GET['q'] ?? ''));

$where = ['1=1'];
$params = [];
if ($user['role'] === 'staff') {
    $where[] = 'p.author_id = ?';
    $params[] = $user['id'];
}
if ($type !== '') { $where[] = 'p.type = ?'; $params[] = $type; }
if ($status !== '') { $where[] = 'p.status = ?'; $params[] = $status; }
if ($search !== '') {
    $where[] = 'p.title LIKE ?';
    $params[] = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $search) . '%';
}
$w = implode(' AND ', $where);

$perPage = 20;
$total = (int) q_val("SELECT COUNT(*) FROM posts p WHERE $w", $params);
$pages = max(1, (int) ceil($total / $perPage));
$page = min(max(1, (int) ($_GET['trang'] ?? 1)), $pages);
$offset = ($page - 1) * $perPage;
$rows = q_all(
    "SELECT p.id, p.title, p.type, p.status, p.updated_at, p.published_at, u.full_name
       FROM posts p LEFT JOIN users u ON u.id = p.author_id
      WHERE $w ORDER BY p.updated_at DESC, p.id DESC LIMIT $perPage OFFSET $offset",
    $params
);

admin_head('Bài viết & nhật ký cứu hộ', $user);
?>
<div class="actions">
  <a class="btn-primary" href="post-edit.php?type=journal">+ Nhật ký cứu hộ</a>
  <a class="btn-sec" href="post-edit.php?type=news">+ Tin tức</a>
</div>
<form method="get" class="filters">
  <select name="type"><option value="">Mọi loại</option>
    <option value="journal"<?= $type === 'journal' ? ' selected' : '' ?>>Nhật ký cứu hộ</option>
    <option value="news"<?= $type === 'news' ? ' selected' : '' ?>>Tin tức</option></select>
  <select name="status"><option value="">Mọi trạng thái</option>
    <?php foreach (STATUS_LABELS as $k => $l): ?><option value="<?= $k ?>"<?= $status === $k ? ' selected' : '' ?>><?= e($l) ?></option><?php endforeach; ?>
  </select>
  <input name="q" value="<?= e($search) ?>" placeholder="Tìm theo tiêu đề">
  <button class="btn-sec" type="submit">Lọc</button>
</form>

<?php if (!$rows): ?><p class="muted">Không có bài viết nào.</p><?php else: ?>
<div class="tbl-wrap"><table class="tbl">
  <thead><tr><th>Tiêu đề</th><th>Loại</th><th>Trạng thái</th><th>Tác giả</th><th>Cập nhật</th><th></th></tr></thead>
  <tbody>
  <?php foreach ($rows as $p): ?>
    <tr>
      <td><a href="post-edit.php?id=<?= (int) $p['id'] ?>"><?= e($p['title']) ?></a></td>
      <td><?= $p['type'] === 'journal' ? 'Nhật ký' : 'Tin tức' ?></td>
      <td><span class="tag tag-<?= e($p['status']) ?>"><?= e(STATUS_LABELS[$p['status']] ?? $p['status']) ?></span></td>
      <td><?= e($p['full_name'] ?? '') ?></td>
      <td><?= e(fmt_date($p['updated_at'], true)) ?></td>
      <td class="row-actions">
        <?php if (can_publish($user)): ?>
          <form method="post"><?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $p['id'] ?>">
            <?php if ($p['status'] === 'published'): ?>
              <button name="action" value="unpublish" class="link">Gỡ</button>
            <?php else: ?>
              <button name="action" value="publish" class="link">Đăng</button>
            <?php endif; ?>
            <button name="action" value="delete" class="link danger" onclick="return confirm('Xóa vĩnh viễn bài này?')">Xóa</button>
          </form>
        <?php endif; ?>
      </td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table></div>
<?php if ($pages > 1): ?>
  <nav class="pager">
    <?php for ($i = 1; $i <= $pages; $i++):
        $qs = http_build_query(array_filter(['type' => $type, 'status' => $status, 'q' => $search, 'trang' => $i > 1 ? $i : null])); ?>
      <a href="?<?= e($qs) ?>"<?= $i === $page ? ' class="cur"' : '' ?>><?= $i ?></a>
    <?php endfor; ?>
  </nav>
<?php endif; endif;
admin_foot();
