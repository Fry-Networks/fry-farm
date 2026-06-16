const logger = require('../config/logger');
const Token = require('../models/tokensSchema');

const VOI_TOKENS = [
  {
    tokenId: 0,
    chainId: 'voi-mainnet',
    tokenName: 'Voi',
    tokenSymbol: 'VOI',
    tokenImage: '',
    decimals: 6,
    verified: true,
    source: 'seed',
  },
  {
    tokenId: 48968653,
    chainId: 'voi-mainnet',
    tokenName: 'vFRY',
    tokenSymbol: 'vFRY',
    tokenImage: '',
    decimals: 6,
    verified: true,
    source: 'seed',
  },
];

async function seedVoiTokens() {
  for (const token of VOI_TOKENS) {
    try {
      const existing = await Token.findOne({ tokenId: token.tokenId, chainId: token.chainId });
      if (!existing) {
        await Token.create(token);
        logger.info(`Seeded ${token.tokenSymbol} (${token.chainId}) into tokens collection`);
      }
    } catch (err) {
      logger.error(`Failed to seed ${token.tokenSymbol}:`, err.message);
    }
  }
}

module.exports = seedVoiTokens;
