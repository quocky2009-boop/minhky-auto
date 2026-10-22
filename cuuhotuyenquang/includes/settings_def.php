<?php
declare(strict_types=1);

const PLACEHOLDER_HOTLINE = '0900 000 000';

/**
 * Định nghĩa nội dung landing page chỉnh được trong Dashboard.
 * type: text | textarea | lines (mỗi dòng một mục) | image (URL ảnh, có nút tải lên)
 * Nội dung mặc định là nội dung mẫu: cần Chủ tịch/Admin kiểm tra lại trước khi chạy thật.
 */
function settings_def(): array
{
    return [
        'Thông tin liên hệ' => [
            'brand_name' => ['text', 'Tên thương hiệu', 'Cứu hộ ô tô Gara Minh Kỳ'],
            'logo' => ['image', 'Logo (tùy chọn, ảnh vuông/ngang nền trong suốt)', ''],
            'hotline' => ['text', 'Hotline cứu hộ (số hiển thị và gọi)', PLACEHOLDER_HOTLINE],
            'hotline2' => ['text', 'Hotline phụ (không bắt buộc)', ''],
            'zalo' => ['text', 'Số Zalo (để trống = dùng số hotline)', ''],
            'address' => ['text', 'Địa chỉ gara', 'Gara Minh Kỳ – Tuyên Quang (cập nhật địa chỉ cụ thể)'],
            'hours' => ['text', 'Giờ tiếp nhận', 'Tiếp nhận cuộc gọi 24/7'],
            'map_url' => ['text', 'Liên kết Google Maps (https://...)', ''],
            'facebook' => ['text', 'Liên kết Facebook (https://...)', ''],
        ],
        'Đầu trang (Hero)' => [
            'hero_title' => ['text', 'Tiêu đề lớn', 'Cứu hộ ô tô 24/7 tại Tuyên Quang'],
            'hero_sub' => ['textarea', 'Mô tả ngắn', 'Xe chết máy, hết bình, nổ lốp, kẹt đường hay tai nạn? Gọi ngay Gara Minh Kỳ — kỹ thuật viên hỗ trợ tại chỗ hoặc kéo xe về gara an toàn.'],
            'hero_image' => ['image', 'Ảnh nền Hero (tùy chọn)', ''],
            'trust' => ['lines', 'Ba điểm tin cậy — mỗi dòng "Tiêu đề | Mô tả"', "Tiếp nhận 24/7 | Gọi bất cứ lúc nào\nToàn tỉnh Tuyên Quang | Đường phố, quốc lộ, cao tốc\nBáo giá rõ ràng | Thống nhất chi phí trước khi thực hiện"],
        ],
        'Dịch vụ' => [
            'services_title' => ['text', 'Tiêu đề mục dịch vụ', 'Dịch vụ cứu hộ ô tô'],
            'services' => ['lines', 'Danh sách dịch vụ — mỗi dòng "Tên | Mô tả | Ảnh (tùy chọn)". Đặt con trỏ vào dòng rồi bấm «Tải ảnh cho dòng này»', "Sửa chữa lưu động | Chẩn đoán và xử lý sự cố nhỏ ngay tại hiện trường\nKéo xe – cẩu xe | Đưa xe hỏng, xe tai nạn về gara an toàn\nCâu bình – kích điện | Xe hết điện, không nổ được máy\nVá lốp – thay lốp dự phòng | Xử lý nổ lốp, xì lốp trên đường\nTiếp nhiên liệu khẩn cấp | Hỗ trợ khi xe hết xăng, hết dầu\nXe sa lầy – xuống mương | Hỗ trợ kéo xe bị kẹt, trượt khỏi mặt đường", 'line'],
        ],
        'Hình ảnh thực tế' => [
            'gallery_title' => ['text', 'Tiêu đề mục ảnh', 'Hình ảnh cứu hộ thực tế'],
            'gallery' => ['lines', 'Thư viện ảnh — mỗi dòng "Đường dẫn ảnh | Chú thích". Bấm «Tải ảnh lên và thêm» để thêm ảnh (chọn được nhiều ảnh). Để trống = ẩn mục này', '', 'append'],
        ],
        'Quy trình' => [
            'steps' => ['lines', 'Các bước — mỗi dòng "Bước | Mô tả"', "Gọi hotline | Cho biết vị trí và tình trạng xe\nXác nhận & báo giá | Điều phối viên báo phương án và chi phí dự kiến\nXuất phát | Kỹ thuật viên di chuyển đến hiện trường\nXử lý & bàn giao | Sửa tại chỗ hoặc kéo xe về gara"],
        ],
        'Khu vực' => [
            'areas_title' => ['text', 'Tiêu đề mục khu vực', 'Khu vực hỗ trợ'],
            'areas_intro' => ['textarea', 'Giới thiệu khu vực', 'Hỗ trợ trong phạm vi tỉnh Tuyên Quang. Nếu bạn ở xa hoặc không rõ vị trí, cứ gọi hotline để được xác nhận.'],
            'areas' => ['lines', 'Danh sách khu vực/tuyến đường — mỗi dòng một mục', "Khu vực trung tâm thành phố Tuyên Quang\nQuốc lộ 2\nQuốc lộ 37\nQuốc lộ 2C\nCao tốc Tuyên Quang – Phú Thọ\nCác huyện, xã trong tỉnh"],
        ],
        'Câu hỏi thường gặp' => [
            'faq' => ['lines', 'Mỗi dòng "Câu hỏi | Trả lời"', "Tôi cần cung cấp thông tin gì khi gọi cứu hộ? | Vị trí hiện tại (có thể gửi định vị qua Zalo), loại xe, biển số và tình trạng sự cố.\nChi phí cứu hộ được tính thế nào? | Tùy quãng đường và loại sự cố. Điều phối viên sẽ báo chi phí dự kiến trước khi xuất phát.\nCó hỗ trợ xe ngoài thành phố, trên quốc lộ không? | Có, trong phạm vi tỉnh Tuyên Quang. Hãy gọi hotline để xác nhận vị trí cụ thể."],
        ],
        'SEO & theo dõi' => [
            'seo_title' => ['text', 'Tiêu đề trang chủ (SEO)', 'Cứu hộ ô tô Tuyên Quang 24/7 – Gara Minh Kỳ'],
            'seo_desc' => ['textarea', 'Mô tả trang chủ (SEO, ~150 ký tự)', 'Dịch vụ cứu hộ ô tô tại Tuyên Quang của Gara Minh Kỳ: sửa chữa lưu động, kéo xe, câu bình, vá lốp. Gọi hotline để được hỗ trợ nhanh.'],
            'ga_id' => ['text', 'Mã Google Analytics (G-XXXXXXX, tùy chọn)', ''],
        ],
    ];
}

function settings_defaults(): array
{
    $out = [];
    foreach (settings_def() as $fields) {
        foreach ($fields as $key => $f) {
            $out[$key] = $f[2];
        }
    }
    return $out;
}

/** Giá trị cài đặt: DB ghi đè mặc định; giá trị rỗng do admin chủ động xóa vẫn được tôn trọng. */
function setting(string $key): string
{
    static $all = null;
    if ($all === null) {
        $all = settings_defaults();
        try {
            foreach (q_all('SELECT skey, svalue FROM settings') as $row) {
                $all[$row['skey']] = $row['svalue'];
            }
        } catch (Throwable) {
            // chưa có bảng settings: dùng mặc định
        }
    }
    return $all[$key] ?? '';
}

function hotline_is_placeholder(): bool
{
    return trim(setting('hotline')) === PLACEHOLDER_HOTLINE;
}
