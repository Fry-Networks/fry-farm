/**
 * Event Caller Crypto — AES-256-GCM encryption for per-event Algorand keypairs.
 *
 * Each on-chain vesting event gets a dedicated Algorand account (event_caller).
 * The private key is encrypted with a master key (from 1Password) and stored
 * in the event's MongoDB record. A backend cron job decrypts it post-event
 * to call seed_bulk + finalize on the contract.
 *
 * Master key env var: EVENT_CALLER_MASTER_KEY (64 hex chars = 32 bytes)
 */

const crypto = require('crypto');
const algosdk = require('algosdk');

/**
 * Generate a fresh Algorand keypair for an event caller.
 * @returns {{ address: string, secretKey: Buffer }}
 */
function generateEventCaller() {
  const account = algosdk.generateAccount();
  return {
    address: account.addr.toString(),
    secretKey: Buffer.from(account.sk),
  };
}

/**
 * Encrypt an Algorand secret key with AES-256-GCM.
 * @param {Buffer} secretKeyBuffer - Raw secret key bytes (64 bytes)
 * @param {string} masterKeyHex - 32-byte master key as 64 hex chars
 * @returns {{ ciphertext: string, iv: string, authTag: string }} base64-encoded fields
 */
function encryptSecretKey(secretKeyBuffer, masterKeyHex) {
  const masterKey = Buffer.from(masterKeyHex, 'hex');
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(secretKeyBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypt an Algorand secret key from its encrypted form.
 * @param {{ ciphertext: string, iv: string, authTag: string }} encryptedData
 * @param {string} masterKeyHex - 32-byte master key as 64 hex chars
 * @returns {Buffer} Raw secret key bytes
 */
function decryptSecretKey(encryptedData, masterKeyHex) {
  const masterKey = Buffer.from(masterKeyHex, 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    masterKey,
    Buffer.from(encryptedData.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedData.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted;
}

module.exports = { generateEventCaller, encryptSecretKey, decryptSecretKey };
