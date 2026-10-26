import crypto from 'crypto'
import { safeStorage } from 'electron'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export class SecureKeyUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'SecureKeyUnavailableError'
  }
}

export interface SecureKeyProvider {
  getKey(namespace: string): Promise<string>
}

/**
 * Uses Electron's safeStorage API to encrypt/decrypt the encryption key.
 * The key is persisted as an encrypted blob in the app's userData directory.
 * safeStorage uses the OS credential backend (macOS Keychain, Windows DPAPI,
 * Linux libsecret) transparently — no native modules or permission prompts needed.
 */
export class SafeStorageKeyProvider implements SecureKeyProvider {
  async getKey(namespace: string): Promise<string> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new SecureKeyUnavailableError('Electron safeStorage encryption is not available on this system.')
    }

    const keyFileName = `${namespace}-encryption-key.enc`
    const keyFilePath = path.join(app.getPath('userData'), keyFileName)

    try {
      // Try to read existing encrypted key
      if (fs.existsSync(keyFilePath)) {
        const encryptedBuffer = fs.readFileSync(keyFilePath)
        const decrypted = safeStorage.decryptString(encryptedBuffer)
        if (decrypted) {
          return decrypted
        }
      }

      // Generate a new key and encrypt it
      const generated = crypto.randomBytes(32).toString('hex')
      const encrypted = safeStorage.encryptString(generated)
      fs.writeFileSync(keyFilePath, encrypted)
      return generated
    } catch (error) {
      throw new SecureKeyUnavailableError('Unable to access secure storage.', error)
    }
  }
}

const defaultProvider = new SafeStorageKeyProvider()

export async function getSecureStoreKey(
  namespace: string,
  provider: SecureKeyProvider = defaultProvider
): Promise<string> {
  return provider.getKey(namespace)
}
