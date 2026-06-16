const Anthropic = require("@anthropic-ai/sdk");
const logger = require("../config/logger");

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 300;

// Haiku pricing per million tokens (USD)
const INPUT_COST_PER_M = 0.80;
const OUTPUT_COST_PER_M = 4.00;

const SYSTEM_PROMPT =
  "You are a DeFi analyst for fry.farm on Algorand. " +
  "Give concise, helpful analysis. Never give financial advice. " +
  "Be factual about numbers. Max 150 words.";

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

function calcCost(inputTokens, outputTokens) {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_M +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_M
  );
}

async function callClaude(userPrompt) {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const tokensUsed = inputTokens + outputTokens;
  const apiCost = calcCost(inputTokens, outputTokens);

  return { analysis: text, tokensUsed, apiCost };
}

async function analyzePool(poolData) {
  const prompt = [
    `Analyze this staking pool on fry.farm:`,
    `- Name: ${poolData.name}`,
    `- APR: ${poolData.apr}`,
    `- Total Value Locked: ${poolData.tvl}`,
    `- Lock Period: ${poolData.lockPeriod}`,
    `- Rewards Remaining: ${poolData.rewardsRemaining}`,
    `- End Date: ${poolData.endDate}`,
    poolData.isGated ? `- Gated: Yes (requires NFT)` : "",
    ``,
    `Provide a brief analysis of this pool's risk/reward profile.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    return await callClaude(prompt);
  } catch (err) {
    logger.error("claudeService.analyzePool error:", err.message);
    throw err;
  }
}

async function analyzePortfolio(positions) {
  const lines = positions.map(
    (p) =>
      `- ${p.poolName} (${p.type}): staked ${p.staked}, reward ${p.reward}, APR ${p.apr}%` +
      (p.lockRemaining ? `, lock remaining: ${p.lockRemaining}s` : "")
  );

  const prompt = [
    `Analyze this user's DeFi portfolio on fry.farm:`,
    ...lines,
    ``,
    `Provide a brief portfolio overview: diversification, risk exposure, and any observations.`,
  ].join("\n");

  try {
    return await callClaude(prompt);
  } catch (err) {
    logger.error("claudeService.analyzePortfolio error:", err.message);
    throw err;
  }
}

async function analyzeSwap(swapData) {
  const prompt = [
    `Analyze this token swap on Algorand:`,
    `- From: ${swapData.fromToken}`,
    `- To: ${swapData.toToken}`,
    `- Amount: ${swapData.amount}`,
    `- Price Impact: ${swapData.priceImpact}%`,
    swapData.route ? `- Route: ${swapData.route}` : "",
    ``,
    `Briefly assess the price impact and any concerns with this swap.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    return await callClaude(prompt);
  } catch (err) {
    logger.error("claudeService.analyzeSwap error:", err.message);
    throw err;
  }
}

module.exports = { analyzePool, analyzePortfolio, analyzeSwap };
