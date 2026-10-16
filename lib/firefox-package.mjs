import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

export const runtimeFiles = ['manifest.json','config.js','queue.js','background.js','content.js','popup.html','popup.js','popup.css','icon.png'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('base64');

export function readXpi(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  assert.ok(end >= 0 && end + 22 <= bytes.length, 'XPI central directory missing');
  const entries = new Map();
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  assert.ok(count > 0 && count <= 100, 'Unexpected XPI entry count');
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, 'Invalid central directory');
    const method = bytes.readUInt16LE(cursor + 10), compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28), extraLength = bytes.readUInt16LE(cursor + 30), commentLength = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42), name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    assert.ok(!entries.has(name) && !name.includes('..') && !name.startsWith('/') && !name.includes('\\'), 'Unsafe or duplicate XPI entry');
    assert.ok(size <= 1024 * 1024, 'Unexpected XPI entry size');
    assert.equal(bytes.readUInt32LE(local), 0x04034b50, 'Invalid local XPI entry');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    assert.ok(start + compressed <= bytes.length, 'Truncated XPI entry');
    const encoded = bytes.subarray(start, start + compressed);
    assert.ok(method === 0 || method === 8, 'Unsupported XPI compression');
    const data = method === 8 ? zlib.inflateRawSync(encoded, { maxOutputLength: 1024 * 1024 }) : encoded;
    assert.equal(data.length, size, 'XPI entry size mismatch');
    entries.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function verifySignedPackage(dir) {
  const metadataPath = path.join(dir, 'signed-package.json');
  if (!fs.existsSync(metadataPath)) return null;
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const localManifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (metadata.version !== localManifest.version) return null;
  assert.equal(metadata.filename, 'ls-routing-firefox-' + metadata.version + '.signed.xpi');
  const bytes = fs.readFileSync(path.join(dir, metadata.filename));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), metadata.sha256, 'Signed XPI changed; do not modify signed bytes');
  const files = readXpi(bytes);
  for (const name of ['META-INF/mozilla.rsa','META-INF/mozilla.sf','META-INF/manifest.mf','META-INF/cose.manifest','META-INF/cose.sig']) {
    assert.ok(files.get(name)?.length, 'Missing signature entry: ' + name);
  }
  assert.deepEqual(JSON.parse(files.get('manifest.json').toString('utf8')), localManifest, 'Signed manifest does not match current extension');
  for (const name of runtimeFiles.filter(name => name !== 'manifest.json')) {
    assert.ok(files.get(name)?.equals(fs.readFileSync(path.join(dir,name))), 'Extension source changed since signing: ' + name);
  }
  assert.ok([...files.keys()].every(name => runtimeFiles.includes(name) || /^META-INF\/(mozilla\.rsa|mozilla\.sf|manifest\.mf|cose\.manifest|cose\.sig)$/.test(name)), 'Unexpected files in signed package');
  const mf = files.get('META-INF/manifest.mf'), sf = files.get('META-INF/mozilla.sf').toString('utf8');
  const mfHash = /^SHA256-Digest-Manifest: (.+)$/m.exec(sf)?.[1].trim();
  assert.equal(digest(mf), mfHash, 'Signature manifest hash mismatch');
  const covered = new Set();
  for (const section of mf.toString('utf8').replace(/\r\n/g,'\n').replace(/\n /g,'').split('\n\n')) {
    const name = /^Name: (.+)$/m.exec(section)?.[1];
    if (!name) continue;
    assert.ok(files.has(name), 'Signed resource absent: ' + name);
    assert.equal(digest(files.get(name)), /^SHA256-Digest: (.+)$/m.exec(section)?.[1].trim(), 'Signed resource digest mismatch: ' + name);
    covered.add(name);
  }
  assert.ok(runtimeFiles.every(name => covered.has(name)), 'Not all runtime resources covered by signature');
  assert.equal(metadata.cms_verified, true, 'Imported package must have verified CMS signature');
  return { version: metadata.version, filename: metadata.filename, signed: true, bytes, sha256: metadata.sha256 };
}
