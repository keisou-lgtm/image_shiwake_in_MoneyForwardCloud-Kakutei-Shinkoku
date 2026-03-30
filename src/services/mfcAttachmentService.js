'use strict';

const https = require('https');
const http = require('http');

const MFC_API_BASE = 'https://invoice.moneyforward.com/api/v3';

/**
 * Upload a receipt image as an attachment to a MoneyForward Cloud journal entry.
 *
 * @param {string} accessToken  - MFC OAuth2 access token
 * @param {string} journalId    - Journal entry ID returned by mfc_ca_postJournals
 * @param {Buffer} fileBuffer   - File contents
 * @param {string} fileName     - File name (e.g. "20260315_3300円_消耗品費_ローソン.jpg")
 * @param {string} mimeType     - MIME type (e.g. "image/jpeg")
 * @returns {Promise<object>}   - API response body (parsed JSON)
 */
async function uploadReceiptToJournal(accessToken, journalId, fileBuffer, fileName, mimeType) {
  const boundary = `----FormBoundary${Date.now().toString(16)}`;
  const CRLF = '\r\n';

  // Build multipart/form-data body
  const headerPart = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="receipt"; filename="${fileName}"`,
    `Content-Type: ${mimeType}`,
    '',
    '',
  ].join(CRLF);

  const footerPart = `${CRLF}--${boundary}--${CRLF}`;

  const bodyBuffer = Buffer.concat([
    Buffer.from(headerPart, 'utf8'),
    fileBuffer,
    Buffer.from(footerPart, 'utf8'),
  ]);

  const url = new URL(`${MFC_API_BASE}/journals/${journalId}/receipts`);

  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': bodyBuffer.length,
      Accept: 'application/json',
    },
  };

  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`MFC API error ${res.statusCode}: ${data}`));
          }
        } catch {
          reject(new Error(`MFC API response parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

module.exports = { uploadReceiptToJournal };
