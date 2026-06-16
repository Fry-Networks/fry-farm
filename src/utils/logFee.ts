import { authFetch } from '../services/apiClient'

/**
 * Log a fee transaction to the backend with one retry on failure.
 * Replaces the old fire-and-forget authFetch pattern that silently swallowed errors.
 */
export async function logFee(payload: {
  appId: number | string
  userId: string
  gasAmount: number
  gasType: string
  feeType?: string
  txId?: string
}): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_BASE_URL}/gasfee/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) return
      if (res.status === 401 || res.status === 403) return
      console.warn(`[logFee] Attempt ${attempt} failed: ${res.status}`)
    } catch (err) {
      console.warn(`[logFee] Attempt ${attempt} error:`, err)
    }
  }
  console.error(`[logFee] Failed to log ${payload.gasType} fee for ${payload.userId?.slice(0, 8)}`)
}
