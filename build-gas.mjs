/**
 * Sinh Index.gas.html từ index.html + css + toàn bộ file js.
 * Apps Script chỉ nhận .gs và .html nên CSS/JS phải nhúng thẳng,
 * tránh phải chép tay hai bản HTML rồi lệch nhau.
 *
 *   node build-gas.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');

let html = read('index.html');

html = html.replace(
  '<link rel="stylesheet" href="css/styles.css">',
  '<style>\n' + read('css/styles.css') + '\n  </style>'
);

// Gom mọi thẻ script ngoài thành một khối, giữ nguyên thứ tự nạp.
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>\s*/g)];
if (!srcs.length) throw new Error('Khong tim thay the script nao trong index.html');

const bundle = srcs.map(m => '/* ' + m[1] + ' */\n' + read(m[1].split('?')[0])).join('\n');
html = html.replace(srcs[0][0], '<script>\n' + bundle + '\n  </script>\n');
srcs.slice(1).forEach(m => { html = html.replace(m[0], ''); });

html = html.replace('<title>', '<!-- Sinh tu dong boi build-gas.mjs - dung sua truc tiep -->\n  <title>');

fs.writeFileSync(path.join(dir, 'Index.gas.html'), html);
console.log('Index.gas.html: ' + (html.length / 1024).toFixed(1) + ' KB tu ' + srcs.length + ' file js');
