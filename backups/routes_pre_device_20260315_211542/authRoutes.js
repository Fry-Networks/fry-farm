const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const algosdk = require('algosdk');
const logger = require('../config/logger');
const { withFallback } = require('../services/algodService');
const redis = require('../config/redis');
const rateLimit = require('express-rate-limit');
const { checkIsAdmin } = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts, please try again later' },
});

const JWT_SECRET = process.env.JWT_SECRET;
const NONCE_TTL_SEC = 5 * 60; // 5 minutes

/**
 * POST /auth/nonce
 * Body: { wallet: "ALGO_ADDRESS" }
 * Returns: { nonce: "hex_string" }
 */
router.post('/nonce', authLimiter, async (req, res) => {
  const { wallet } = req.body;
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ success: false, message: 'wallet is required' });
  }

  // Validate it looks like an Algorand address
  if (!algosdk.isValidAddress(wallet)) {
    return res.status(400).json({ success: false, message: 'Invalid Algorand address' });
  }

  const nonce = crypto.randomBytes(32).toString('hex');
  await redis.set(`nonce:${wallet}`, nonce, 'EX', NONCE_TTL_SEC);

  return res.json({ success: true, nonce });
});

/**
 * POST /auth/verify
 * Body: { wallet, signedTxn (base64), nonce }
 * Returns: { token: "jwt_string" }
 *
 * The frontend signs a zero-ALGO self-payment transaction with the nonce
 * embedded in the note field, using @txnlab/use-wallet's transactionSigner.
 * This endpoint decodes the signed transaction and verifies:
 *   1. The sender matches the claimed wallet
 *   2. The note contains the expected nonce
 *   3. The signature is valid (via Algorand simulate API, supports rekeyed accounts)
 */
router.post('/verify', authLimiter, async (req, res) => {
  const { wallet, signedTxn, nonce } = req.body;

  if (!wallet || !signedTxn || !nonce) {
    return res.status(400).json({ success: false, message: 'wallet, signedTxn, and nonce are required' });
  }

  // Check nonce exists and matches
  const stored = await redis.get(`nonce:${wallet}`);
  if (!stored || stored !== nonce) {
    return res.status(401).json({ success: false, message: 'Invalid or expired nonce' });
  }

  // Consume nonce (single use)
  await redis.del(`nonce:${wallet}`);

  try {
    // Decode the signed transaction
    const stxnBytes = Buffer.from(signedTxn, 'base64');
    const decoded = algosdk.decodeSignedTransaction(stxnBytes);
    const txn = decoded.txn;

    // Verify sender matches claimed wallet
    const sender = txn.sender.toString();
    if (sender !== wallet) {
      return res.status(401).json({ success: false, message: 'Transaction sender does not match wallet' });
    }

    // Verify note contains the nonce
    const noteStr = txn.note ? Buffer.from(txn.note).toString('utf8') : '';
    if (!noteStr.includes(nonce)) {
      return res.status(401).json({ success: false, message: 'Transaction note does not contain nonce' });
    }

    // Verify signature via Algorand simulate API
    // This correctly handles rekeyed accounts and SDK encoding differences
    const simRequest = new algosdk.modelsv2.SimulateRequest({
      txnGroups: [
        new algosdk.modelsv2.SimulateRequestTransactionGroup({ txns: [decoded] })
      ],
      allowEmptySignatures: false,
    });
    const simResult = await withFallback(async (client) => {
      return await client.simulateTransactions(simRequest).do();
    });
    const groupFailure = simResult.txnGroups[0].failureMessage;

    if (groupFailure) {
      return res.status(401).json({ success: false, message: 'Transaction verification failed' });
    }

    const token = jwt.sign({ wallet }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '24h' });
    res.cookie('fry_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
    return res.json({ success: true });
  } catch (err) {
    logger.error('Auth verify error:', err);
    return res.status(500).json({ success: false, message: 'Verification error' });
  }
});

/**
 * POST /auth/logout
 * Clears the auth cookie.
 */
router.post('/logout', (req, res) => {
  res.clearCookie('fry_token', { path: '/' });
  return res.json({ success: true });
});

/**
 * GET /auth/me
 * Returns auth status (checks cookie validity).
 */
router.get('/me', async (req, res) => {
  const token = req.cookies?.fry_token;
  if (!token) {
    return res.json({ success: true, authenticated: false });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const isAdmin = await checkIsAdmin(decoded.wallet);
    return res.json({ success: true, authenticated: true, wallet: decoded.wallet, isAdmin });
  } catch (_err) {
    res.clearCookie('fry_token', { path: '/' });
    return res.json({ success: true, authenticated: false });
  }
});

module.exports = router;
