import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { verifySignedPackage, readXpi } from './lib/firefox-package.mjs';

const signed = verifySignedPackage('extension-firefox');
assert.ok(signed?.signed);
assert.equal(signed.version,'1.0.0');
assert.ok(signed.bytes.equals(fs.readFileSync('outputs/'+signed.filename)),'Build must copy signed file unchanged');
if(process.argv[2])assert.ok(signed.bytes.equals(fs.readFileSync(process.argv[2])),'Published XPI must equal owner-supplied Mozilla download');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'ls-firefox-signed-'));
try {
  fs.cpSync('extension-firefox',temp,{recursive:true});
  fs.appendFileSync(path.join(temp,'content.js'),'\n// Modified after signing','utf8');
  assert.throws(()=>verifySignedPackage(temp),/source changed since signing/,'Do not serve signed package with stale code');
  fs.copyFileSync('extension-firefox/content.js',path.join(temp,'content.js'));
  const changed=Buffer.from(signed.bytes);changed[50]^=1;
  fs.writeFileSync(path.join(temp,signed.filename),changed);
  assert.throws(()=>verifySignedPackage(temp),/Signed XPI changed/,'Do not silently repackage or corrupt signature');
  assert.throws(()=>readXpi(Buffer.alloc(10)),/central directory missing/);
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
console.log('Signed Firefox package: original bytes, manifest/source parity, signed resource digests, tamper and stale-source protection passed.');
