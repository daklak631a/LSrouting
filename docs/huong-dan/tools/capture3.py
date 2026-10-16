"""Chụp toàn bộ ảnh hướng dẫn bản 15/10/2026, theo vai trò, trên giao diện hiện hành.

Chạy từng giai đoạn (dùng chung localStorage nên phải chạy liền một lệnh, hoặc nối bằng CAP_STATE_OUT / CAP_STATE_IN):
    py capture3.py pgd ks pgd2 ls ks2 ql admin gs
    py capture3.py pgd ks pgd2 mobile
Biến môi trường: GUIDE_OUT (thư mục ra), CAP_STATE_IN / CAP_STATE_OUT (trạng thái localStorage).

Kịch bản trong ngày thứ Năm 15/10/2026 (đồng hồ do script đặt): Phòng/PGD gửi hồ sơ từ 07:40, Kiểm soát phân công lúc 08:xx,
cán bộ LS tiếp nhận và làm từ 08:30, tạm dừng toàn bộ, ghi việc khác, làm thêm sau 17:30; báo cáo chụp lúc 18:50.
"""
import os
import sys
import traceback
from playwright.sync_api import sync_playwright
from cap3 import Cap, OUT

CUSTOMERS = [
    dict(name='Nguyễn Thị Lan', phone='0912345678', email='lan.nguyen@example.vn', vip=True,
         group='Thẻ tín dụng', product=None, cm=None, hd=None),
    dict(name='Công ty TNHH Bình An', phone='0987654321', email='ketoan@binhan.example.vn', vip=False,
         group='Thẻ tín dụng', product=None, cm=None, hd=None),
    dict(name='Trần Minh Quân', phone='0933222111', email='', vip=False,
         group='TSĐB', product='Nhập mới', cm=None, hd=1),
    dict(name='Lê Hoàng Nam', phone='0944555666', email='nam.le@example.vn', vip=False,
         group='Món', product='Vay mới SXKD', cm='MOI', hd=2),
]
LAN, BINHAN, QUAN, NAM = [c['name'] for c in CUSTOMERS]
HOANGGIA = 'Công ty CP Hoàng Gia'
VIET = 'Phạm Quốc Việt'
MINHPHAT = 'Công ty TNHH Minh Phát'


def next_workday():
    """Ngày làm việc kế tiếp (DD/MM/YYYY) so với ngày mẫu 15/10/2026 (thứ Năm) để gửi lại hồ sơ."""
    return '16/10/2026'


def row(page, text):
    return page.locator('tbody tr', has_text=text)


def pick_text(pg, selector, contains):
    """Chọn lựa chọn đầu tiên có chữ `contains` trong ô chọn (không phụ thuộc thứ tự)."""
    value = pg.evaluate("""([sel, txt]) => {
      const s = document.querySelector(sel); if (!s) return null;
      const o = [...s.options].find(o => o.textContent.toLowerCase().includes(txt.toLowerCase()));
      return o ? o.value : null; }""", [selector, contains])
    if value is None:
        raise RuntimeError('không thấy lựa chọn "%s" ở %s' % (contains, selector))
    pg.select_option(selector, value=value)


def close_dialog(c):
    c.page.locator('#dialog [data-act="close-dialog"]').first.click()
    c.settle(350)


def create_request(c, cust, shots=False):
    pg = c.page
    pg.click('[data-act="new-request"]')
    c.settle(500)
    pg.fill('[name=name]', cust['name'])
    pg.fill('[name=phone]', cust['phone'])
    if cust['email']:
        pg.fill('[name=email]', cust['email'])
    if cust['vip']:
        pg.check('[name=priority_vip]')
    if shots:
        c.shot('pgd-03-thong-tin-khach', [(pg.locator('[name=name]'), 1), (pg.locator('[name=phone]'), 2),
                                          (pg.locator('[name=priority_vip]').locator('xpath=..'), 3)],
               caption='Nhập thông tin khách hàng',
               legend=['Tên khách hàng (bắt buộc)', 'Điện thoại (và Email, CIF ở các ô bên cạnh)', 'Mức ưu tiên'])
    pg.select_option('[name=wg_0]', label=cust['group'])
    c.settle()
    if cust['product']:
        pick_text(pg, '[name=wt_0]', cust['product'])
    else:
        pg.select_option('[name=wt_0]', index=1)
    c.settle(300)
    if cust['cm'] and pg.locator('[name=cm_0]').count():
        pg.select_option('[name=cm_0]', value=cust['cm'])
        c.settle(300)
    if cust['hd'] and pg.locator('[name=request_hd_the_chap_0]').count():
        pg.fill('[name=request_hd_the_chap_0]', str(cust['hd']))
    pg.fill('[name=note]', 'Hồ sơ đủ giấy tờ, khách hẹn ký trong tuần.')
    if shots:
        marks = [(pg.locator('[name=wg_0]'), 1), (pg.locator('[name=wt_0]'), 2)]
        legend = ['Loại việc', 'Sản phẩm']
        if pg.locator('[name=cm_0]').first.is_visible():
            marks.append((pg.locator('[name=cm_0]'), len(marks) + 1))
            legend.append('Tình trạng TSBĐ')
        if pg.locator('[name=request_hd_the_chap_0]').first.is_visible():
            marks.append((pg.locator('[name=request_hd_the_chap_0]'), len(marks) + 1))
            legend.append('Số HĐ thế chấp cần soạn')
        marks += [(pg.locator('[name=dt_0]'), len(marks) + 1),
                  (pg.locator('#dialog .request-weekdays').first, len(marks) + 2),
                  (pg.locator('#dialog button[type=submit]').last, len(marks) + 3)]
        legend += ['Ngày phát sinh', 'Chọn nhanh theo thứ', 'Gửi sang LS']
        c.shot('pgd-04-chon-viec', marks, caption='Chọn việc và gửi sang LS', legend=legend)
    pg.locator('#dialog button[type=submit]').last.click()
    c.settle(700)


def shot_tsbd_form(c):
    """Biểu mẫu có TSBĐ mới: ô Tình trạng TSBĐ và Số HĐ thế chấp cần soạn nằm cạnh nhau."""
    pg = c.page
    pg.click('[data-act="new-request"]')
    c.settle(500)
    pg.fill('[name=name]', 'Lê Hoàng Nam')
    pg.select_option('[name=wg_0]', label='Món')
    c.settle()
    pick_text(pg, '[name=wt_0]', 'Vay mới SXKD')
    c.settle(300)
    pg.select_option('[name=cm_0]', value='MOI')
    c.settle(300)
    pg.fill('[name=request_hd_the_chap_0]', '2')
    c.shot('pgd-04a-tsbd-moi', [(pg.locator('[name=cm_0]'), 1), (pg.locator('[name=request_hd_the_chap_0]'), 2),
                                (pg.locator('#dialog .request-weekdays').first, 3)],
           caption='Việc có TSBĐ mới: số HĐ thế chấp cần soạn',
           legend=['Tình trạng TSBĐ: TSBĐ mới', 'Số HĐ thế chấp cần soạn', 'Chọn nhanh theo thứ'])
    close_dialog(c)


def stage_pgd(c):
    pg = c.page
    print('== Phòng/PGD')
    c.at(7, 40)
    c.shot('00-man-hinh-dang-nhap', [(pg.get_by_placeholder('Nhập mã cán bộ hoặc user được cấp'), 1),
                                     (pg.locator('[data-act="login-as"]').first, 2)],
           caption='Màn hình đăng nhập', legend=['Ô Mã cán bộ / user', 'Danh sách tài khoản thử nghiệm (chỉ có ở bản thử nghiệm)'])
    c.login('pgd_demo')
    c.shot('pgd-01-man-hinh-chinh', [(pg.locator('[data-act="new-request"]'), 1), (pg.locator('table').first, 2),
                                     (pg.locator('[data-act="edit-item"]').first, 3)],
           caption='Màn hình chính của Phòng/PGD',
           legend=['Nút Tạo việc mới', 'Danh sách hồ sơ đã gửi LS', 'Bút chì: sửa nhanh ngay trên dòng'])
    shot_tsbd_form(c)
    c.at(7, 48)
    create_request(c, CUSTOMERS[0], shots=True)
    c.shot('pgd-05-sau-khi-gui', [(row(pg, LAN).first, 1)], caption='Hồ sơ vừa gửi ở trạng thái Chờ phân công',
           legend=['Hồ sơ mới gửi'])
    c.at(7, 52)
    create_request(c, CUSTOMERS[1])
    c.at(7, 55)
    create_request(c, CUSTOMERS[2])
    c.at(7, 58)
    create_request(c, CUSTOMERS[3])
    # chi tiết hồ sơ vừa gửi
    row(pg, LAN).locator('[data-act="detail"]').click()
    c.settle(500)
    c.shot('pgd-06-chi-tiet-ho-so', [(pg.locator('#dialog').get_by_text('Phòng/PGD gửi hồ sơ lúc'), 1)],
           caption='Chi tiết hồ sơ', legend=['Giờ Phòng/PGD gửi hồ sơ (do hệ thống ghi)'])
    close_dialog(c)
    # hủy việc trực tiếp (Phòng/PGD hủy việc của mình, chọn lý do và xác nhận)
    row(pg, MINHPHAT).locator('[data-act="flow"][data-to="HUY"]').click()
    c.settle(500)
    c.shot('pgd-08-huy-viec', [(pg.locator('#dialog select'), 1), (pg.locator('#dialog textarea'), 2),
                               (pg.locator('#dialog button[type=submit]'), 3)],
           caption='Hủy việc', legend=['Lý do', 'Diễn giải thêm', 'Hủy việc'])
    close_dialog(c)


def pgd_unit(c):
    """Phòng/PGD của tài khoản pgd_demo, để KS đăng ký hộ và đặt quy tắc đúng phòng."""
    return c.page.evaluate("() => LS.db().users.find(u => u.login_code === 'pgd_demo').unit_id")


def register_for_unit(c, unit_id, name, phone, rows):
    """Điền hộp thoại Đăng ký hộ phòng đang mở. rows = [(loại việc, từ khóa sản phẩm)]."""
    pg = c.page
    pg.select_option('#dialog [name=unit_id]', value=unit_id)
    pg.fill('#dialog [name=name]', name)
    pg.fill('#dialog [name=phone]', phone)
    for n, (group, product) in enumerate(rows):
        if n:
            pg.click('[data-act="add-row"]')
            c.settle(300)
        pg.select_option('[name=wg_%d]' % n, label=group)
        c.settle()
        pick_text(pg, '[name=wt_%d]' % n, product)
    pg.fill('[name=note]', 'KS đăng ký hộ phòng theo điện thoại.')
    pg.locator('#dialog button[type=submit]').last.click()
    c.settle(800)


def stage_ks(c):
    pg = c.page
    print('== Kiểm soát LS')
    c.at(8, 5)
    c.login('ks_demo')
    unit = pgd_unit(c)
    c.settle(600)
    lan = row(pg, LAN)
    c.shot('ks-01-hang-cho', [(pg.locator('[data-act="batch-assign-open"]'), 1), (lan.first, 2),
                              (lan.locator('[data-act="flow"][data-to="DA_PHAN_CONG"]'), 3)],
           caption='Hàng chờ của Kiểm soát LS', legend=['Nút Phân công nhanh', 'Hồ sơ Phòng/PGD vừa gửi', 'Nút Phân công'])

    # đăng ký hộ phòng: tạo thêm hồ sơ chờ phân công cho phần Phân công nhanh
    c.at(8, 8)
    pg.click('[data-act="new-request"]')
    c.settle(500)
    c.shot('ks-08-dang-ky-ho-phong', [(pg.locator('#dialog select').first, 1)], caption='Đăng ký hộ phòng',
           legend=['Chọn Phòng / PGD gửi hồ sơ'])
    register_for_unit(c, unit, HOANGGIA, '0905123456', [('Món', 'cầm cố'), ('Thẻ tín dụng', 'tín chấp')])
    pg.click('[data-act="new-request"]')
    c.settle(500)
    register_for_unit(c, unit, VIET, '0966111222', [('Thấu chi', 'tiêu dùng')])

    # cấu hình phân công nhanh ngay trong Hàng chờ
    c.at(8, 12)
    pg.locator('[data-act="queue-view"][data-view="rules"]').first.click()
    c.settle(600)
    c.shot('ks-09-quy-tac-phan-cong', [(pg.locator('[data-act="assignment-rule-edit"]').first, 1)],
           caption='Cấu hình Phân công nhanh trong Hàng chờ', legend=['Thêm quy tắc'])
    pg.locator('[data-act="assignment-rule-edit"]').first.click()
    c.settle(500)
    pg.select_option('#dialog [name=unit_id]', value=unit)
    pg.select_option('#dialog [name=assignee_id]', index=0)   # cán bộ LS 1: nhận hồ sơ cầm cố và thẻ tín dụng của phòng
    pg.locator('#dialog input[data-rule-group="Thẻ tín dụng"]').check()
    pg.check('#dialog [name=auto_assign]')
    c.settle(200)
    pledge = pg.locator('#dialog label.check', has=pg.locator('input[value="LEGACY_09"]'))
    card_group = pg.locator('#dialog .rule-group', has=pg.locator('input[data-rule-group="Thẻ tín dụng"]'))
    c.shot('ks-09a-them-quy-tac', [(pg.locator('#dialog [name=unit_id]'), 1), (pg.locator('#dialog [name=assignee_id]'), 2),
                                   (pledge, 3), (card_group, 4), (pg.locator('#dialog button[type=submit]'), 5)],
           caption='Thêm quy tắc phân công',
           legend=['Phòng / PGD', 'Cán bộ LS phụ trách', 'Hồ sơ cầm cố tick sẵn', 'Tick thêm sản phẩm hoặc cả nhóm', 'Lưu quy tắc'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(700)
    c.shot('ks-09b-quy-tac-da-luu', [(pg.locator('table').first, 1)], caption='Quy tắc đã lưu', legend=['Bảng quy tắc'])
    pg.locator('[data-act="queue-view"][data-view=""]').first.click()
    c.settle(600)

    # phân công từng hồ sơ: tích chọn cán bộ (quy tắc đã gợi sẵn người phụ trách phòng)
    c.at(8, 20)
    lan.locator('[data-act="flow"][data-to="DA_PHAN_CONG"]').click()
    c.settle(500)
    c.shot('ks-02-hop-thoai-phan-cong', [(pg.locator('#dialog table'), 1), (pg.locator('#dialog [name=is_priority]').locator('xpath=..'), 2),
                                         (pg.locator('#dialog button[type=submit]'), 3)],
           caption='Hộp thoại phân công',
           legend=['Bảng cán bộ: tích chọn người phụ trách', 'Ưu tiên xử lý', 'Phân công cán bộ LS'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)

    # phân công hàng loạt: tích nhiều hồ sơ rồi giao cho một người
    c.at(8, 24)
    ids = [QUAN, NAM]
    for name in ids:
        for box in row(pg, name).locator('[data-act="pick-row"]').all():   # hồ sơ vay kèm TSBĐ mới có thêm dòng việc kèm
            box.check()
    c.settle()
    pick_text(pg, '#bulk-assignee', 'Lê Văn')
    c.shot('ks-03-phan-cong-hang-loat', [(row(pg, ids[0]).locator('[data-act="pick-row"]'), 1),
                                         (row(pg, ids[1]).locator('[data-act="pick-row"]'), 1),
                                         (pg.locator('#bulk-bar'), 2)],
           caption='Phân công nhiều hồ sơ cùng lúc', legend=['Tích chọn các hồ sơ', 'Thanh phân công hàng loạt'])
    pg.click('[data-act="bulk-assign"]')
    c.settle(900)

    # trả bổ sung
    c.at(8, 30)
    ba = row(pg, BINHAN)
    ba.locator('[data-act="detail"]').click()
    c.settle(500)
    c.shot('ks-04-chi-tiet-tra-bo-sung', [(pg.locator('#dialog [data-act="flow"][data-to="CAN_BO_SUNG"]'), 1)],
           caption='Nút Trả Phòng/PGD bổ sung trong chi tiết hồ sơ', legend=['Trả Phòng/PGD bổ sung'])
    pg.locator('#dialog [data-act="flow"][data-to="CAN_BO_SUNG"]').click()
    c.settle(500)
    pg.select_option('#dialog [name=reason_code]', index=1)
    c.shot('ks-05-ly-do-bo-sung', [(pg.locator('#dialog [name=reason_code]'), 1), (pg.locator('#dialog button[type=submit]'), 2)],
           caption='Chọn lý do trả bổ sung', legend=['Lý do', 'Xác nhận trả về'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)

    # Phân công nhanh: giao các hồ sơ còn lại theo quy tắc
    c.at(8, 36)
    c.shot('ks-06-hang-cho-con-lai', [(pg.locator('.unit-chips'), 1), (pg.locator('table').last, 2)],
           caption='Hồ sơ Chưa giao hồ sơ trong Hàng chờ', legend=['Các nút lọc theo phòng', 'Hồ sơ còn lại trong Hàng chờ'])
    pg.click('[data-act="batch-assign-open"]')
    c.settle(600)
    c.shot('ks-03b-phan-cong-nhanh', [(pg.locator('#dialog .batch-assign-summary'), 1),
                                      (pg.locator('#dialog [data-batch-include]').first, 2),
                                      (pg.locator('#dialog [data-act="batch-assign-submit"]'), 3)],
           caption='Phân công nhanh theo quy tắc',
           legend=['Số hồ sơ khớp quy tắc', 'Hồ sơ được tick sẵn', 'Giao các hồ sơ đã chọn'])
    pg.click('#dialog [data-act="batch-assign-submit"]')
    c.settle(900)


def stage_pgd2(c):
    pg = c.page
    print('== Phòng/PGD (bổ sung, theo dõi)')
    c.at(8, 50)
    c.login('pgd_demo')
    c.go('work')
    ba = row(pg, BINHAN)
    c.shot('pgd-07-can-bo-sung', [(ba.first, 1), (ba.locator('[data-act="flow"][data-to="CHO_PHAN_CONG"]'), 2)],
           caption='Hồ sơ Chưa giao hồ sơ', legend=['Hồ sơ Chưa giao hồ sơ', 'Nút Gửi lại'])
    ba.locator('[data-act="detail"]').click()
    c.settle(500)
    c.shot('pgd-07a-chi-tiet-can-bo-sung', [(pg.locator('#dialog [data-act="edit-item"]'), 1),
                                           (pg.locator('#dialog [data-act="flow"][data-to="CHO_PHAN_CONG"]'), 2)],
           caption='Chi tiết hồ sơ Chưa giao hồ sơ', legend=['Sửa thông tin', 'Gửi lại LS'])
    pg.locator('#dialog [data-act="flow"][data-to="CHO_PHAN_CONG"]').click()
    c.settle(500)
    pg.fill('#dialog [data-date-display-for]', next_workday())
    pg.keyboard.press('Tab')
    c.settle(300)
    c.shot('pgd-07b-gui-lai-ls', [(pg.locator('#dialog [data-request-date-context]'), 1), (pg.locator('#dialog button[type=submit]'), 2)],
           caption='Chọn ngày và gửi lại', legend=['Ngày KH đề nghị gửi lại', 'Gửi lại LS'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)
    # Hẹn bổ sung: hồ sơ đã giao cán bộ, chỉ nằm trong chi tiết
    c.at(8, 56)
    row(pg, LAN).locator('[data-act="detail"]').click()
    c.settle(500)
    c.shot('pgd-12-hen-bo-sung-nut', [(pg.locator('#dialog [data-act="supplement"]'), 1)],
           caption='Nút Hẹn bổ sung trong chi tiết hồ sơ', legend=['Hẹn bổ sung (không bắt buộc)'])
    pg.locator('#dialog [data-act="supplement"]').click()
    c.settle(500)
    pg.fill('#dialog [name=at]', '2026-10-16T09:30')
    pg.fill('#dialog [name=note]', 'Khách dời sang sáng mai, hẹn lại 09:30.')
    c.shot('pgd-12a-hen-bo-sung', [(pg.locator('#dialog [name=at]'), 1), (pg.locator('#dialog [name=note]'), 2),
                                   (pg.locator('#dialog button[type=submit]'), 3)],
           caption='Hẹn bổ sung', legend=['Ngày giờ hẹn', 'Ghi chú (không bắt buộc)', 'Lưu hẹn bổ sung'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)
    # sửa việc đã giao LS: gửi đề nghị sửa để Kiểm soát duyệt (đổi số điện thoại)
    c.at(9, 2)
    row(pg, QUAN).locator('[data-act="detail"]').click()
    c.settle(500)
    pg.locator('#dialog [data-act="edit-item"]').click()
    c.settle(500)
    pg.fill('#dialog [name="customer.phone"]', '0908123999')
    pg.fill('#dialog [name=reason]', 'Khách đổi số điện thoại liên hệ.')
    c.shot('pgd-08a-de-nghi-sua', [(pg.locator('#dialog .banner').first, 1), (pg.locator('#dialog [name=reason]'), 2),
                                   (pg.locator('#dialog button[type=submit]'), 3)],
           caption='Gửi đề nghị sửa việc đã giao LS',
           legend=['Thay đổi cần Kiểm soát duyệt', 'Lý do sửa', 'Gửi đề nghị sửa'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)

    # đổi ngày phát sinh vì khách dời lịch: hồ sơ chuyển sang ngày mai khi Kiểm soát duyệt
    c.at(9, 4)
    c.go('room')          # hồ sơ do Kiểm soát đăng ký hộ nằm ở Toàn bộ phòng
    c.settle(500)
    row(pg, HOANGGIA).filter(has_text='Tín chấp').locator('[data-act="edit-item"]').click()
    c.settle(500)
    pg.fill('#dialog [data-date-display-for]', '16/10/2026')
    pg.keyboard.press('Tab')
    pg.fill('#dialog [name=reason]', 'Khách dời lịch sang ngày mai.')
    c.shot('pgd-08b-doi-ngay-phat-sinh', [(pg.locator('#dialog [data-date-display-for]').first, 1),
                                          (pg.locator('#dialog [name=reason]'), 2), (pg.locator('#dialog button[type=submit]'), 3)],
           caption='Đổi ngày phát sinh khi khách dời lịch',
           legend=['Ngày phát sinh mới', 'Lý do sửa', 'Gửi đề nghị sửa'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)

    for scr, name, cap in [('room', 'pgd-09-toan-bo-phong', 'Toàn bộ hồ sơ của phòng'),
                           ('room-board', 'pgd-10-dashboard-phong', 'Dashboard phòng')]:
        c.go(scr)
        c.settle(700)
        c.shot(name, caption=cap, legend=[])
    c.go('audit')
    c.settle(600)
    c.shot('pgd-11a-nhat-ky-chua-xem', [(pg.locator('[data-act="audit-run"]'), 1)], caption='Nhật ký: bấm Xem nhật ký mới tải',
           legend=['Xem nhật ký'])
    pg.locator('[data-act="audit-run"]').click()
    c.settle(900)
    c.shot('pgd-11-nhat-ky', caption='Nhật ký của phòng', legend=[])



def stage_ks_approve(c):
    pg = c.page
    print('== Kiểm soát LS duyệt đề nghị sửa')
    c.at(9, 10)
    c.login('ks_demo')
    c.settle(700)
    c.shot('ks-13-de-nghi-sua-cho-duyet', [(pg.locator('[data-act="revision"][data-ok="1"]').first, 1),
                                           (pg.locator('[data-act="revision"][data-ok="0"]').first, 2)],
           caption='Đề nghị sửa chờ duyệt ở đầu Hàng chờ', legend=['Duyệt', 'Từ chối'])
    n = pg.locator('[data-act="revision"][data-ok="1"]').count()
    for _ in range(n):
        pg.locator('[data-act="revision"][data-ok="1"]').first.click()
        c.settle(700)


def dump(c, sel='#dialog', n=1500):
    txt = c.page.evaluate("""(sel) => { const m = document.querySelector(sel); return m ? m.innerText.split(String.fromCharCode(10)).join(' | ') : '(không có)'; }""", sel)
    print('   [%s] %s' % (sel, txt[:n]))


def start_work(c, who):
    """Bấm Làm ngay / Làm tiếp ở dòng của hồ sơ `who` trong Việc của tôi."""
    r = row(c.page, who)
    r.locator('[data-act="start-work"]').first.click()
    c.settle(700)


def stage_ls(c):
    pg = c.page
    print('== Cán bộ LS')
    c.at(9, 15)
    c.login('ls_demo_1')
    pg.set_viewport_size({'width': 1600, 'height': 1080})
    c.settle(600)
    c.shot('ls-01-dashboard-ca-nhan', [(pg.locator('[data-act="other-work"]'), 1), (pg.locator('[data-act="pause-all"]'), 2),
                                       (pg.locator('.personal-backlog-heading').first, 3), (pg.locator('[data-act="receive-all"]'), 4)],
           caption='Dashboard cá nhân đầu ngày',
           legend=['Ghi việc khác', 'Tạm dừng toàn bộ', 'Việc tồn: hôm nay và các ngày trước', 'Tiếp nhận tất cả'])
    pg.locator('.personal-backlog-detail > summary').first.click()
    c.settle(300)
    c.shot_box('ls-01a-viec-ton-chi-tiet', pg.locator('.personal-backlog'),
               [(pg.locator('.personal-backlog-counts').first, 1), (pg.locator('.personal-backlog-detail summary').first, 2)],
               caption='Việc tồn theo nhóm công việc', legend=['Số hồ sơ còn lại theo phần việc', 'Chi tiết việc (bấm để mở)'])
    pg.locator('.personal-backlog-detail > summary').first.click()
    c.settle(200)
    # tiếp nhận tất cả
    c.at(9, 18)
    pg.locator('[data-act="receive-all"]').click()
    c.settle(500)
    c.shot('ls-02-tiep-nhan-tat-ca', [(pg.locator('#dialog button[type=submit]'), 1)], caption='Xác nhận Tiếp nhận tất cả',
           legend=['Tiếp nhận các hồ sơ đã giao'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(1200)
    c.go('mine')
    c.settle(600)
    lan = row(pg, LAN)
    c.shot('ls-03-viec-cua-toi', [(pg.locator('.queue-tabs').first, 1), (row(pg, HOANGGIA).first, 2)], caption='Việc của tôi',
           legend=['Các tab theo tiến độ làm việc', 'Hồ sơ đang làm (hồ sơ đầu tiên được làm ngay)'])
    # làm Lan: Làm ngay → chuyển hồ sơ đang làm sang Chờ làm tiếp
    c.at(9, 20)
    lan.locator('[data-act="start-work"]').first.click()
    c.settle(800)
    c.shot('ls-04-lam-ngay', [(lan.locator('[data-act="flow"][data-to="DANG_HEN_KH"]'), 1), (row(pg, HOANGGIA).first, 2)],
           caption='Làm ngay một hồ sơ khác: hồ sơ cũ sang Chờ làm tiếp',
           legend=['Hồ sơ vừa bấm Làm ngay (Đang làm)', 'Hồ sơ trước đó chuyển sang Chờ làm tiếp'])
    lan.locator('[data-act="detail"]').click()
    c.settle(600)
    c.shot('ls-05-chi-tiet-da-tiep-nhan', [(pg.locator('#dialog').get_by_text('LS tiếp nhận hồ sơ lúc'), 1),
                                           (pg.locator('#dialog [data-act="credit-draft"]'), 2),
                                           (pg.locator('#dialog .section-title', has_text='Hẹn bổ sung'), 3)],
           caption='Chi tiết hồ sơ sau khi tiếp nhận',
           legend=['Giờ LS tiếp nhận hồ sơ', 'Xong HĐTD: ghi nhận đã soạn xong hợp đồng tín dụng',
                   'Lịch hẹn bổ sung của Phòng/PGD (nếu có)'])
    close_dialog(c)
    # hẹn khách ký
    c.at(10, 5)
    lan.locator('[data-act="flow"][data-to="DANG_HEN_KH"]').click()
    c.settle(600)
    c.shot('ls-06-hen-khach-ky', [(pg.locator('#dialog [name=appt_date]'), 1), (pg.locator('#dialog [name=appt_time]'), 2),
                                  (pg.locator('#dialog .chip-row'), 3), (pg.locator('#dialog button[type=submit]'), 4)],
           caption='Hẹn khách ký hồ sơ', legend=['Ngày ký', 'Giờ ký', 'Kênh báo khách', 'Hẹn khách ký hồ sơ'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(900)
    c.shot('ls-07-dang-hen-khach', [(lan.first, 1), (lan.locator('[data-act="flow"][data-to="HOAN_THANH_LS"]'), 2)],
           caption='Hồ sơ Đang hẹn khách ký', legend=['Trạng thái Đang hẹn khách ký', 'Nút Hoàn thành'])
    c.at(10, 20)
    lan.locator('[data-act="flow"][data-to="HOAN_THANH_LS"]').click()
    c.settle(600)
    c.shot('ls-08-hoan-thanh', [(pg.locator('#dialog textarea'), 1), (pg.locator('#dialog .f-stack'), 2),
                                (pg.locator('#dialog .chip-row'), 3), (pg.locator('#dialog button[type=submit]'), 4)],
           caption='Hoàn thành hồ sơ', legend=['Ghi chú kết quả', 'Kết quả ghi nhận vào bảng ngày', 'Cách thông báo', 'Hoàn thành'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(900)

    # việc TSĐB: làm, tick phần việc, hẹn ký, hoàn thành
    c.at(10, 25)
    quan = row(pg, QUAN)
    quan.locator('[data-act="start-work"]').first.click()
    c.settle(800)
    quan.locator('[data-act="detail"]').click()
    c.settle(600)
    c.at(10, 50)
    pg.locator('#dialog [data-act="step-toggle"][data-key="HD_THE_CHAP"]').check()
    c.settle(700)
    c.at(11, 5)
    pg.locator('#dialog [data-act="step-toggle"][data-key="NHAP_KHO"]').check()
    c.settle(700)
    c.shot('ls-05a-phan-viec-tsdb', [(pg.locator('#dialog [data-steps-box]').first, 1)],
           caption='Phần việc phải tick của việc TSĐB', legend=['Phần việc phải tick: soạn HĐ thế chấp, nhập kho'])
    close_dialog(c)
    c.at(11, 10)
    quan.locator('[data-act="flow"][data-to="DANG_HEN_KH"]').click()
    c.settle(500)
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)
    c.at(11, 20)
    quan.locator('[data-act="flow"][data-to="HOAN_THANH_LS"]').click()
    c.settle(600)
    c.shot('ls-08a-hoan-thanh-tsdb', [(pg.locator('#dialog button[type=submit]'), 1)],
           caption='Hoàn thành việc TSĐB', legend=['Hoàn thành'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(900)

    # tạm dừng một hồ sơ chờ khách (nút Tạm dừng ngay trên dòng)
    c.at(13, 35)
    ip = row(pg, MINHPHAT)
    ip.locator('[data-act="flow"][data-to="TAM_DUNG"]').click()
    c.settle(500)
    c.shot('ls-11-xac-nhan-tam-dung', [(pg.locator('#dialog button[type=submit]'), 1)], caption='Xác nhận Tạm dừng',
           legend=['Tạm dừng'])
    close_dialog(c)

    # Nam: vay kèm TSBĐ mới
    c.at(13, 40)
    start_work(c, NAM)
    # Ghi việc khác ngoài lượt tạm dừng
    c.at(13, 50)
    pg.locator('[data-act="other-work"]').first.click()
    c.settle(500)
    pg.fill('#dialog [name=qty_XEM_VAN_BAN]', '3')
    pg.fill('#dialog [name=qty_SAP_XEP_KHO]', '12')
    c.shot('ls-12c-ghi-viec-khac', [(pg.locator('#dialog .ow-list'), 1), (pg.locator('#dialog button[type=submit]'), 2)],
           caption='Ghi việc khác', legend=['Bảng việc khác: mỗi dòng một ô số lượng', 'Ghi nhận'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(900)

    # Tạm dừng toàn bộ: ghi nhận tác nghiệp khác (họp, báo cáo, hoàn thiện hồ sơ QTTD/TSBĐ)
    c.at(14, 30)
    pg.locator('[data-act="pause-all"]').first.click()
    c.settle(500)
    c.shot('ls-12-tam-dung-toan-bo', [(pg.locator('#dialog [name=category]'), 1), (pg.locator('#dialog button[type=submit]'), 2)],
           caption='Tạm dừng toàn bộ', legend=['Tạm dừng để làm (chọn công việc)', 'Bắt đầu tạm dừng'])
    pg.select_option('#dialog [name=category]', value='BAO_CAO')
    pg.locator('#dialog button[type=submit]').click()
    c.settle(1200)
    c.shot('ls-12a-dang-tam-dung', [(pg.locator('[data-act="global-pause-end"]'), 1)], caption='Đang tạm dừng toàn bộ',
           legend=['Kết thúc tạm dừng'])
    c.at(15, 5)
    pg.locator('[data-act="global-pause-end"]').click()
    c.settle(600)
    pg.fill('#dialog [name=qty_HOP_DAU_NGAY]', '1')
    pg.fill('#dialog [name=qty_XEM_VAN_BAN]', '5')
    pg.fill('#dialog [name=qty_SCAN_HOAN_THIEN]', '2')
    c.shot('ls-12b-ket-thuc-tam-dung', [(pg.locator('#dialog .ow-list'), 1), (pg.locator('#dialog button[type=submit]'), 2)],
           caption='Kết thúc tạm dừng: ghi việc đã làm trong lượt', legend=['Bảng việc khác của lượt tạm dừng', 'Kết thúc tạm dừng'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(1200)

    # làm thêm ngoài giờ: Hoàng Gia (món cầm cố) từ 17:35, hẹn ký 18:35
    c.at(17, 35)
    c.go('mine')
    c.settle(500)
    hg = row(pg, HOANGGIA).filter(has_text='Món')
    hg.locator('[data-act="start-work"]').first.click()
    c.settle(800)
    c.at(18, 35)
    hg.locator('[data-act="flow"][data-to="DANG_HEN_KH"]').first.click()
    c.settle(600)
    pg.locator('#dialog button[type=submit]').click()
    c.settle(900)
    c.at(18, 40)
    hg.locator('[data-act="flow"][data-to="HOAN_THANH_LS"]').first.click()
    c.settle(600)
    pg.locator('#dialog button[type=submit]').click()
    c.settle(900)

    stage_ls_end(c)


def stage_ls_end(c):
    """Số liệu cuối ngày của cán bộ LS (có thể chạy riêng từ trạng thái đã lưu)."""
    pg = c.page
    c.at(18, 50)
    if not pg.locator('[data-act="logout"]').count() or 'ls_demo_1' not in (pg.evaluate("() => (LS.db().users.find(u => u.user_id === LS.db().session) || {}).login_code || ''")):
        c.login('ls_demo_1')
        pg.set_viewport_size({'width': 1600, 'height': 1080})
    c.go('my-dashboard')
    c.settle(900)
    c.shot('ls-01b-dashboard-cuoi-ngay', [(pg.locator('.personal-backlog').first, 1), (pg.locator('.personal-result-report').first, 2)],
           caption='Dashboard cá nhân cuối ngày', legend=['Việc tồn còn lại', 'Kết quả thực hiện của riêng bạn'])
    pg.evaluate("() => document.querySelectorAll('.personal-backlog-detail').forEach(d => { d.open = true; })")
    c.settle(300)
    c.shot_box('ls-01f-viec-ton-cuoi-ngay', pg.locator('.personal-backlog'),
               [(pg.locator('.personal-backlog-counts').first, 1), (pg.locator('.backlog-kind-list').first, 2),
                (pg.locator('.personal-backlog-detail tbody tr .act-row').first, 3)],
               caption='Việc tồn cuối ngày: từng hồ sơ còn phần việc nào',
               legend=['Số hồ sơ còn lại theo phần việc', 'Phần việc còn tồn của hồ sơ', 'Thao tác ngay trên dòng'])
    pg.evaluate("() => document.querySelectorAll('.personal-backlog-detail').forEach(d => { d.open = false; })")
    c.settle(300)
    c.shot_box('ls-01c-ket-qua-thuc-hien', pg.locator('.personal-result-report'),
               [(pg.locator('.personal-result-report [data-date-display-for]').first, 1),
                (pg.locator('.personal-result-report [data-act="board-khac"]').first, 2)],
               caption='Kết quả thực hiện và tồn soạn đang mở của riêng bạn', legend=['Chọn ngày xem', 'Mũi tên bung các việc khác'])
    pg.locator('.personal-result-report [data-act="board-khac"]').first.click()
    c.settle(500)
    c.shot_box('ls-01d-khac-bung', pg.locator('.personal-result-report'),
               [(pg.locator('.personal-result-report .dm-child').first, 1)],
               caption='Dòng Khác bung ra từng loại việc', legend=['Chi tiết việc khác theo loại'])
    pg.locator('.personal-result-report [data-act="board-khac"]').first.click()
    c.settle(300)
    c.go('team')
    c.settle(800)
    c.shot('ls-14-phan-giao-phong', caption='Phân giao toàn phòng', legend=[])
    c.go('time-report')
    c.settle(600)
    pg.locator('button[type=submit]', has_text='Xem báo cáo').click()
    c.settle(1800)
    c.shot('ls-13-thoi-gian-sla', [(pg.locator('button[type=submit]', has_text='Xem báo cáo'), 1)],
           caption='Thời gian của tôi', legend=['Xem báo cáo'])
    c.go('audit')
    c.settle(800)
    c.shot('ls-15a-nhat-ky-chua-xem', [(pg.locator('[data-act="audit-run"]'), 1)], caption='Nhật ký: bấm Xem nhật ký mới tải',
           legend=['Xem nhật ký'])
    pg.locator('[data-act="audit-run"]').click()
    c.settle(900)
    c.shot('ls-15-nhat-ky', caption='Nhật ký của cán bộ', legend=[])
    c.go('my-dashboard')
    c.settle(600)
    pg.locator('[data-act="shortcuts"]').first.click()
    c.settle(500)
    c.shot('ls-17-phim-tat', caption='Phím tắt', legend=[])
    close_dialog(c)
    pg.locator('[data-act="my-absence"]').click()
    c.settle(500)
    c.shot('ls-16-khai-bao-nghi-phep', [(pg.locator('#dialog [name=off_from]'), 1), (pg.locator('#dialog button[type=submit]'), 2)],
           caption='Khai báo nghỉ phép', legend=['Nghỉ từ / Nghỉ đến', 'Lưu lịch nghỉ'])
    close_dialog(c)
    pg.set_viewport_size({'width': 1440, 'height': 1080})


def stage_ks2(c):
    """Kiểm soát xem lại sau khi cán bộ LS đã xử lý: Quản lý hồ sơ, Giao kế hoạch, Báo cáo."""
    pg = c.page
    print('== Kiểm soát LS (quản lý hồ sơ, kế hoạch, báo cáo)')
    c.at(18, 58)
    c.login('ks_demo')
    c.settle(600)
    c.go('tracking')
    c.settle(700)
    c.shot('ks-07-quan-ly-ho-so', [(pg.locator('.tracking-toolbar .queue-tabs'), 1), (pg.locator('.tracking-toolbar .unit-chips'), 2),
                                   (pg.locator('table').last, 3)],
           caption='Quản lý hồ sơ', legend=['Các tab theo tiến độ', 'Các nút lọc theo phòng', 'Danh sách hồ sơ đã giao'])
    pg.locator('.tracking-toolbar .unit-chip').nth(1).click()
    c.settle(500)
    c.shot('ks-07a-theo-phong', [(pg.locator('.tracking-toolbar .unit-chip.is-active'), 1), (pg.locator('.block-bar h2').first, 2)],
           caption='Xem hồ sơ của một phòng', legend=['Phòng đang xem', 'Tiêu đề nêu tên phòng'])
    pg.locator('.tracking-toolbar .queue-tabs button', has_text='Đang xử lý').click()
    c.settle(500)
    c.shot('ks-07b-dang-xu-ly', [(pg.locator('.tracking-toolbar .queue-tabs button', has_text='Đang xử lý'), 1), (pg.locator('table').last, 2)],
           caption='Tab Đang xử lý với nút Đổi người', legend=['Tab Đang xử lý', 'Danh sách hồ sơ đang xử lý'])

    c.go('board')
    c.settle(900)
    c.shot('ks-14-ket-qua-ke-hoach', [(pg.locator('[data-act="board-tab"]').first, 1), (pg.locator('[data-act="plan-edit"]'), 2),
                                      (pg.locator('[data-act="staff-absence"]'), 3)],
           caption='Kết quả & kế hoạch', legend=['Các tab góc nhìn', 'Nút Giao kế hoạch', 'Nghỉ phép cán bộ'])
    pg.locator('[data-act="staff-work-detail"]').first.click()
    c.settle(700)
    c.shot('ks-14c-viec-cua-can-bo', [(pg.locator('#dialog table').first, 1)], caption='Việc đang mở của một cán bộ',
           legend=['Hồ sơ, phần việc và tiến độ của cán bộ'])
    close_dialog(c)
    pg.locator('[data-act="staff-absence"]').click()
    c.settle(600)
    c.shot('ks-14d-nghi-phep-can-bo', [(pg.locator('#dialog table'), 1), (pg.locator('#dialog [data-act="staff-absence-edit"]').first, 2)],
           caption='Nghỉ phép cán bộ', legend=['Danh sách cán bộ và khoảng nghỉ đã cài', 'Cài lịch nghỉ'])
    close_dialog(c)
    pg.click('[data-act="plan-edit"]')
    c.settle(500)
    for name, value in [('plan_HD_THE_CHAP', '2'), ('plan_HD_TIN_DUNG', '4'), ('plan_RLOS', '3'),
                        ('target_done_month', '120'), ('target_done_staff_month', '15')]:
        if pg.locator('#dialog [name=%s]' % name).count():
            pg.fill('#dialog [name=%s]' % name, value)
    c.shot('ks-14a-giao-ke-hoach', [(pg.locator('#dialog [name=plan_HD_TIN_DUNG]'), 1), (pg.locator('#dialog [name=target_done_month]'), 2),
                                    (pg.locator('#dialog button[type=submit]'), 3)],
           caption='Giao kế hoạch', legend=['Kế hoạch ngày của từng dòng', 'Chỉ tiêu hoàn thành tháng', 'Lưu kế hoạch'])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)
    c.shot('ks-14b-ke-hoach-va-ket-qua', [(pg.locator('.dm-plan-h').first, 1), (pg.locator('[data-act="board-plan"]'), 2)],
           caption='Kế hoạch và % hoàn thành', legend=['Cột Kế hoạch ngày và % hoàn thành', 'Ẩn / hiện kế hoạch'])

    c.go('report')
    c.settle(600)
    pg.locator('[data-act="report-run"]').first.click()
    c.settle(2500)
    c.shot('ks-11-bao-cao', [(pg.locator('.hub-tabs'), 1), (pg.locator('[data-act="report-run"]').first, 2)],
           caption='Báo cáo nhiều kỳ', legend=['Các loại báo cáo', 'Chạy báo cáo'])
    pg.locator('[data-act="report-hub"][data-tab="time"]').click()
    c.settle(600)
    pg.locator('button[type=submit]', has_text='Xem báo cáo').click()
    c.settle(1800)
    c.shot('ks-10-thoi-gian-sla', [(pg.locator('.hub-tabs'), 1), (pg.locator('button[type=submit]', has_text='Xem báo cáo'), 2)],
           caption='Thời gian & SLA', legend=['Các loại báo cáo', 'Xem báo cáo'])
    pg.locator('[data-act="report-hub"][data-tab="plan"]').click()
    c.settle(700)
    c.shot('ks-12-ky-thang', [(pg.locator('.hub-tabs'), 1)], caption='Kế hoạch tháng', legend=['Các loại báo cáo'])


def stage_ql(c):
    pg = c.page
    print('== Quản lý LS')
    c.at(19, 5)
    c.login('ql_demo')
    c.settle(700)
    c.shot('ql-01-tong-hop', [(pg.locator('[data-act="board-tab"]').first, 1), (pg.locator('[data-act="plan-edit"]'), 2)],
           caption='Kết quả & kế hoạch', legend=['Các tab góc nhìn', 'Nút Giao kế hoạch'])
    pg.locator('[data-act="board-tab"]', has_text='Theo cán bộ').click()
    c.settle(600)
    c.shot('ql-02-theo-can-bo', [(pg.locator('[data-act="board-tab"]', has_text='Theo cán bộ'), 1)],
           caption='Kết quả theo cán bộ', legend=['Tab Theo cán bộ'])
    c.go('tracking')
    c.settle(700)
    pg.locator('.tracking-toolbar .queue-tabs button', has_text='Đang xử lý').click()
    c.settle()
    rows = pg.locator('[data-act="quick-assign"]')
    if rows.count():
        c.shot('ql-03-dang-xu-ly-doi-nguoi', [(rows.first, 1)], caption='Nút Đổi người', legend=['Đổi người'])
        rows.first.click()
        c.settle(500)
        pg.locator('#dialog input[name=assignee]').last.check()
        c.shot('ql-04-doi-nguoi', [(pg.locator('#dialog table'), 1), (pg.locator('#dialog [name=reason]'), 2),
                                   (pg.locator('#dialog button[type=submit]'), 3)],
               caption='Chuyển người khác',
               legend=['Bảng cán bộ: tích chọn người mới', 'Lý do (bắt buộc)', 'Chuyển người khác'])
        close_dialog(c)
    # chi tiết hồ sơ đã hoàn thành: kết quả ghi nhận và nút sửa
    pg.locator('.tracking-toolbar .queue-tabs button', has_text='Hoàn thành').click()
    c.settle(500)
    done = pg.locator('[data-act="detail"]')
    if done.count():
        done.first.click()
        c.settle(600)
        c.shot('ql-07-chi-tiet-hoan-thanh', [(pg.locator('#dialog').get_by_text('Kết quả ghi nhận'), 1),
                                             (pg.locator('#dialog [data-act="edit-result-flags"]'), 2)],
               caption='Chi tiết hồ sơ đã hoàn thành', legend=['Kết quả ghi nhận', 'Sửa ghi nhận kết quả'])
        close_dialog(c)


def admin_tab(c, text, name, caption, marks=(), legend=()):
    pg = c.page
    pg.locator('[data-act="admin-go"]', has_text=text).first.click()
    c.settle(700)
    c.shot(name, marks, caption=caption, legend=legend)


def stage_admin(c):
    pg = c.page
    print('== Quản trị')
    c.at(19, 15)
    c.login('admin')
    c.settle(600)
    c.shot('adm-01-tong-quan', [(pg.locator('[data-act="admin-go"]', has_text='Người dùng').first, 1)],
           caption='Tổng quan quản trị', legend=['Menu Người dùng'])
    admin_tab(c, 'Người dùng', 'adm-02-nguoi-dung', 'Danh sách người dùng')
    btn = pg.locator('[data-act="user-edit"]')
    if btn.count():
        btn.first.click()
        c.settle(500)
        c.shot('adm-03-sua-nguoi-dung', caption='Sửa người dùng', legend=[])
        close_dialog(c)
    admin_tab(c, 'Loại việc', 'adm-04-loai-viec', 'Danh mục loại việc')
    pg.locator('[data-act="type-edit"][data-code]').first.click()
    c.settle(500)
    c.shot('adm-05-sua-loai-viec', [(pg.locator('#dialog [name=needs_appointment]').locator('xpath=..'), 1),
                                    (pg.locator('#dialog [name=sla_hours]'), 2)],
           caption='Sửa loại việc', legend=['Cần hẹn khách ký hồ sơ', 'SLA (giờ làm việc)'])
    close_dialog(c)
    admin_tab(c, 'Kênh gửi tin', 'adm-06-kenh-gui-tin', 'Kênh gửi tin')
    admin_tab(c, 'Quy tắc thông báo', 'adm-07-quy-tac-thong-bao', 'Quy tắc thông báo')
    admin_tab(c, 'Lịch làm việc', 'adm-08-lich-lam-viec', 'Lịch làm việc')
    admin_tab(c, 'Cấu hình chung', 'adm-09-cau-hinh-chung', 'Cấu hình chung')
    admin_tab(c, 'Phân công nhanh', 'adm-10-phan-cong-nhanh', 'Phân công nhanh')
    admin_tab(c, 'Thông báo phiên bản', 'adm-11-thong-bao-phien-ban', 'Thông báo phiên bản')
    admin_tab(c, 'Nhật ký cấu hình', 'adm-12-nhat-ky-cau-hinh', 'Nhật ký cấu hình')


def stage_gs(c):
    pg = c.page
    print('== Giám sát')
    pg.evaluate("""() => {
      const s = JSON.parse(localStorage.getItem('ls_routing_v3'));
      if (!s.users.some(u => u.login_code === 'gs_demo'))
        s.users.push({ user_id: 'U007', login_code: 'gs_demo', auth_group: 'INTERNAL', full_name: 'Đỗ Giám Sát', email: 'giamsat@bank.vn', role: 'GIAM_SAT', unit_id: 'HE_THONG', active: true });
      localStorage.setItem('ls_routing_v3', JSON.stringify(s));
    }""")
    pg.reload()
    c.at(19, 25)
    c.settle(700)
    if pg.locator('[data-act="logout"]').count():
        pg.locator('[data-act="logout"]').first.click()
        c.settle()
    c.login('gs_demo')
    c.settle(700)
    c.shot('gs-01-tong-hop', caption='Tổng hợp của Giám sát', legend=[])
    c.go('time-report')
    c.settle(600)
    pg.locator('button[type=submit]', has_text='Xem báo cáo').click()
    c.settle(1800)
    c.shot('gs-02-thoi-gian-sla', [(pg.locator('button[type=submit]', has_text='Xem báo cáo'), 1)],
           caption='Thời gian & SLA', legend=['Xem báo cáo'])
    c.go('report')
    c.settle(600)
    pg.locator('[data-act="report-run"]').first.click()
    c.settle(2500)
    c.shot('gs-03-bao-cao', [(pg.locator('[data-act="report-run"]').first, 1)], caption='Báo cáo', legend=['Chạy báo cáo'])


def stage_mobile(p, c):
    """Điện thoại: dùng lại dữ liệu của lượt chụp máy tính."""
    print('== Điện thoại')
    if c.page.locator('[data-act="logout"]').count():
        c.page.locator('[data-act="logout"]').first.click()
        c.settle(500)
    state = c.ctx.storage_state()
    m = Cap(p, width=390, height=844, mobile=True, storage_state=state, start=(18, 56))
    m.login('ls_demo_1')
    m.go('mine')
    m.settle(700)
    m.shot('mobile-01-viec-cua-toi', caption='Việc của tôi trên điện thoại', legend=[])
    m.go('my-dashboard')
    m.settle(700)
    m.shot('mobile-02-dashboard', caption='Dashboard cá nhân trên điện thoại', legend=[])
    m.go('mine')
    m.settle(500)
    m.page.locator('[data-act="detail"]').first.click()
    m.settle(700)
    m.shot('mobile-03-chi-tiet', caption='Chi tiết hồ sơ trên điện thoại', legend=[])
    m.close()


def main():
    stages = sys.argv[1:] or ['pgd', 'ks', 'pgd2']
    with sync_playwright() as p:
        c = Cap(p)
        try:
            for s in stages:
                if s == 'mobile':
                    stage_mobile(p, c)
                else:
                    globals()['stage_' + s](c)
        except Exception:
            traceback.print_exc()
            c.page.screenshot(path=os.path.join(OUT, '_debug.png'))
        print('lỗi trang:', c.errors)
        c.close()


if __name__ == '__main__':
    main()
