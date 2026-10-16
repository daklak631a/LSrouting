/**
 * Cầu nối giữa mẫu của LS-Routing và mẫu đã duyệt của Zalo ZNS.
 *
 * LS-Routing gửi sang một chuỗi `body` đã thay biến. Zalo lại chỉ nhận
 * `template_id` kèm một đối tượng tham số rời. Vì vậy mẫu phía LS-Routing phải
 * được soạn dưới dạng từng dòng `khoa=gia tri` để nơi này tách ra chắc chắn.
 *
 * KHÔNG dùng biểu thức chính quy để rút tham số ra khỏi câu văn xuôi: chỉ cần
 * ai đó sửa câu chữ trong mẫu là tham số sai, mà Zalo vẫn trả message_id hợp lệ
 * nên lỗi không hề lộ ra ở LS-Routing.
 *
 * Mẫu TPL_HEN_KY phía LS-Routing nên soạn như sau:
 *
 *   ten_khach={{ten_khach}}
 *   noi_ky={{noi_ky}}
 *   gio_ky={{gio_ky}}
 *   ngay_ky={{ngay_ky}}
 *   hotline={{hotline}}
 */
import { badRequest } from './errors.js';

/** Tách `body` thành đối tượng. Dòng không có dấu `=` bị bỏ qua. */
export function parseBody(body) {
  const out = {};
  for (const rawLine of String(body == null ? '' : body).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const at = line.indexOf('=');
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (/^[a-z_][a-z0-9_]*$/i.test(key)) out[key] = value;
  }
  return out;
}

/** Lấy khai báo ánh xạ của một mã mẫu; thiếu thì báo lỗi nói rõ phải khai ở đâu. */
export function resolveTemplate(templateCode, templates) {
  const code = String(templateCode || '').trim();
  if (!code) {
    throw badRequest('Yêu cầu thiếu mã mẫu; kênh ZNS bắt buộc gửi kèm template.');
  }
  const entry = templates && templates[code];
  if (!entry || !entry.zns_template_id) {
    throw badRequest(`Chưa khai ánh xạ ZNS cho mẫu ${code} trong config/templates.json.`);
  }
  return entry;
}

/**
 * Dựng `template_data` cho Zalo.
 * Thiếu tham số bắt buộc thì dừng ngay, không gửi tin khuyết nội dung.
 */
export function buildTemplateData(templateCode, body, templates) {
  const entry = resolveTemplate(templateCode, templates);
  const parsed = parseBody(body);
  const params = entry.params || {};
  const data = {};
  const missing = [];

  for (const [znsParam, lsVar] of Object.entries(params)) {
    const value = parsed[lsVar];
    if (value === undefined || value === '') {
      if (entry.optional && entry.optional.includes(znsParam)) continue;
      missing.push(`${znsParam}<-${lsVar}`);
      continue;
    }
    data[znsParam] = value;
  }

  if (missing.length) {
    throw badRequest(
      `Mẫu ${templateCode} thiếu tham số: ${missing.join(', ')}. Kiểm tra nội dung mẫu phía LS-Routing.`
    );
  }

  return { templateId: String(entry.zns_template_id), data };
}
