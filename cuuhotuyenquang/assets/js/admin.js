(function () {
  var csrf = (document.querySelector('input[name="_csrf"]') || {}).value || '';

  function pickAndUpload(done) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = function () {
      if (!input.files.length) return;
      var fd = new FormData();
      fd.append('file', input.files[0]);
      fd.append('_csrf', csrf);
      fetch('upload.php', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) { alert(res.j.error || 'Tải ảnh thất bại.'); return; }
          done(res.j.url);
        })
        .catch(function () { alert('Không kết nối được máy chủ.'); });
    };
    input.click();
  }

  // Nút "Tải ảnh lên" cạnh ô nhập URL ảnh (data-upload = tên ô nhập)
  document.querySelectorAll('[data-upload]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var field = document.querySelector('[name="' + btn.dataset.upload + '"]');
      pickAndUpload(function (url) { field.value = url; });
    });
  });

  function pickMany(done) {
    var input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = function () {
      var files = Array.prototype.slice.call(input.files), urls = [];
      (function next() {
        if (!files.length) { done(urls); return; }
        var fd = new FormData(); fd.append('file', files.shift()); fd.append('_csrf', csrf);
        fetch('upload.php', { method: 'POST', body: fd, credentials: 'same-origin' })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) { if (res.ok) urls.push(res.j.url); else alert(res.j.error || 'Tải ảnh thất bại.'); next(); })
          .catch(function () { alert('Không kết nối được máy chủ.'); next(); });
      })();
    };
    input.click();
  }
  // Thư viện ảnh: thêm mỗi ảnh thành một dòng "url | "
  document.querySelectorAll('[data-gallery]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var t = document.querySelector('[name="' + btn.dataset.gallery + '"]');
      pickMany(function (urls) {
        var add = urls.map(function (u) { return u + ' | '; }).join('\n');
        if (add) t.value = (t.value.trim() ? t.value.replace(/\s+$/, '') + '\n' : '') + add;
      });
    });
  });
  // Dịch vụ: gắn ảnh vào dòng đang chứa con trỏ ("Tên | Mô tả | ảnh")
  document.querySelectorAll('[data-lineimg]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var t = document.querySelector('[name="' + btn.dataset.lineimg + '"]');
      var pos = t.selectionStart, v = t.value;
      var start = v.lastIndexOf('\n', pos - 1) + 1, end = v.indexOf('\n', pos); if (end < 0) end = v.length;
      var line = v.slice(start, end);
      if (!line.trim()) { alert('Hãy đặt con trỏ vào dòng dịch vụ muốn gắn ảnh.'); return; }
      pickAndUpload(function (url) {
        var parts = line.split('|').map(function (s) { return s.trim(); });
        while (parts.length < 2) parts.push('');
        parts[2] = url;
        t.value = v.slice(0, start) + parts.slice(0, 3).join(' | ') + v.slice(end);
      });
    });
  });

  var ta = document.getElementById('f-content');
  function insertAtCursor(text, wrap) {
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    if (wrap) {
      ta.value = v.slice(0, s) + wrap + (v.slice(s, e) || 'chữ đậm') + wrap + v.slice(e);
    } else {
      var lineStart = v.lastIndexOf('\n', s - 1) + 1;
      ta.value = v.slice(0, lineStart) + text + v.slice(lineStart);
    }
    ta.focus();
  }
  document.querySelectorAll('[data-ins]').forEach(function (b) {
    b.addEventListener('click', function () { insertAtCursor(b.dataset.ins); });
  });
  document.querySelectorAll('[data-wrap]').forEach(function (b) {
    b.addEventListener('click', function () { insertAtCursor('', b.dataset.wrap); });
  });
  var img = document.getElementById('ins-img');
  if (img && ta) {
    img.addEventListener('click', function () {
      pickAndUpload(function (url) {
        var s = ta.selectionStart;
        ta.value = ta.value.slice(0, s) + '\n\n![mô tả ảnh](' + url + ')\n\n' + ta.value.slice(s);
      });
    });
  }

  // Chỉ hiện ô "Thông tin ca cứu hộ" khi loại bài là Nhật ký
  var type = document.getElementById('f-type'), jf = document.getElementById('journal-fields');
  if (type && jf) {
    var sync = function () { jf.hidden = type.value !== 'journal'; };
    type.addEventListener('change', sync);
    sync();
  }
})();
