'use strict';

const sharp = require('sharp');

const MAX_BYTES      = 5 * 1024 * 1024; // 5MB
const QUALITY_STEPS  = [80, 60, 40];     // 順に試すJPEG品質
const RESIZE_WIDTH   = 2000;             // 最終手段リサイズの最大幅(px)

/**
 * 画像バッファが上限サイズを超えていればJPEGに圧縮して返す。
 * 超えていなければそのまま返す。
 *
 * @param {Buffer} buffer   - 元の画像バイト列
 * @param {string} mimeType - 例: "image/jpeg" / "image/png"
 * @param {number} [maxBytes=5MB] - 許容上限バイト数
 * @returns {Promise<{ buffer: Buffer, mimeType: string, compressed: boolean }>}
 */
async function compressIfNeeded(buffer, mimeType, maxBytes = MAX_BYTES) {
  if (buffer.length <= maxBytes) {
    return { buffer, mimeType, compressed: false };
  }

  // 非画像は圧縮できないのでそのまま返す
  if (!mimeType || !mimeType.startsWith('image/')) {
    return { buffer, mimeType, compressed: false };
  }

  console.log(
    `[imageService] 元サイズ ${(buffer.length / 1024 / 1024).toFixed(2)}MB が上限(${maxBytes / 1024 / 1024}MB)を超過。圧縮を試みます。`
  );

  // ① JPEG品質を段階的に落として試す
  for (const quality of QUALITY_STEPS) {
    const compressed = await sharp(buffer)
      .jpeg({ quality })
      .toBuffer();

    console.log(`[imageService] quality=${quality} → ${(compressed.length / 1024 / 1024).toFixed(2)}MB`);

    if (compressed.length <= maxBytes) {
      return { buffer: compressed, mimeType: 'image/jpeg', compressed: true };
    }
  }

  // ② それでも超えるなら横幅を最大2000pxにリサイズしてから再圧縮
  const resized = await sharp(buffer)
    .resize({ width: RESIZE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: QUALITY_STEPS[QUALITY_STEPS.length - 1] })
    .toBuffer();

  console.log(`[imageService] リサイズ後 → ${(resized.length / 1024 / 1024).toFixed(2)}MB`);

  return { buffer: resized, mimeType: 'image/jpeg', compressed: true };
}

module.exports = { compressIfNeeded };
