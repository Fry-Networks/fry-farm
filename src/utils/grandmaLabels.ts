export function friendlyApr(apr: number | null | undefined): string {
  if (apr == null || apr <= 0) return 'Low activity'
  if (apr < 5) return 'Modest earnings'
  if (apr < 20) return 'Good earnings'
  if (apr < 50) return 'Great earnings'
  return 'Excellent earnings'
}

export function friendlyVolume(volume: number): string {
  if (volume <= 0) return 'No activity'
  if (volume < 1000) return 'Low activity'
  if (volume < 10000) return 'Active'
  return 'Very active'
}

export function friendlyProbability(yesProb: number): string {
  if (yesProb < 20) return 'Very unlikely'
  if (yesProb < 40) return 'Unlikely'
  if (yesProb < 60) return 'Toss-up'
  if (yesProb < 80) return 'Likely'
  return 'Very likely'
}

export function friendlyFee(feePercent: number): string {
  if (feePercent <= 0.1) return 'Very low fee'
  if (feePercent <= 0.5) return 'Low fee'
  if (feePercent <= 1) return 'Standard fee'
  return 'High fee'
}

export function friendlyPoolSize(tvlUsd: number): string {
  if (tvlUsd <= 0) return 'New Pool'
  if (tvlUsd < 1000) return 'Small Pool'
  if (tvlUsd < 10000) return 'Medium Pool'
  if (tvlUsd < 100000) return 'Large Pool'
  return 'Very Large Pool'
}

export function friendlySlippage(bps: number): string {
  if (bps <= 25) return 'Very low'
  if (bps <= 50) return 'Low'
  if (bps <= 100) return 'Standard'
  return 'High'
}

export function friendlyPriceImpact(percent: number): string {
  if (percent <= 0.1) return 'Negligible'
  if (percent <= 1) return 'Low impact'
  if (percent <= 5) return 'Moderate impact'
  return 'High impact'
}