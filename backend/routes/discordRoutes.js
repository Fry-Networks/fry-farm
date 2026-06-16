const express = require('express');
const crypto = require('crypto');
const logger = require('../config/logger');
const redis = require('../config/redis');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/userSchema');

const router = express.Router();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://fry.farm/api/discord/callback';
const STATE_TTL_SEC = 10 * 60; // 10 minutes
const FRONTEND_ORIGIN = 'https://fry.farm';

function oauthResultPage(status, reason) {
  const payload = reason
    ? JSON.stringify({ type: 'discord-oauth-result', status, reason })
    : JSON.stringify({ type: 'discord-oauth-result', status });
  return `<!DOCTYPE html><html><head><title>Discord Link</title></head><body>
<p>You can close this window.</p>
<script>
if (window.opener) { window.opener.postMessage(${payload}, '${FRONTEND_ORIGIN}'); }
window.close();
</script></body></html>`;
}

function sendOauthResult(res, status, reason) {
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.send(oauthResultPage(status, reason));
}

/**
 * GET /discord/link
 * Requires auth. Returns a Discord OAuth2 URL with CSRF state token.
 */
router.get('/link', requireAuth, async (req, res) => {
  try {
    if (!DISCORD_CLIENT_ID) {
      return res.status(500).json({ success: false, message: 'Discord OAuth not configured' });
    }

    // Verify JWT wallet matches the frontend's active wallet (prevents stale session after chain switch)
    const requestedWallet = req.headers['x-wallet-address'];
    if (requestedWallet && req.user.wallet !== requestedWallet) {
      return res.status(401).json({ success: false, message: 'Session wallet mismatch. Please reconnect your wallet.' });
    }

    const state = crypto.randomBytes(32).toString('hex');
    const chainId = req.headers['x-chain-id'] || 'algorand-mainnet';
    await redis.set(`discord_state:${state}`, JSON.stringify({ wallet: req.user.wallet, chainId }), 'EX', STATE_TTL_SEC);

    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify',
      state,
    });

    const url = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    return res.json({ success: true, url });
  } catch (err) {
    logger.error('Discord link error:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate Discord link' });
  }
});

/**
 * GET /discord/callback
 * Browser redirect from Discord after user authorizes. No auth middleware needed.
 * Validates state, exchanges code for token, fetches Discord user, updates User model.
 */
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return sendOauthResult(res, 'error', 'missing_params');
  }

  try {
    // Validate state and get wallet + chainId
    const stateData = await redis.get(`discord_state:${state}`);
    if (!stateData) {
      return sendOauthResult(res, 'error', 'invalid_state');
    }
    await redis.del(`discord_state:${state}`);

    let wallet, chainId;
    try {
      const parsed = JSON.parse(stateData);
      wallet = parsed.wallet;
      chainId = parsed.chainId || 'algorand-mainnet';
    } catch {
      // Backwards compat: old Redis state was plain wallet string
      wallet = stateData;
      chainId = 'algorand-mainnet';
    }

    // Exchange code for access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      logger.error('Discord token exchange failed:', await tokenRes.text());
      return sendOauthResult(res, 'error', 'token_exchange');
    }

    const tokenData = await tokenRes.json();

    // Fetch Discord user info
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      logger.error('Discord user fetch failed:', await userRes.text());
      return sendOauthResult(res, 'error', 'user_fetch');
    }

    const discordUser = await userRes.json();

    // Check if this Discord account is already linked to another wallet on the same chain
    const existing = await User.findOne({ discordId: discordUser.id, walletId: { $ne: wallet }, chainId });
    if (existing) {
      return sendOauthResult(res, 'error', 'already_linked');
    }

    // Update user with Discord info
    const updated = await User.findOneAndUpdate(
      { walletId: wallet },
      {
        $set: {
          discordId: discordUser.id,
          discordUsername: discordUser.username,
          discordAvatar: discordUser.avatar
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
            : null,
          discordLinkedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!updated) {
      return sendOauthResult(res, 'error', 'no_profile');
    }

    return sendOauthResult(res, 'linked');
  } catch (err) {
    logger.error('Discord callback error:', err);
    return sendOauthResult(res, 'error', 'server_error');
  }
});

/**
 * POST /discord/unlink
 * Requires auth. Removes Discord fields from user document.
 */
router.post('/unlink', requireAuth, async (req, res) => {
  try {
    await User.findOneAndUpdate(
      { walletId: req.user.wallet },
      {
        $unset: {
          discordId: '',
          discordUsername: '',
          discordAvatar: '',
          discordLinkedAt: '',
        },
      },
    );

    return res.json({ success: true, message: 'Discord account unlinked' });
  } catch (err) {
    logger.error('Discord unlink error:', err);
    return res.status(500).json({ success: false, message: 'Failed to unlink Discord' });
  }
});

module.exports = router;
