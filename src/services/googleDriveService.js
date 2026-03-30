'use strict';

const { google } = require('googleapis');
const { getAuthClient } = require('../parsers/googleDocsParser');

/**
 * Get an authenticated Google Drive v3 client.
 * Throws with .authUrl if authentication is needed.
 */
function getDriveClient() {
  const { client, authUrl } = getAuthClient();
  if (authUrl) {
    const err = new Error('Google authentication required');
    err.authUrl = authUrl;
    throw err;
  }
  return google.drive({ version: 'v3', auth: client });
}

/**
 * List image files in a Google Drive folder.
 * Returns [{ id, name, mimeType }]
 */
async function listFilesInFolder(folderId) {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'createdTime',
  });
  return res.data.files || [];
}

/**
 * Download a file and return it as a base64 string.
 * Also returns the mimeType.
 */
async function downloadFileAsBase64(fileId) {
  const drive = getDriveClient();
  const metaRes = await drive.files.get({ fileId, fields: 'mimeType,name' });
  const { mimeType, name } = metaRes.data;

  const contentRes = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  const base64 = Buffer.from(contentRes.data).toString('base64');
  return { base64, mimeType, name };
}

/**
 * Download a file and return it as a Buffer.
 */
async function downloadFileAsBuffer(fileId) {
  const drive = getDriveClient();
  const metaRes = await drive.files.get({ fileId, fields: 'mimeType,name' });
  const { mimeType, name } = metaRes.data;

  const contentRes = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  const buffer = Buffer.from(contentRes.data);
  return { buffer, mimeType, name };
}

/**
 * Rename a file in Google Drive.
 */
async function renameFile(fileId, newName) {
  const drive = getDriveClient();
  const res = await drive.files.update({
    fileId,
    requestBody: { name: newName },
    fields: 'id, name',
  });
  return res.data;
}

/**
 * Move a file from one folder to another.
 */
async function moveFile(fileId, oldParentId, newParentId) {
  const drive = getDriveClient();
  const res = await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: oldParentId,
    fields: 'id, name, parents',
  });
  return res.data;
}

module.exports = {
  listFilesInFolder,
  downloadFileAsBase64,
  downloadFileAsBuffer,
  renameFile,
  moveFile,
};
