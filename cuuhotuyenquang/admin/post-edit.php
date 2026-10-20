<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/_layout.php';
$user = require_login();

$id = (int) ($_GET['id'] ?? $_POST['id'] ?? 0);
$post = $id ? q_one('SELECT * FROM posts WHERE id = ?', [$id]) : null;
if ($id && !$post) {
    http_response_code(404);
    exit('Không tìm thấy bài viết.');
}
// Nhân viên chỉ sửa bài của mình và chỉ khi chưa đăng.
if ($post && !can_publish($user) && ((int) $post['author_id'] !== $user['id'] || $post['status'] === 'published')) {
    http_response_code(403);
    exit('Bạn chỉ được sửa bài của mình khi chưa đăng. Hãy nhờ Marketing/Admin chỉnh sửa.');
}

$d = $post ?? [
    'type' => in_array($_GET['type'] ?? '', ['news', 'journal'], true) ? $_GET['type'] : 'journal',
    'title' => '', 'slug' => '', 'excerpt' => '', 'content' => '', 'cover' => '', 'status' => 'draft',
    'rescue_location' => '', 'rescue_vehicle' => '', 'rescue_service' => '', 'rescue_date' => date('Y-m-d'),
    'published_at' => null,
];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $in = [];
    foreach (['title', 'slug', 'excerpt', 'cover', 'rescue_location', 'rescue_vehicle', 'rescue_service', 'rescue_date'] as $k) {
        $in[$k] = trim((string) ($_POST[$k] ?? ''));
    }
    $in['content'] = trim(str_replace("\r\n", "\n", (string) ($_POST['content'] ?? '')));
    $in['type'] = ($_POST['type'] ?? '') === 'news' ? 'news' : 'journal';
    $allowed = can_publish($user) ? ['draft', 'pending', 'published'] : ['draft', 'pending'];
    $in['status'] = in_array($_POST['status'] ?? '', $allowed, true) ? (string) $_POST['status'] : 'draft';

    $errors = [];
    if ($in['title'] === '' || mb_strlen($in['title']) > 255) { $errors[] = 'Tiêu đề bắt buộc (tối đa 255 ký tự).'; }
    if ($in['content'] === '') { $errors[] = 'Nội dung bắt buộc.'; }
    if ($in['cover'] !== '' && !is_safe_url($in['cover'])) { $errors[] = 'Ảnh đại diện không hợp lệ.'; }
    if ($in['rescue_date'] !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['rescue_date'])) { $errors[] = 'Ngày cứu hộ không hợp lệ.'; }
    foreach (['rescue_location', 'rescue_vehicle', 'rescue_service'] as $k) {
        if (mb_strlen($in[$k]) > 255) { $errors[] = 'Các trường thông tin ca cứu hộ tối đa 255 ký tự.'; break; }
    }

    if (!$errors) {
        $base = slugify($in['slug'] !== '' ? $in['slug'] : $in['title']);
        $slug = $base;
        for ($n = 2; q_val('SELECT COUNT(*) FROM posts WHERE slug = ? AND id <> ?', [$slug, $id]); $n++) {
            $slug = mb_substr($base, 0, 110) . '-' . $n;
        }
        $excerpt = $in['excerpt'] !== '' ? mb_substr($in['excerpt'], 0, 500) : plain_excerpt($in['content']);
        $now = date('Y-m-d H:i:s');
        $rescueDate = $in['type'] === 'journal' && $in['rescue_date'] !== '' ? $in['rescue_date'] : null;
        $publishedAt = $in['status'] === 'published' ? ($post['published_at'] ?? $now) : ($post['published_at'] ?? null);
        $fields = [$in['type'], $in['title'], $slug, $excerpt, $in['content'], $in['cover'], $in['status'],
            $in['rescue_location'], $in['rescue_vehicle'], $in['rescue_service'], $rescueDate, $publishedAt, $now];
        if ($post) {
            q('UPDATE posts SET type=?, title=?, slug=?, excerpt=?, content=?, cover=?, status=?, rescue_location=?, rescue_vehicle=?, rescue_service=?, rescue_date=?, published_at=?, updated_at=? WHERE id=?',
                [...$fields, $id]);
        } else {
            q('INSERT INTO posts (type, title, slug, excerpt, content, cover, status, rescue_location, rescue_vehicle, rescue_service, rescue_date, published_at, updated_at, author_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [...$fields, $user['id'], $now]);
        }
        flash($in['status'] === 'published' ? 'Đã lưu và đăng bài.' : ($in['status'] === 'pending' ? 'Đã gửi chờ duyệt.' : 'Đã lưu bản nháp.'));
        redirect(url('admin/posts.php'));
    }
    $d = array_merge($d, $in);
    flash(implode(' ', $errors), 'err');
}

admin_head($post ? 'Sửa bài viết' : 'Bài viết mới', $user);
?>
<form method="post" class="stack" id="post-form">
  <?= csrf_field() ?>
  <input type="hidden" name="id" value="<?= (int) $id ?>">
  <div class="grid-2">
    <label>Loại bài
      <select name="type" id="f-type">
        <option value="journal"<?= $d['type'] === 'journal' ? ' selected' : '' ?>>Nhật ký cứu hộ</option>
        <option value="news"<?= $d['type'] === 'news' ? ' selected' : '' ?>>Tin tức</option>
      </select></label>
    <label>Trạng thái
      <select name="status">
        <option value="draft"<?= $d['status'] === 'draft' ? ' selected' : '' ?>>Nháp</option>
        <option value="pending"<?= $d['status'] === 'pending' ? ' selected' : '' ?>>Gửi chờ duyệt</option>
        <?php if (can_publish($user)): ?><option value="published"<?= $d['status'] === 'published' ? ' selected' : '' ?>>Đăng công khai</option><?php endif; ?>
      </select></label>
  </div>
  <label>Tiêu đề<input name="title" value="<?= e($d['title']) ?>" maxlength="255" required></label>

  <fieldset id="journal-fields"><legend>Thông tin ca cứu hộ</legend>
    <div class="grid-2">
      <label>Ngày cứu hộ<input type="date" name="rescue_date" value="<?= e((string) $d['rescue_date']) ?>"></label>
      <label>Địa điểm<input name="rescue_location" value="<?= e($d['rescue_location']) ?>" maxlength="255" placeholder="VD: QL2, xã ..., Tuyên Quang"></label>
      <label>Loại xe<input name="rescue_vehicle" value="<?= e($d['rescue_vehicle']) ?>" maxlength="255" placeholder="VD: Toyota Vios 2019"></label>
      <label>Dịch vụ đã làm<input name="rescue_service" value="<?= e($d['rescue_service']) ?>" maxlength="255" placeholder="VD: Kéo xe về gara"></label>
    </div>
    <p class="muted">Không đăng biển số, số điện thoại hay thông tin nhận diện khách nếu khách chưa đồng ý.</p>
  </fieldset>

  <label>Ảnh đại diện
    <span class="row"><input name="cover" id="f-cover" value="<?= e($d['cover']) ?>" placeholder="/uploads/...">
    <button type="button" class="btn-sec" data-upload="cover">Tải ảnh lên</button></span></label>

  <label>Nội dung
    <div class="toolbar">
      <button type="button" data-ins="## ">Tiêu đề</button>
      <button type="button" data-wrap="**">Đậm</button>
      <button type="button" data-ins="- ">Gạch đầu dòng</button>
      <button type="button" id="ins-img">Chèn ảnh</button>
    </div>
    <textarea name="content" id="f-content" rows="16" required><?= e($d['content']) ?></textarea>
  </label>
  <p class="muted">Cách viết: để trống một dòng để xuống đoạn mới · <code>## Tiêu đề</code> · <code>- gạch đầu dòng</code> · <code>**chữ đậm**</code> · <code>[chữ](https://liên-kết)</code>. Dùng nút «Chèn ảnh» để tải và chèn ảnh vào bài.</p>

  <label>Tóm tắt (để trống = tự lấy từ nội dung)<textarea name="excerpt" rows="2" maxlength="500"><?= e($d['excerpt']) ?></textarea></label>
  <label>Đường dẫn (slug, để trống = tự tạo từ tiêu đề)<input name="slug" value="<?= e($d['slug']) ?>" maxlength="120"></label>

  <div class="actions sticky">
    <button class="btn-primary" type="submit">Lưu</button>
    <a class="btn-sec" href="posts.php">Hủy</a>
  </div>
</form>
<?php admin_foot();
