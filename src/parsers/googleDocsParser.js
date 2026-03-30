'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { buildTreeFromHeadings } = require('./markdownParser');

const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
// 2026/3/30 for shiwake
// const SCOPES = ['https://www.googleapis.com/auth/documents.readonly'];
const SCOPES = ['https://www.googleapis.com/auth/drive'];

// Mapping from Google Docs heading style to depth number
const HEADING_DEPTH_MAP = {
  HEADING_1: 1,
  HEADING_2: 2,
  HEADING_3: 3,
  HEADING_4: 4,
  HEADING_5: 5,
  HEADING_6: 6,
};

/**
 * Extract Doc ID from a Google Docs URL.
 */
function extractDocId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('Invalid Google Docs URL: cannot extract document ID');
  return match[1];
}

/**
 * Load OAuth2 client from credentials.json.
 */
function loadOAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error('credentials.json not found. Please place it in the project root.');
  }
  const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const { web, installed } = JSON.parse(raw);
  const creds = web || installed;
  if (!creds) throw new Error('Invalid credentials.json format');

  const { client_id, client_secret, redirect_uris } = creds;
  const redirectUri = process.env.REDIRECT_URI || redirect_uris[0];
  return new google.auth.OAuth2(client_id, client_secret, redirectUri);
}

/**
 * Get an authenticated OAuth2 client.
 * Returns { client } if authenticated, or { authUrl } if authentication is needed.
 */
function getAuthClient() {
  const client = loadOAuthClient();

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    client.setCredentials(token);
    return { client };
  }

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  return { authUrl };
}

/**
 * Exchange authorization code for token and save it.
 */
async function saveToken(code) {
  const client = loadOAuthClient();
  const { tokens } = await client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  return tokens;
}

/**
 * Extract plain text from a Google Docs paragraph element.
 */
function extractParagraphText(paragraph) {
  if (!paragraph.elements) return '';
  return paragraph.elements
    .map(el => (el.textRun ? el.textRun.content : ''))
    .join('')
    .replace(/\n$/, '')
    .trim();
}

/**
 * Fetch a Google Doc and parse it into a tree structure.
 */
async function parseGoogleDoc(url) {
  const docId = extractDocId(url);
  const { client, authUrl } = getAuthClient();

  if (authUrl) {
    const err = new Error('Google authentication required');
    err.authUrl = authUrl;
    throw err;
  }

  const docs = google.docs({ version: 'v1', auth: client });
  const response = await docs.documents.get({ documentId: docId });
  const body = response.data.body;

  const headings = [];

  for (const element of body.content || []) {
    if (!element.paragraph) continue;
    const { paragraph } = element;
    const style = paragraph.paragraphStyle && paragraph.paragraphStyle.namedStyleType;
    const depth = HEADING_DEPTH_MAP[style];
    if (!depth) continue;

    const text = extractParagraphText(paragraph);
    if (text) {
      headings.push({ depth, text });
    }
  }

  return buildTreeFromHeadings(headings);
}

module.exports = { parseGoogleDoc, getAuthClient, saveToken, extractDocId };
