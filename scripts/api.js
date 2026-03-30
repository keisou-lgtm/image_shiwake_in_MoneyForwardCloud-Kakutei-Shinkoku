'use strict';

/**
 * UTF-8セーフなHTTPヘルパースクリプト
 *
 * 使い方:
 *   node scripts/api.js <METHOD> <PATH> [BODY_FILE]
 *
 * 例 (GETリクエスト):
 *   node scripts/api.js GET drive/list/FOLDER_ID
 *   ※ パスの先頭スラッシュは不要（Git Bashがパス変換するのを防ぐため）
 *
 * 例 (日本語ファイル名を含むPATCHリクエスト):
 *   1. Write ツールで body.json を作成:
 *      { "newName": "20260329_7875円_消耗品費_ビックカメラ.jpg" }
 *   2. このスクリプトを呼ぶ:
 *      node scripts/api.js PATCH drive/file/FILE_ID body.json
 *
 * 利点: Bashのcurlでは日本語がWindowsで文字化けするが、
 *       このスクリプトはファイルをUTF-8バイト列として直接送るため文字化けしない。
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

const [, , method = 'GET', urlPath = '/', bodyFile] = process.argv;

let bodyBuffer = null;

if (bodyFile) {
  const filePath = path.isAbsolute(bodyFile) ? bodyFile : path.join(process.cwd(), bodyFile);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: body file not found: ${filePath}`);
    process.exit(1);
  }
  bodyBuffer = fs.readFileSync(filePath); // reads as raw UTF-8 bytes
}

// Git Bash on Windows converts leading `/path` to `C:/Program Files/Git/path`.
// To avoid this, callers pass paths WITHOUT a leading slash (e.g. "drive/list/ID").
// We normalise here by stripping any accidental Windows prefix, then prepend "/".
let normalPath = urlPath
  .replace(/^[A-Za-z]:[/\\].*?(?=[A-Za-z])/, '') // strip Windows drive prefix if injected
  .replace(/\\/g, '/');
if (!normalPath.startsWith('/')) normalPath = '/' + normalPath;

const url = new URL(BASE_URL + normalPath);

const options = {
  hostname: url.hostname,
  port:     url.port || 3000,
  path:     url.pathname + (url.search || ''),
  method:   method.toUpperCase(),
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Accept':       'application/json',
  },
};

if (bodyBuffer) {
  options.headers['Content-Length'] = bodyBuffer.length;
}

const req = http.request(options, (res) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    try {
      // pretty-print JSON
      console.log(JSON.stringify(JSON.parse(raw), null, 2));
    } catch {
      console.log(raw);
    }
    if (res.statusCode >= 400) {
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('Request error:', err.message);
  process.exit(1);
});

if (bodyBuffer) {
  req.write(bodyBuffer);
}
req.end();
