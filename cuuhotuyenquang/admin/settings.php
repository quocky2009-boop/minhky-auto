<?php
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/_layout.php';
$user = require_role(['admin']);

$def = settings_def();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $errors = [];
    $clean = [];
    foreach ($def as $fields) {
        foreach ($fields as $key => [$type, $label]) {
            if (!array_key_exists($key, $_POST)) {
                continue; // trường không gửi lên thì giữ nguyên
            }
            $val = trim(str_replace("\r\n", "\n", (string) ($_POST[$key] ?? '')));
            if ($type !== 'lines' && $type !== 'textarea') {
                $val = preg_replace('/\s+/u', ' ', $val) ?? $val;
            }
            if (mb_strlen($val) > 5000) {
                $errors[] = "«{$label}» quá dài.";
            }
            if (in_array($key, ['map_url', 'facebook'], true) && $val !== '' && !str_starts_with($val, 'https://')) {
                $errors[] = "«{$label}» phải bắt đầu bằng https://";
            }
            if ($type === 'image' && $val !== '' && !is_safe_url($val)) {
                $errors[] = "«{$label}» phải là đường dẫn ảnh hợp lệ.";
            }
            if ($key === 'gallery' || $key === 'services') {
                $idx = $key === 'gallery' ? 0 : 2;
                foreach (text_lines($val) as $ln) {
                    $img = split_parts($ln, 3)[$idx];
                    if ($img !== '' && !is_safe_url($img)) {
                        $errors[] = "Ảnh «{$img}» ở mục {$key} không hợp lệ (phải bắt đầu bằng / hoặc https://).";
                    }
                }
            }
            if ($key === 'hotline' && !preg_match('/^[0-9 .+\-()]{8,20}$/', $val)) {
                $errors[] = 'Hotline chỉ gồm số, dấu cách và + - ( ). (8–20 ký tự).';
            }
            if ($key === 'ga_id' && $val !== '' && !preg_match('/^G-[A-Z0-9]+$/', $val)) {
                $errors[] = 'Mã Google Analytics có dạng G-XXXXXXXXXX.';
            }
            $clean[$key] = $val;
        }
    }
    if ($errors) {
        flash(implode(' ', $errors), 'err');
    } else {
        $pdo = db();
        $pdo->beginTransaction();
        try {
            foreach ($clean as $k => $val) {
                q('REPLACE INTO settings (skey, svalue) VALUES (?, ?)', [$k, $val]);
            }
            $pdo->commit();
            flash('Đã lưu nội dung landing page.');
        } catch (Throwable $ex) {
            $pdo->rollBack();
            flash('Không lưu được: ' . $ex->getMessage(), 'err');
        }
    }
    redirect(url('admin/settings.php'));
}

admin_head('Nội dung landing page', $user);
?>
<p class="muted">Mọi thay đổi có hiệu lực ngay trên trang chủ sau khi lưu. Với ô nhiều dòng, mỗi dòng là một mục; dùng dấu <code>|</code> để tách tiêu đề và mô tả.</p>
<form method="post" class="stack">
  <?= csrf_field() ?>
  <?php foreach ($def as $group => $fields): ?>
    <fieldset><legend><?= e($group) ?></legend>
      <?php foreach ($fields as $key => $fdef): [$type, $label] = $fdef; $mode = $fdef[3] ?? ''; $val = setting($key); ?>
        <label><?= e($label) ?>
          <?php if ($type === 'textarea'): ?>
            <textarea name="<?= e($key) ?>" rows="3"><?= e($val) ?></textarea>
          <?php elseif ($type === 'lines'): ?>
            <textarea name="<?= e($key) ?>" rows="<?= max(4, count(text_lines($val)) + 1) ?>"><?= e($val) ?></textarea>
            <?php if ($mode === 'append'): ?><span><button type="button" class="btn-sec" data-gallery="<?= e($key) ?>">Tải ảnh lên và thêm</button></span>
            <?php elseif ($mode === 'line'): ?><span><button type="button" class="btn-sec" data-lineimg="<?= e($key) ?>">Tải ảnh cho dòng này</button></span><?php endif; ?>
          <?php elseif ($type === 'image'): ?>
            <span class="row">
              <input name="<?= e($key) ?>" value="<?= e($val) ?>" placeholder="/uploads/...">
              <button type="button" class="btn-sec" data-upload="<?= e($key) ?>">Tải ảnh lên</button>
            </span>
          <?php else: ?>
            <input name="<?= e($key) ?>" value="<?= e($val) ?>">
          <?php endif; ?>
        </label>
      <?php endforeach; ?>
    </fieldset>
  <?php endforeach; ?>
  <div class="actions sticky"><button class="btn-primary" type="submit">Lưu thay đổi</button></div>
</form>
<?php admin_foot();
