/** Nomadex constant-product AMM math — matches on-chain formula exactly */

export const SCALE = 100_000_000_000_000n; // 1e14

export function calculateOutTokens(
  inAmount: bigint,
  inSupply: bigint,
  outSupply: bigint,
  fee: bigint
): bigint {
  const factor = SCALE - fee;
  if (inSupply + inAmount === 0n) return 0n;
  return (inAmount * outSupply * factor) / ((inAmount + inSupply) * SCALE);
}

export function calculatePriceImpact(
  inAmount: bigint,
  inSupply: bigint,
  outSupply: bigint,
  fee: bigint
): number {
  if (inSupply === 0n || outSupply === 0n) return 1;
  const amountOut = calculateOutTokens(inAmount, inSupply, outSupply, fee);
  if (amountOut === 0n || inAmount === 0n) return 1;
  const spotPrice = (outSupply * SCALE) / inSupply;
  const execPrice = (amountOut * SCALE) / inAmount;
  if (spotPrice === 0n) return 1;
  const impact = Number(spotPrice - execPrice) / Number(spotPrice);
  return Math.max(0, impact);
}
