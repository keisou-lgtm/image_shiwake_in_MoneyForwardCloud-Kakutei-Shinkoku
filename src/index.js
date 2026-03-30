'use strict';

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { parseMarkdown } = require('./parsers/markdownParser');
const { parseGoogleDoc, saveToken } = require('./parsers/googleDocsParser');
const { generateXmind } = require('./generators/xmindGenerator');
const { generateHtml } = require('./generators/htmlGenerator');
const {
  listFilesInFolder,
  downloadFileAsBase64,
  downloadFileAsBuffer,
  renameFile,
  moveFile,
} = require('./services/googleDriveService');
const { uploadReceiptToJournal } = require('./services/mfcAttachmentService');
const { compressIfNeeded }       = require('./services/imageService');

const app = express();
const PORT = process.env.PORT || 3000;

// Memory storage for uploaded files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/markdown' || file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new Error('Only .md files are accepted'));
    }
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Routes ────────────────────────────────────────────────────────────────

// Serve main UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Convert Markdown file → XMind + HTML
app.post('/convert/markdown', upload.single('mdfile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const markdownText = req.file.buffer.toString('utf8');
    const fileName = path.basename(req.file.originalname, '.md');

    const tree = parseMarkdown(markdownText);
    const [xmindBuffer, htmlContent] = await Promise.all([
      generateXmind(tree),
      Promise.resolve(generateHtml(tree, fileName)),
    ]);

    res.json({
      xmindBase64: xmindBuffer.toString('base64'),
      htmlContent,
      fileName,
    });
  } catch (err) {
    console.error('Markdown conversion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Convert Google Docs URL → XMind + HTML
app.post('/convert/googledocs', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'Google Docs URL is required' });
    }

    let tree;
    try {
      tree = await parseGoogleDoc(url.trim());
    } catch (err) {
      if (err.authUrl) {
        return res.status(401).json({ error: 'auth_required', authUrl: err.authUrl });
      }
      throw err;
    }

    const [xmindBuffer, htmlContent] = await Promise.all([
      generateXmind(tree),
      Promise.resolve(generateHtml(tree, tree.title || 'Google Docs Mind Map')),
    ]);

    res.json({
      xmindBase64: xmindBuffer.toString('base64'),
      htmlContent,
      fileName: tree.title || 'googledocs',
    });
  } catch (err) {
    console.error('Google Docs conversion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Google OAuth2 — redirect to consent screen
app.get('/auth/google', (req, res) => {
  try {
    const { getAuthClient } = require('./parsers/googleDocsParser');
    const { authUrl, client } = getAuthClient();
    if (authUrl) {
      res.redirect(authUrl);
    } else {
      res.send('<p>Already authenticated. <a href="/">Back to app</a></p>');
    }
  } catch (err) {
    res.status(500).send(`<p>Error: ${err.message}</p>`);
  }
});

// Google OAuth2 callback
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('<p>Authorization code missing.</p>');
  }
  try {
    await saveToken(code);
    res.send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a2e;color:#eee">
        <h2>✅ 認証が完了しました</h2>
        <p>token.json が保存されました。</p>
        <a href="/" style="color:#42A5F5">アプリに戻る</a>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send(`<p>Token error: ${err.message}</p>`);
  }
});

// ─── Google Drive API routes ─────────────────────────────────────────────────

// List files in a Drive folder
app.get('/drive/list/:folderId', async (req, res) => {
  try {
    const files = await listFilesInFolder(req.params.folderId);
    res.json({ files });
  } catch (err) {
    if (err.authUrl) return res.status(401).json({ error: 'auth_required', authUrl: err.authUrl });
    console.error('Drive list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Download a file as base64 (for Claude vision)
app.get('/drive/file/:fileId', async (req, res) => {
  try {
    const { base64, mimeType, name } = await downloadFileAsBase64(req.params.fileId);
    res.json({ base64, mimeType, name });
  } catch (err) {
    if (err.authUrl) return res.status(401).json({ error: 'auth_required', authUrl: err.authUrl });
    console.error('Drive download error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Rename a file
app.patch('/drive/file/:fileId', async (req, res) => {
  try {
    const { newName } = req.body;
    if (!newName) return res.status(400).json({ error: 'newName is required' });
    const result = await renameFile(req.params.fileId, newName);
    res.json(result);
  } catch (err) {
    if (err.authUrl) return res.status(401).json({ error: 'auth_required', authUrl: err.authUrl });
    console.error('Drive rename error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Move a file to another folder
app.post('/drive/file/:fileId/move', async (req, res) => {
  try {
    const { oldParentId, newParentId } = req.body;
    if (!oldParentId || !newParentId) {
      return res.status(400).json({ error: 'oldParentId and newParentId are required' });
    }
    const result = await moveFile(req.params.fileId, oldParentId, newParentId);
    res.json(result);
  } catch (err) {
    if (err.authUrl) return res.status(401).json({ error: 'auth_required', authUrl: err.authUrl });
    console.error('Drive move error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload receipt image as attachment to an MFC journal entry
// 5MB超の場合は自動的にJPEG圧縮してからアップロードする
app.post('/mfc/journals/:journalId/receipts', async (req, res) => {
  try {
    const { accessToken, fileId, fileName, mimeType } = req.body;
    if (!accessToken || !fileId) {
      return res.status(400).json({ error: 'accessToken and fileId are required' });
    }

    // Google Driveから画像をダウンロード
    const {
      buffer: rawBuffer,
      mimeType: detectedMime,
      name: detectedName,
    } = await downloadFileAsBuffer(fileId);

    const usedMime = mimeType || detectedMime;
    const usedName = fileName || detectedName;

    // 5MB超の場合は圧縮
    const { buffer, mimeType: finalMime, compressed } = await compressIfNeeded(rawBuffer, usedMime);
    if (compressed) {
      console.log(`[receipts] 圧縮完了: ${(rawBuffer.length / 1024 / 1024).toFixed(2)}MB → ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
    }

    const result = await uploadReceiptToJournal(
      accessToken,
      req.params.journalId,
      buffer,
      usedName,
      finalMime
    );
    res.json({ ...result, compressed });
  } catch (err) {
    if (err.authUrl) return res.status(401).json({ error: 'auth_required', authUrl: err.authUrl });
    console.error('MFC receipt upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Error handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// ─── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🗺  XMind Converter running at http://localhost:${PORT}\n`);
  console.log('  Endpoints:');
  console.log('    GET  /                  → UI');
  console.log('    POST /convert/markdown  → Upload .md file');
  console.log('    POST /convert/googledocs → Google Docs URL');
  console.log('    GET  /auth/google       → Start Google OAuth');
  console.log('    GET  /auth/callback     → OAuth callback\n');
});

module.exports = app;
