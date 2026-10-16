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
import crypto from 'node:crypto';
import vm from 'node:vm';
import { firefoxPackage } from './build-firefox-extension.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');

let html = read('index.html');
html = html.replace('</head>', '<script>window.LS_FIREFOX_PACKAGE=' + JSON.stringify({ version: firefoxPackage.version,
  filename: firefoxPackage.filename, signed: firefoxPackage.signed, payload: firefoxPackage.bytes.toString('base64'),
  sha256: crypto.createHash('sha256').update(firefoxPackage.bytes).digest('hex') }) + ';</script>\n</head>');
const userTemplateBase64 = fs.readFileSync(path.join(dir, 'templates', 'mau_nhap_users.xlsx')).toString('base64');
html = html.replace('</head>', '  <script>window.LS_USER_IMPORT_TEMPLATE_B64=' + JSON.stringify(userTemplateBase64) + ';</script>\n</head>');
const timing = read('js/core.js').match(/\/\* SLA_TIME_SHARED_BEGIN \*\/([\s\S]*?)\/\* SLA_TIME_SHARED_END \*\//);
if (!timing) throw new Error('Missing shared timing engine');
fs.writeFileSync(path.join(dir, 'TimeTracking.gs'), '// Generated from js/core.js by build-gas.mjs.\n' + timing[1], 'utf8');
const domain = read('js/domain.js');
const resultStart = domain.indexOf('  var DAILY_ROWS = [');
const resultEnd = domain.indexOf('  /** Kế hoạch ngày lưu');
if (resultStart < 0 || resultEnd < resultStart) throw new Error('Missing shared result rules');
const domainContext = { LS: {} };
vm.runInNewContext(domain, domainContext);
const resultRules = 'var LSPlanResults = (function () {\n' +
  'var U={byId:function(rows,key,id){return rows.filter(function(r){return r[key]===id;})[0];},db:function(){return {workTypes:[]};}};\n' +
  'var STATUS=' + JSON.stringify(domainContext.LS.domain.STATUS) + ';\n' +
  domain.slice(resultStart,resultEnd) +
  '\nreturn {STATUS:STATUS,creditedParts:creditedParts,dailyActivityKeys:dailyActivityKeys,collateralStepKeys:collateralStepKeys,dailyIsCredit:dailyIsCredit,draftBacklogAt:draftBacklogAt,handoverPartsFor:handoverPartsFor};\n})();\n';
fs.writeFileSync(path.join(dir, 'Planning.gs'), '// Generated from js/planning.js and js/domain.js.\n' + read('js/planning.js') + '\n' + resultRules, 'utf8');
const loginSvg = 'data:image/svg+xml,' + encodeURIComponent(read('assets/login-workflow-hero.svg'));
const styles = read('css/styles.css').replace(
  /url\((['"]?)\.\.\/assets\/login-workflow-hero\.svg\1\)/g,
  'url("' + loginSvg + '")'
);

html = html.replace(
  '<link rel="stylesheet" href="css/styles.css">',
  '<style>\n' + styles + '\n  </style>'
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
