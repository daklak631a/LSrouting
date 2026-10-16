import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { verifySignedPackage } from './lib/firefox-package.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(root, 'extension-firefox');
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const b of buffer) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
// Small local icon; no external image assets or network dependencies.
const size = 96, pixels = Buffer.alloc(size * (1 + size * 4));
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const i = y * (1 + size * 4) + 1 + x * 4;
  const paper = x >= 24 && x <= 71 && y >= 20 && y <= 77;
  const clip = x >= 36 && x <= 59 && y >= 14 && y <= 26;
  const line = x >= 34 && x <= 61 && [38,39,40,50,51,52,62,63,64].includes(y);
  const rgb = clip || line ? [0,107,88] : paper ? [255,255,255] : [0,107,88];
  pixels.set([...rgb,255], i);
}
const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
fs.writeFileSync(path.join(dir,'icon.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
const manifest = JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const files = ['manifest.json','config.js','queue.js','background.js','content.js','popup.html','popup.js','popup.css','icon.png'];
const local = [], central = []; let offset = 0;
for (const filename of files) {
  const name = Buffer.from(filename), data = fs.readFileSync(path.join(dir,filename)), crc = crc32(data);
  const entry = Buffer.alloc(30); entry.writeUInt32LE(0x04034b50); entry.writeUInt16LE(20,4); entry.writeUInt16LE(0x800,6);
  entry.writeUInt32LE(crc,14); entry.writeUInt32LE(data.length,18); entry.writeUInt32LE(data.length,22); entry.writeUInt16LE(name.length,26);
  local.push(entry,name,data);
  const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20,4); record.writeUInt16LE(20,6); record.writeUInt16LE(0x800,8);
  record.writeUInt32LE(crc,16); record.writeUInt32LE(data.length,20); record.writeUInt32LE(data.length,24); record.writeUInt16LE(name.length,28); record.writeUInt32LE(offset,42);
  central.push(record,name); offset += entry.length + name.length + data.length;
}
const directory = Buffer.concat(central), end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...local,directory,end]);
fs.mkdirSync(path.join(root,'outputs'),{recursive:true});
for (const suffix of ['zip','unsigned.xpi']) {
  const dest=path.join(root,'outputs',`ls-routing-firefox-${manifest.version}.${suffix}`);
  fs.writeFileSync(dest,archive); console.log(dest + ' ('+archive.length+' bytes)');
}
const signedPackage = verifySignedPackage(dir);
if (signedPackage) {
  fs.writeFileSync(path.join(root,'outputs',signedPackage.filename),signedPackage.bytes);
  console.log('Signed XPI preserved: ' + signedPackage.filename + ' (' + signedPackage.bytes.length + ' bytes)');
}
export const firefoxPackage = signedPackage || {
  version: manifest.version, filename: `ls-routing-firefox-${manifest.version}.zip`, signed: false, bytes: archive
};
