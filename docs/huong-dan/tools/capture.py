"""Chụp toàn bộ ảnh hướng dẫn theo vai trò. Xem cap.py để biết cách chạy."""
import os
import sys
import traceback
from playwright.sync_api import sync_playwright
from cap import Cap, OUT

CUSTOMERS = [
    dict(name='Nguyễn Thị Lan', phone='0912345678', email='lan.nguyen@example.vn', vip=True,
         group='Thẻ tín dụng', product=None, cm=None, hd=None),
    dict(name='Công ty TNHH Bình An', phone='0987654321', email='ketoan@binhan.example.vn', vip=False,
         group='Thẻ tín dụng', product=None, cm=None, hd=None),
    dict(name='Trần Minh Quân', phone='0933222111', email='', vip=False,
         group='TSĐB', product='Nhập mới', cm=None, hd=1),
]


def next_workday():
    """Ngày làm việc kế tiếp (DD/MM/YYYY) để gửi lại hồ sơ."""
    import datetime
    d = datetime.date.today() + datetime.timedelta(days=1)
    while d.weekday() > 4:
        d += datetime.timedelta(days=1)
    return d.strftime('%d/%m/%Y')


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
                                          (pg.locator('[name=priority_vip]').locator('xpath=..'), 3)])
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
        if pg.locator('[name=cm_0]').first.is_visible():
            marks.append((pg.locator('[name=cm_0]'), len(marks) + 1))
        if pg.locator('[name=request_hd_the_chap_0]').first.is_visible():
            marks.append((pg.locator('[name=request_hd_the_chap_0]'), len(marks) + 1))
        marks += [(pg.locator('[name=dt_0]'), len(marks) + 1),
                  (pg.locator('#dialog .request-weekdays').first, len(marks) + 2),
                  (pg.locator('#dialog button[type=submit]').last, len(marks) + 3)]
        c.shot('pgd-04-chon-viec', marks)
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
                                (pg.locator('#dialog .request-weekdays').first, 3)])
    pg.click('[data-act="close-dialog"]')
    c.settle(400)


def stage_pgd(c):
    pg = c.page
    print('== Phòng/PGD')
    c.shot('00-man-hinh-dang-nhap', [(pg.get_by_placeholder('Nhập mã cán bộ hoặc user được cấp'), 1),
                                     (pg.locator('[data-act="login-as"]').first, 2)])
    c.login('pgd_demo')
    c.shot('pgd-01-man-hinh-chinh', [(pg.locator('[data-act="new-request"]'), 1), (pg.locator('table').first, 2)])
    shot_tsbd_form(c)
    create_request(c, CUSTOMERS[0], shots=True)
    c.shot('pgd-05-sau-khi-gui', [(row(pg, CUSTOMERS[0]['name']).first, 1)])
    create_request(c, CUSTOMERS[1])
    create_request(c, CUSTOMERS[2])
    # chi tiết hồ sơ vừa gửi
    row(pg, CUSTOMERS[0]['name']).locator('[data-act="detail"]').click()
    c.settle(500)
    c.shot('pgd-06-chi-tiet-ho-so', [(pg.locator('#dialog').get_by_text('Phòng/PGD gửi hồ sơ lúc'), 1)])
    pg.click('[data-act="close-dialog"]')
    c.settle()
    # hủy việc trực tiếp (Phòng/PGD hủy việc của mình, chọn lý do và xác nhận)
    row(pg, 'Công ty TNHH Minh Phát').locator('[data-act="flow"][data-to="HUY"]').click()
    c.settle(500)
    c.shot('pgd-08-huy-viec', [(pg.locator('#dialog select'), 1), (pg.locator('#dialog textarea'), 2),
                               (pg.locator('#dialog button[type=submit]'), 3)])
    pg.click('[data-act="close-dialog"]')
    c.settle(500)

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
    c.login('ks_demo')
    unit = pgd_unit(c)
    c.settle(600)
    lan = row(pg, CUSTOMERS[0]['name'])
    c.shot('ks-01-hang-cho', [(pg.locator('[data-act="batch-assign-open"]'), 1), (lan.first, 2),
                              (lan.locator('[data-act="flow"][data-to="DA_PHAN_CONG"]'), 3)])

    # đăng ký hộ phòng: tạo thêm hồ sơ chờ phân công cho phần Phân công nhanh
    pg.click('[data-act="new-request"]')
    c.settle(500)
    c.shot('ks-08-dang-ky-ho-phong', [(pg.locator('#dialog select').first, 1)])
    register_for_unit(c, unit, 'Công ty CP Hoàng Gia', '0905123456', [('Món', 'cầm cố'), ('Thẻ tín dụng', 'tín chấp')])
    pg.click('[data-act="new-request"]')
    c.settle(500)
    register_for_unit(c, unit, 'Phạm Quốc Việt', '0966111222', [('Thấu chi', 'tiêu dùng')])

    # cấu hình phân công nhanh ngay trong Hàng chờ
    pg.locator('[data-act="queue-view"][data-view="rules"]').first.click()
    c.settle(600)
    c.shot('ks-09-quy-tac-phan-cong', [(pg.locator('[data-act="assignment-rule-edit"]').first, 1)])
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
                                   (pledge, 3), (card_group, 4), (pg.locator('#dialog button[type=submit]'), 5)])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(700)
    c.shot('ks-09b-quy-tac-da-luu', [(pg.locator('table').first, 1)])
    pg.locator('[data-act="queue-view"][data-view=""]').first.click()
    c.settle(600)

    # phân công từng hồ sơ: tích chọn cán bộ (quy tắc đã gợi sẵn người phụ trách phòng)
    lan.locator('[data-act="flow"][data-to="DA_PHAN_CONG"]').click()
    c.settle(500)
    c.shot('ks-02-hop-thoai-phan-cong', [(pg.locator('#dialog table'), 1), (pg.locator('#dialog [name=is_priority]').locator('xpath=..'), 2),
                                         (pg.locator('#dialog button[type=submit]'), 3)])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)

    # phân công hàng loạt: tích nhiều hồ sơ rồi giao cho một người
    ids = [CUSTOMERS[2]['name'], 'Phạm Quốc Việt']
    for name in ids:
        row(pg, name).locator('[data-act="pick-row"]').check()
    c.settle()
    pick_text(pg, '#bulk-assignee', 'Lê Văn')
    c.shot('ks-03-phan-cong-hang-loat', [(row(pg, ids[0]).locator('[data-act="pick-row"]'), 1),
                                         (row(pg, ids[1]).locator('[data-act="pick-row"]'), 1),
                                         (pg.locator('#bulk-bar'), 2)])
    pg.click('[data-act="bulk-assign"]')
    c.settle(900)

    # trả bổ sung
    ba = row(pg, CUSTOMERS[1]['name'])
    ba.locator('[data-act="detail"]').click()
    c.settle(500)
    c.shot('ks-04-chi-tiet-tra-bo-sung', [(pg.locator('#dialog [data-act="flow"][data-to="CAN_BO_SUNG"]'), 1)])
    pg.locator('#dialog [data-act="flow"][data-to="CAN_BO_SUNG"]').click()
    c.settle(500)
    pg.select_option('#dialog [name=reason_code]', index=1)
    c.shot('ks-05-ly-do-bo-sung', [(pg.locator('#dialog [name=reason_code]'), 1),
                                   (pg.locator('#dialog button[type=submit]'), 2)])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)

    # Phân công nhanh: giao các hồ sơ còn lại theo quy tắc
    c.shot('ks-06-hang-cho-con-lai', [(pg.locator('.unit-chips'), 1), (pg.locator('table').last, 2)])
    pg.click('[data-act="batch-assign-open"]')
    c.settle(600)
    c.shot('ks-03b-phan-cong-nhanh', [(pg.locator('#dialog .batch-assign-summary'), 1),
                                      (pg.locator('#dialog [data-batch-include]').first, 2),
                                      (pg.locator('#dialog [data-act="batch-assign-submit"]'), 3)])
    pg.click('#dialog [data-act="batch-assign-submit"]')
    c.settle(900)


def stage_ks2(c):
    """Kiểm soát xem lại sau khi cán bộ LS đã xử lý: Quản lý hồ sơ, Giao kế hoạch, Báo cáo."""
    pg = c.page
    print('== Kiểm soát LS (quản lý hồ sơ, kế hoạch, báo cáo)')
    c.login('ks_demo')
    c.settle(600)
    c.shot('ks-13-de-nghi-sua-cho-duyet', [(pg.locator('[data-act="revision"][data-ok="1"]').first, 1),
                                           (pg.locator('[data-act="revision"][data-ok="0"]').first, 2)])
    c.go('tracking')
    c.settle(700)
    c.shot('ks-07-quan-ly-ho-so', [(pg.locator('.tracking-toolbar .queue-tabs'), 1), (pg.locator('.tracking-toolbar .unit-chips'), 2),
                                   (pg.locator('table').last, 3)])
    pg.locator('.tracking-toolbar .unit-chip').nth(1).click()
    c.settle(500)
    c.shot('ks-07a-theo-phong', [(pg.locator('.tracking-toolbar .unit-chip.is-active'), 1), (pg.locator('.block-bar h2').first, 2)])
    pg.locator('.tracking-toolbar .queue-tabs button', has_text='Đang xử lý').click()
    c.settle(500)
    c.shot('ks-07b-dang-xu-ly', [(pg.locator('.tracking-toolbar .queue-tabs button', has_text='Đang xử lý'), 1), (pg.locator('table').last, 2)])

    c.go('board')
    c.settle(700)
    c.shot('ks-14-ket-qua-ke-hoach', [(pg.locator('[data-act="board-tab"]').first, 1), (pg.locator('[data-act="plan-edit"]'), 2)])
    pg.click('[data-act="plan-edit"]')
    c.settle(500)
    for name, value in [('plan_HD_THE_CHAP', '2'), ('plan_HD_TIN_DUNG', '4'), ('plan_RLOS', '3'), ('plan_TON_TIN_DUNG', '', ),
                        ('target_done_month', '120'), ('target_done_staff_month', '15')]:
        if value:
            pg.fill('#dialog [name=%s]' % name, value)
    c.shot('ks-14a-giao-ke-hoach', [(pg.locator('#dialog [name=plan_HD_TIN_DUNG]'), 1), (pg.locator('#dialog [name=target_done_month]'), 2),
                                    (pg.locator('#dialog button[type=submit]'), 3)])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)
    c.shot('ks-14b-ke-hoach-va-ket-qua', [(pg.locator('.dm-plan-h').first, 1), (pg.locator('[data-act="board-plan"]'), 2)])

    c.go('report')
    c.settle(600)
    pg.locator('[data-act="report-run"]').first.click()
    c.settle(2500)
    c.shot('ks-11-bao-cao', [(pg.locator('.hub-tabs'), 1), (pg.locator('[data-act="report-run"]').first, 2)])
    pg.locator('[data-act="report-hub"][data-tab="time"]').click()
    c.settle(600)
    pg.locator('button[type=submit]', has_text='Xem báo cáo').click()
    c.settle(1800)
    c.shot('ks-10-thoi-gian-sla', [(pg.locator('.hub-tabs'), 1), (pg.locator('button[type=submit]', has_text='Xem báo cáo'), 2)])
    pg.locator('[data-act="report-hub"][data-tab="plan"]').click()
    c.settle(700)
    c.shot('ks-12-ky-thang', [(pg.locator('.hub-tabs'), 1)])


def stage_ls(c):
    pg = c.page
    print('== Cán bộ LS')
    c.login('ls_demo_1')
    pg.set_viewport_size({'width': 1600, 'height': 1080})
    c.settle(500)
    c.shot('ls-01-dashboard-ca-nhan', [(pg.locator('[data-act="pause-all"]'), 1)])
    c.go('mine')
    c.settle(600)
    lan = row(pg, CUSTOMERS[0]['name'])
    c.shot('ls-02-viec-cua-toi', [(pg.locator('.queue-tabs').first, 1), (lan.first, 2),
                                  (lan.locator('[data-act="flow"][data-to="DANG_THUC_HIEN"]'), 3)])
    lan.locator('[data-act="flow"][data-to="DANG_THUC_HIEN"]').click()
    c.settle(500)
    c.shot('ls-03-tiep-nhan-ho-so', [(pg.locator('#dialog fieldset'), 1), (pg.locator('#dialog button[type=submit]'), 2)])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)
    c.shot('ls-04-da-tiep-nhan', [(lan.first, 1), (lan.locator('[data-act="flow"][data-to="DANG_HEN_KH"]'), 2)])
    lan.locator('[data-act="detail"]').click()
    c.settle(500)
    c.shot('ls-05-chi-tiet-da-tiep-nhan', [(pg.locator('#dialog').get_by_text('LS tiếp nhận hồ sơ lúc'), 1)])
    pg.click('[data-act="close-dialog"]')
    c.settle()
    lan.locator('[data-act="flow"][data-to="DANG_HEN_KH"]').click()
    c.settle(500)
    c.shot('ls-06-hen-khach-ky', [(pg.locator('#dialog [name=appt_date]'), 1), (pg.locator('#dialog [name=appt_time]'), 2),
                                  (pg.locator('#dialog .chip-row'), 3), (pg.locator('#dialog button[type=submit]'), 4)])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)
    c.shot('ls-07-dang-hen-khach', [(lan.first, 1), (lan.locator('[data-act="flow"][data-to="HOAN_THANH_LS"]'), 2)])
    lan.locator('[data-act="flow"][data-to="HOAN_THANH_LS"]').click()
    c.settle(500)
    c.shot('ls-08-hoan-thanh', [(pg.locator('#dialog textarea'), 1), (pg.locator('#dialog .f-stack'), 2),
                                (pg.locator('#dialog .chip-row'), 3), (pg.locator('#dialog button[type=submit]'), 4)])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(900)
    c.shot('ls-09-sau-hoan-thanh')

    # việc TSĐB: tiếp nhận rồi tick phần việc ngay trong hộp thoại Hoàn thành
    quan = row(pg, CUSTOMERS[2]['name'])
    quan.locator('[data-act="flow"][data-to="DANG_THUC_HIEN"]').click()
    c.settle(500)
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)
    quan.locator('[data-act="detail"]').click()
    c.settle(600)
    c.shot('ls-05a-phan-viec-tsdb', [(pg.locator('#dialog [data-steps-box]').first, 1)])
    pg.click('[data-act="close-dialog"]')
    c.settle()
    quan.locator('[data-act="flow"][data-to="DANG_HEN_KH"]').click()
    c.settle(500)
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)
    quan.locator('[data-act="flow"][data-to="HOAN_THANH_LS"]').click()
    c.settle(600)
    c.shot('ls-08a-hoan-thanh-tsdb', [(pg.locator('#dialog [name^=step_]').first.locator('xpath=ancestor::*[contains(@class,"f-stack") or self::fieldset][1]'), 1),
                                      (pg.locator('#dialog button[type=submit]'), 2)])
    pg.click('#dialog [data-act="close-dialog"]')
    c.settle()

    # tạm dừng một việc đang xử lý (nút Tạm dừng ngay trên dòng)
    ip = row(pg, 'Công ty TNHH Minh Phát')
    ip.locator('[data-act="flow"][data-to="TAM_DUNG"]').click()
    c.settle(500)
    c.shot('ls-11-xac-nhan-tam-dung', [(pg.locator('#dialog button[type=submit]'), 1)])
    pg.click('#dialog [data-act="close-dialog"]')
    c.settle()

    # một hồ sơ đang làm dở để các màn của Kiểm soát/Quản lý có việc "Đang xử lý"
    viet = row(pg, 'Phạm Quốc Việt')
    viet.locator('[data-act="flow"][data-to="DANG_THUC_HIEN"]').click()
    c.settle(500)
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)

    # Tạm dừng toàn bộ: ghi nhận tác nghiệp khác (họp, báo cáo, hoàn thiện hồ sơ QTTD/TSBĐ)
    pg.locator('[data-act="pause-all"]').click()
    c.settle(500)
    c.shot('ls-12-tam-dung-toan-bo', [(pg.locator('#dialog [name=category]'), 1), (pg.locator('#dialog button[type=submit]'), 2)])
    pg.select_option('#dialog [name=category]', value='BAO_CAO')
    pg.locator('#dialog button[type=submit]').click()
    c.settle(1200)
    c.shot('ls-12a-dang-tam-dung', [(pg.locator('[data-act="global-pause-end"]'), 1)])
    pg.locator('[data-act="global-pause-end"]').click()
    c.settle(1200)

    c.go('team')
    c.settle(800)
    c.shot('ls-14-phan-giao-phong')
    c.go('time-report')
    c.settle(600)
    pg.locator('button[type=submit]', has_text='Xem báo cáo').click()
    c.settle(1800)
    c.shot('ls-13-thoi-gian-sla', [(pg.locator('button[type=submit]', has_text='Xem báo cáo'), 1)])
    c.go('audit')
    c.settle(800)
    c.shot('ls-15-nhat-ky')
    pg.set_viewport_size({'width': 1440, 'height': 1080})


def stage_pgd2(c):
    pg = c.page
    print('== Phòng/PGD (bổ sung, theo dõi)')
    c.login('pgd_demo')
    c.go('work')
    ba = row(pg, CUSTOMERS[1]['name'])
    c.shot('pgd-07-can-bo-sung', [(ba.first, 1), (ba.locator('[data-act="flow"][data-to="CHO_PHAN_CONG"]'), 2)])
    ba.locator('[data-act="detail"]').click()
    c.settle(500)
    c.shot('pgd-07a-chi-tiet-can-bo-sung', [(pg.locator('#dialog [data-act="edit-item"]'), 1),
                                           (pg.locator('#dialog [data-act="flow"][data-to="CHO_PHAN_CONG"]'), 2)])
    pg.locator('#dialog [data-act="flow"][data-to="CHO_PHAN_CONG"]').click()
    c.settle(500)
    pg.fill('#dialog [data-date-display-for]', next_workday())
    pg.keyboard.press('Tab')
    c.settle(300)
    c.shot('pgd-07b-gui-lai-ls', [(pg.locator('#dialog [data-request-date-context]'), 1), (pg.locator('#dialog button[type=submit]'), 2)])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)
    # sửa việc đã giao LS: gửi đề nghị sửa để Kiểm soát duyệt
    row(pg, CUSTOMERS[2]['name']).locator('[data-act="detail"]').click()
    c.settle(500)
    pg.locator('#dialog [data-act="edit-item"]').click()
    c.settle(500)
    pg.fill('#dialog [name="customer.phone"]', '0908123999')
    pg.fill('#dialog [name=reason]', 'Khách đổi số điện thoại liên hệ.')
    c.shot('pgd-08a-de-nghi-sua', [(pg.locator('#dialog .banner').first, 1), (pg.locator('#dialog [name=reason]'), 2),
                                   (pg.locator('#dialog button[type=submit]'), 3)])
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)


    for scr, name in [('room', 'pgd-09-toan-bo-phong'), ('room-board', 'pgd-10-dashboard-phong'), ('audit', 'pgd-11-nhat-ky')]:
        c.go(scr)
        c.settle(700)
        c.shot(name)


def stage_ql(c):
    pg = c.page
    print('== Quản lý LS')
    c.login('ql_demo')
    c.settle(700)
    c.shot('ql-01-tong-hop', [(pg.locator('[data-act="board-tab"]').first, 1), (pg.locator('[data-act="plan-edit"]'), 2)])
    pg.locator('[data-act="board-tab"]', has_text='Theo cán bộ').click()
    c.settle(600)
    c.shot('ql-02-theo-can-bo', [(pg.locator('[data-act="board-tab"]', has_text='Theo cán bộ'), 1)])
    c.go('tracking')
    c.settle(700)
    pg.locator('.tracking-toolbar .queue-tabs button', has_text='Đang xử lý').click()
    c.settle()
    rows = pg.locator('[data-act="quick-assign"]')
    if rows.count():
        c.shot('ql-03-dang-xu-ly-doi-nguoi', [(rows.first, 1)])
        rows.first.click()
        c.settle(500)
        pg.locator('#dialog input[name=assignee]').last.check()
        c.shot('ql-04-doi-nguoi', [(pg.locator('#dialog table'), 1), (pg.locator('#dialog [name=reason]'), 2),
                                   (pg.locator('#dialog button[type=submit]'), 3)])
        pg.click('#dialog [data-act="close-dialog"]')
        c.settle()
    # chi tiết hồ sơ đã hoàn thành: kết quả ghi nhận và nút sửa
    pg.locator('.tracking-toolbar .queue-tabs button', has_text='Hoàn thành').click()
    c.settle(500)
    done = pg.locator('[data-act="detail"]')
    if done.count():
        done.first.click()
        c.settle(600)
        c.shot('ql-07-chi-tiet-hoan-thanh', [(pg.locator('#dialog').get_by_text('Kết quả ghi nhận'), 1),
                                             (pg.locator('#dialog [data-act="edit-result-flags"]'), 2)])
        pg.click('#dialog [data-act="close-dialog"]')
        c.settle()
    c.go('queue')
    c.settle(700)
    ap = pg.locator('[data-act="cancel-approve"]')
    if ap.count():
        c.shot('ql-05-duyet-huy', [(ap.first, 1)])
        ap.first.click()
        c.settle(500)
        c.shot('ql-06-hop-thoai-huy', [(pg.locator('#dialog textarea'), 1), (pg.locator('#dialog button[type=submit]'), 2)])
        pg.click('#dialog [data-act="close-dialog"]')
        c.settle()


def admin_tab(c, text, name, marks=()):
    pg = c.page
    pg.locator('[data-act="admin-go"]', has_text=text).first.click()
    c.settle(700)
    c.shot(name, marks)


def stage_admin(c):
    pg = c.page
    print('== Quản trị')
    c.login('admin')
    c.settle(600)
    c.shot('adm-01-tong-quan', [(pg.locator('[data-act="admin-go"]', has_text='Người dùng').first, 1)])
    admin_tab(c, 'Người dùng', 'adm-02-nguoi-dung')
    btn = pg.locator('[aria-label*="Sửa"]')
    if btn.count():
        btn.first.click()
        c.settle(500)
        c.shot('adm-03-sua-nguoi-dung')
        pg.click('#dialog [data-act="close-dialog"]')
        c.settle()
    admin_tab(c, 'Loại việc', 'adm-04-loai-viec')
    pg.locator('[data-act="type-edit"][data-code]').first.click()
    c.settle(500)
    c.shot('adm-05-sua-loai-viec', [(pg.locator('#dialog [name=needs_appointment]').locator('xpath=..'), 1),
                                    (pg.locator('#dialog [name=sla_hours]'), 2)])
    pg.click('#dialog [data-act="close-dialog"]')
    c.settle()
    admin_tab(c, 'Kênh gửi tin', 'adm-06-kenh-gui-tin')
    admin_tab(c, 'Quy tắc thông báo', 'adm-07-quy-tac-thong-bao')
    admin_tab(c, 'Lịch làm việc', 'adm-08-lich-lam-viec')
    admin_tab(c, 'Cấu hình chung', 'adm-09-cau-hinh-chung')
    admin_tab(c, 'Phân công nhanh', 'adm-10-phan-cong-nhanh')


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
    c.settle(700)
    if pg.locator('[data-act="logout"]').count():
        pg.locator('[data-act="logout"]').first.click()
        c.settle()
    c.login('gs_demo')
    c.settle(700)
    c.shot('gs-01-tong-hop')
    c.go('time-report')
    c.settle(600)
    pg.locator('button[type=submit]', has_text='Xem báo cáo').click()
    c.settle(1800)
    c.shot('gs-02-thoi-gian-sla', [(pg.locator('button[type=submit]', has_text='Xem báo cáo'), 1)])
    c.go('report')
    c.settle(600)
    pg.locator('[data-act="report-run"]').first.click()
    c.settle(2500)
    c.shot('gs-03-bao-cao', [(pg.locator('[data-act="report-run"]').first, 1)])


def stage_mobile(p, c):
    """Điện thoại: dùng lại dữ liệu của lượt chụp máy tính (Bình An đang Chờ phân công)."""
    print('== Điện thoại')
    pg = c.page
    # KS giao hồ sơ Bình An cho cán bộ LS 1 (làm trên khổ máy tính)
    c.login('ks_demo')
    ba = row(pg, CUSTOMERS[1]['name'])
    ba.locator('[data-act="flow"][data-to="DA_PHAN_CONG"]').click()
    c.settle(500)
    pg.locator('#dialog input[name=assignee]').first.check()
    pg.locator('#dialog button[type=submit]').click()
    c.settle(800)
    pg.locator('[data-act="logout"]').first.click()
    c.settle(500)
    state = c.ctx.storage_state()
    m = Cap(p, width=390, height=844, mobile=True, storage_state=state)
    m.login('ls_demo_1')
    m.go('mine')
    m.settle(700)
    r = row(m.page, CUSTOMERS[1]['name'])
    m.shot('mobile-01-viec-cua-toi', [(r.locator('[data-act="flow"][data-to="DANG_THUC_HIEN"]'), 1)])
    r.locator('[data-act="flow"][data-to="DANG_THUC_HIEN"]').click()
    m.settle(600)
    m.shot('mobile-02-tiep-nhan', [(m.page.locator('#dialog button[type=submit]'), 1)])
    m.page.locator('#dialog button[type=submit]').click()
    m.settle(900)
    r.locator('[data-act="detail"]').click()
    m.settle(700)
    m.shot('mobile-03-chi-tiet')
    m.close()


def main():
    stages = sys.argv[1:] or ['pgd', 'ks', 'pgd2', 'ls', 'ks2', 'ql', 'admin', 'gs']
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
