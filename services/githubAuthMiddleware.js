const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

const router = express.Router();

const COOKIE_NAME = 'gh_upload_session';
const SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours in seconds
const REDIRECT_URI = 'https://fry.farm/uploads/auth/callback';

// ── Session helpers ──────────────────────────────────────

function signSession(userId, secret) {
  const payload = `${userId}:${Date.now()}`;
  const sig = crypto.createHmac('sha256', secret)
    .update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64');
}

function verifySession(token, secret, allowedId) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const lastDot = decoded.lastIndexOf('.');
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = crypto.createHmac('sha256', secret)
      .update(payload).digest('hex');
    if (sig !== expected) return false;
    const [userId, ts] = payload.split(':');
    if (Date.now() - parseInt(ts) > SESSION_MAX_AGE * 1000) return false;
    return userId === allowedId;
  } catch {
    return false;
  }
}

// ── Auth routes ──────────────────────────────────────────

// GET /uploads/auth/login
router.get('/auth/login', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'GitHub OAuth not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const returnTo = req.query.returnTo || '/';

  // Store state in short-lived cookie (5 minutes)
  res.setHeader('Set-Cookie',
    `gh_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=300; Path=/`
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: 'read:user',
    state: `${state}:${Buffer.from(returnTo).toString('base64')}`,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GET /uploads/auth/callback
router.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  const cookieHeader = req.headers.cookie || '';
  const cookieState = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('gh_oauth_state='))
    ?.split('=')[1];

  if (!code || !state || !cookieState) {
    return res.status(400).send('Missing OAuth parameters');
  }

  const [stateValue, returnToB64] = state.split(':');
  if (stateValue !== cookieState) {
    return res.status(400).send('Invalid OAuth state');
  }

  const returnTo = returnToB64
    ? Buffer.from(returnToB64, 'base64').toString('utf8')
    : '/';

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(400).send('Failed to exchange code for token');
    }

    // Fetch GitHub user
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const userData = await userRes.json();
    const allowedId = process.env.GITHUB_ALLOWED_USER_ID;

    if (!userData.id || String(userData.id) !== allowedId) {
      res.setHeader('Set-Cookie',
        'gh_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
      );
      return res.status(403).send(`
        <html><body style="font-family:sans-serif;padding:40px;
          background:#1a1a1a;color:#fff">
          <h2>Access Denied</h2>
          <p>Your GitHub account is not authorized to access these files.</p>
        </body></html>
      `);
    }

    // Sign session cookie
    const secret = process.env.GITHUB_COOKIE_SECRET;
    const sessionToken = signSession(String(userData.id), secret);

    res.setHeader('Set-Cookie', [
      `${COOKIE_NAME}=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}; Path=/`,
      'gh_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
    ]);

    res.redirect(returnTo);
  } catch (err) {
    logger.error('GitHub OAuth callback error:', err);
    res.status(500).send('OAuth error');
  }
});

// ── File serving middleware ──────────────────────────────

function requireGithubAuth(req, res, next) {
  const secret = process.env.GITHUB_COOKIE_SECRET;
  const allowedId = process.env.GITHUB_ALLOWED_USER_ID;

  if (!secret || !allowedId) {
    return res.status(500).json({ error: 'GitHub auth not configured' });
  }

  const cookieHeader = req.headers.cookie || '';
  const sessionToken = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${COOKIE_NAME}=`))
    ?.split('=').slice(1).join('=');

  if (!sessionToken || !verifySession(sessionToken, secret, allowedId)) {
    const returnTo = req.originalUrl;
    return res.redirect(
      `/uploads/auth/login?returnTo=${encodeURIComponent(returnTo)}`
    );
  }

  next();
}

// ── File download handler ────────────────────────────────

function serveUploadFile(req, res) {
  // req.path is the path after /uploads/bug-reports/
  const filename = path.basename(req.path);

  // Security: no path traversal
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return res.status(403).json({ error: 'Invalid file path' });
  }

  const fullPath = path.join('/app/uploads/bug-reports', filename);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === '.har' ? 'application/json' :
    ext === '.log' || ext === '.txt' ? 'text/plain' :
    ext === '.png' ? 'image/png' :
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
    'application/octet-stream';

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');

  const stream = fs.createReadStream(fullPath);
  stream.pipe(res);
  stream.on('error', (err) => {
    logger.error('File stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to read file' });
    }
  });
}

module.exports = { router, requireGithubAuth, serveUploadFile };
