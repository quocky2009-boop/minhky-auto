// Ghi nhận lượt bấm gọi vào Google Analytics (nếu đã cấu hình mã GA). Không thu thập gì thêm.
document.addEventListener('click', function (ev) {
  var a = ev.target.closest('a[data-call]');
  if (a && typeof window.gtag === 'function') {
    window.gtag('event', 'call_click', { event_category: 'contact', event_label: a.getAttribute('href') });
  }
});
