import FingerprintJS from '@fingerprintjs/fingerprintjs'

let fpPromise: Promise<string> | null = null

export async function getFingerprint(): Promise<string> {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load()
      .then(fp => fp.get())
      .then(result => result.visitorId)
      .catch(err => {
        fpPromise = null
        console.error('FingerprintJS failed:', err)
        return `fallback-${crypto.randomUUID()}`
      })
  }
  return fpPromise
}
