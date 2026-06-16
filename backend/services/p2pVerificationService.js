const algosdk = require('algosdk');
const logger = require('../config/logger');
const { withFallbackForChain, getAlgodClientForChain } = require('./algodService');

// On-chain offer status values
const STATUS_OPEN = 0;
const STATUS_FILLED = 1;
const STATUS_CANCELLED = 2;

// Box layout: 104 bytes total
// status(8) | maker(32) | offer_amount(8) | request_amount(8) | counterparty(32) | expiry(8) | created_at(8)
const BOX_SIZE = 104;

// 32-byte zero address (no counterparty = public offer)
const ZERO_ADDRESS = new Uint8Array(32);

/**
 * Encode an offer ID as an 8-byte big-endian uint64 box key.
 */
function encodeOfferBoxKey(offerId) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(offerId));
  return new Uint8Array(buf);
}

/**
 * Check if a 32-byte address is all zeros.
 */
function isZeroAddress(bytes) {
  for (let i = 0; i < 32; i++) {
    if (bytes[i] !== 0) return false;
  }
  return true;
}

/**
 * Read and decode an offer box from the P2P swap contract.
 *
 * @param {string} chainId - 'algorand-mainnet' or 'voi-mainnet'
 * @param {number} appId - The P2P swap application ID
 * @param {number} offerId - The on-chain offer ID (uint64)
 * @returns {Promise<{status, maker, offerAmount, requestAmount, counterparty, expiry, createdAt}>}
 */
async function readOfferBox(chainId, appId, offerId) {
  const boxKey = encodeOfferBoxKey(offerId);

  return withFallbackForChain(chainId, async (client) => {
    const boxResult = await client.getApplicationBoxByName(appId, boxKey).do();
    const box = boxResult.value;

    if (box.length !== BOX_SIZE) {
      throw new Error(`Unexpected box size: ${box.length} (expected ${BOX_SIZE})`);
    }

    const status = Number(algosdk.decodeUint64(box.slice(0, 8), 'mixed'));
    const makerBytes = box.slice(8, 40);
    const maker = algosdk.encodeAddress(makerBytes);
    const offerAmount = Number(algosdk.decodeUint64(box.slice(40, 48), 'mixed'));
    const requestAmount = Number(algosdk.decodeUint64(box.slice(48, 56), 'mixed'));
    const counterpartyBytes = box.slice(56, 88);
    const counterparty = isZeroAddress(counterpartyBytes) ? '' : algosdk.encodeAddress(counterpartyBytes);
    const expiry = Number(algosdk.decodeUint64(box.slice(88, 96), 'mixed'));
    const createdAt = Number(algosdk.decodeUint64(box.slice(96, 104), 'mixed'));

    return {
      status,
      maker,
      offerAmount,
      requestAmount,
      counterparty,
      expiry,
      createdAt,
    };
  });
}

/**
 * Verify a market contract exists on-chain and optionally check the creator.
 *
 * @param {string} chainId
 * @param {number} appId
 * @param {string} [expectedCreator] - If provided, verifies the app creator matches
 * @returns {Promise<{verified: boolean, appAddress?: string, creator?: string, error?: string}>}
 */
async function verifyMarketDeployment(chainId, appId, expectedCreator) {
  try {
    const client = getAlgodClientForChain(chainId);
    const appInfo = await client.getApplicationByID(appId).do();

    const creator = String(appInfo.params.creator).trim();
    const appAddress = algosdk.getApplicationAddress(appId);

    if (expectedCreator && creator !== String(expectedCreator).trim()) {
      return {
        verified: false,
        error: `Creator mismatch: expected ${expectedCreator}, got ${creator}`,
      };
    }

    return { verified: true, appAddress, creator };
  } catch (err) {
    logger.error(`p2pVerification: verifyMarketDeployment failed for appId=${appId}:`, err.message);
    return { verified: false, error: err.message };
  }
}

/**
 * Verify an offer exists on-chain and return its decoded state.
 *
 * @param {string} chainId
 * @param {number} appId
 * @param {number} offerId
 * @returns {Promise<{verified: boolean, data?: object, error?: string}>}
 */
async function verifyOfferExists(chainId, appId, offerId) {
  try {
    const data = await readOfferBox(chainId, appId, offerId);
    return { verified: true, data };
  } catch (err) {
    logger.error(`p2pVerification: verifyOfferExists failed for appId=${appId} offerId=${offerId}:`, err.message);
    return { verified: false, error: err.message };
  }
}

/**
 * Verify an offer has been filled on-chain (status === 1).
 */
async function verifyOfferFilled(chainId, appId, offerId) {
  try {
    const data = await readOfferBox(chainId, appId, offerId);
    if (data.status !== STATUS_FILLED) {
      return {
        verified: false,
        data,
        error: `Offer status is ${data.status}, expected ${STATUS_FILLED} (filled)`,
      };
    }
    return { verified: true, data };
  } catch (err) {
    // Box deleted after fill is expected — treat as successful verification
    if (err.message && (err.message.includes('box not found') || err.message.includes('does not exist'))) {
      logger.info(`p2pVerification: box deleted for appId=${appId} offerId=${offerId}, treating as filled`);
      return { verified: true, data: { status: STATUS_FILLED } };
    }
    logger.error(`p2pVerification: verifyOfferFilled failed for appId=${appId} offerId=${offerId}:`, err.message);
    return { verified: false, error: err.message };
  }
}

/**
 * Verify an offer has been cancelled on-chain (status === 2).
 */
async function verifyOfferCancelled(chainId, appId, offerId) {
  try {
    const data = await readOfferBox(chainId, appId, offerId);
    if (data.status !== STATUS_CANCELLED) {
      return {
        verified: false,
        data,
        error: `Offer status is ${data.status}, expected ${STATUS_CANCELLED} (cancelled)`,
      };
    }
    return { verified: true, data };
  } catch (err) {
    // Box deleted could mean cancelled — treat as unverifiable
    logger.error(`p2pVerification: verifyOfferCancelled failed for appId=${appId} offerId=${offerId}:`, err.message);
    return { verified: false, error: err.message };
  }
}

module.exports = {
  STATUS_OPEN,
  STATUS_FILLED,
  STATUS_CANCELLED,
  encodeOfferBoxKey,
  readOfferBox,
  verifyMarketDeployment,
  verifyOfferExists,
  verifyOfferFilled,
  verifyOfferCancelled,
};
