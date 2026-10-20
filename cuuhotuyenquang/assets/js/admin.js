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
