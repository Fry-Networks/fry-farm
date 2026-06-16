const CHALLENGE_CONFIG: Record<string, { name: string; description: string; icon: string }> = {
  staking_volume:     { name: 'Staking Volume', description: 'Points for every dollar staked',           icon: 'mdi:lock' },
  farming_volume:     { name: 'Farming Volume', description: 'Points for every dollar farmed',           icon: 'mdi:sprout' },
  trading_volume:     { name: 'Trading Volume', description: 'Points for every dollar swapped',          icon: 'mdi:swap-horizontal' },
  staking_profit:     { name: 'Staking Profit', description: 'Points for staking rewards earned',        icon: 'mdi:trending-up' },
  farming_profit:     { name: 'Farming Profit', description: 'Points for farming rewards earned',        icon: 'mdi:trending-up' },
  daily_claim_streak: { name: 'Daily Streak',   description: 'Bonus for consecutive daily claims',       icon: 'mdi:fire' },
  hold_duration:      { name: 'Diamond Hands',  description: 'Points for every hour holding a position', icon: 'mdi:clock-outline' },
  referral:           { name: 'Referral',        description: 'Points for each new user referred',        icon: 'mdi:account-group' },
  nft_staking_volume: { name: 'NFT Staking Volume', description: 'Points for every NFT staked',           icon: 'mdi:image-multiple' },
  prediction_lp_volume: { name: 'Prediction LP Volume', description: 'Points for prediction market liquidity', icon: 'mdi:chart-line' },
}

export function getChallengeConfig(type: string) {
  return CHALLENGE_CONFIG[type] || { name: type, description: '', icon: 'mdi:help-circle' }
}
