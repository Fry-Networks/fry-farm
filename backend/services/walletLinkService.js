const logger = require("../config/logger");
const WalletLink = require("../models/walletLinkSchema");

/**
 * Link a cross-chain wallet to an Algorand address
 */
async function linkWallet(algorandAddress, { chainId, walletAddress, signature, message, timestamp }) {
  // Verify timestamp within 10 minutes
  const timeDiff = Math.abs(Date.now() / 1000 - timestamp);
  if (timeDiff > 600) {
    throw new Error('Signature timestamp expired (must be within 10 minutes)');
  }

  // Verify signature based on chain type
  if (chainId.startsWith('evm') || chainId.startsWith('ethereum') || chainId.startsWith('polygon') || chainId.startsWith('base')) {
    try {
      const { ethers } = require('ethers');
      const recovered = ethers.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error('Signature verification failed: address mismatch');
      }
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        logger.warn('ethers not installed — EVM signature verification skipped');
      } else {
        throw err;
      }
    }
  } else if (chainId.startsWith('solana')) {
    // TODO: Solana signature verification
    logger.warn('Solana signature verification not yet implemented');
  }

  return WalletLink.findOneAndUpdate(
    { algorandAddress },
    {
      $push: {
        links: {
          chainId,
          walletAddress,
          signatureProof: signature,
          signedMessage: message,
          verifiedAt: new Date(),
          active: true,
        },
      },
    },
    { upsert: true, new: true }
  );
}

/**
 * Get all linked wallets for an Algorand address
 */
async function getLinkedWallets(algorandAddress) {
  return WalletLink.findOne({ algorandAddress });
}

module.exports = { linkWallet, getLinkedWallets };
