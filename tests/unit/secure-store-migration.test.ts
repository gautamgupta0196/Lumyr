import { beforeEach, describe, expect, it, vi } from 'vitest'

type StoreKey = `${string}:${string}`
const stateByStoreAndKey = new Map<StoreKey, Record<string, unknown>>()
const decryptionFailureInjectedFor = new Set<string>()

class MockStore<T extends Record<string, unknown>> {
  private data: Record<string, unknown>
  private stateKey: StoreKey

  constructor(options: { name: string; encryptionKey?: string; defaults?: T }) {
    const encryptionKey = options.encryptionKey ?? 'plain'
    this.stateKey = `${options.name}:${encryptionKey}`

    if (!stateByStoreAndKey.has(this.stateKey)) {
      if (encryptionKey === 'new-key' && !decryptionFailureInjectedFor.has(options.name)) {
        decryptionFailureInjectedFor.add(options.name)
        throw new Error('Failed to decrypt with new key')
      }

      stateByStoreAndKey.set(this.stateKey, { ...(options.defaults ?? {}) })
    }

    this.data = { ...(stateByStoreAndKey.get(this.stateKey) ?? {}) }
  }

  get store(): T {
    return this.data as T
  }

  set store(value: T) {
    this.data = { ...value }
    stateByStoreAndKey.set(this.stateKey, this.data)
  }

  get(key: string, defaultValue?: unknown): unknown {
    return this.data[key] ?? defaultValue
  }

  set(key: string, value: unknown): void {
    this.data[key] = value
    stateByStoreAndKey.set(this.stateKey, this.data)
  }

  delete(key: string): void {
    delete this.data[key]
    stateByStoreAndKey.set(this.stateKey, this.data)
  }
}

vi.mock('electron-store', () => ({
  default: MockStore
}))

describe('secure store initialization', () => {
  beforeEach(() => {
    stateByStoreAndKey.clear()
    decryptionFailureInjectedFor.clear()
    vi.resetModules()
  })

  it('migrates credentials data from legacy key to secure key', async () => {
    stateByStoreAndKey.set('lumyr-credentials:lumyr-secure-key-2024', {
      bigquery: {},
      anthropicApiKey: 'legacy-secret'
    })

    const { initializeEncryptedStoreWithMigration } = await import('../../electron/store.js')

    const store = initializeEncryptedStoreWithMigration(
      {
        name: 'lumyr-credentials',
        defaults: { bigquery: {} },
        legacyKeys: ['lumyr-secure-key-2024']
      },
      'new-key'
    )

    expect(store.get('anthropicApiKey')).toBe('legacy-secret')
    expect(stateByStoreAndKey.get('lumyr-credentials:new-key')?.anthropicApiKey).toBe('legacy-secret')
  })

  it('throws and keeps secure stores uninitialized when key provider fails', async () => {
    const storeModule = await import('../../electron/store.js')

    await expect(
      storeModule.initializeSecureStores({
        getKey: vi.fn().mockRejectedValue(new Error('key backend unavailable'))
      })
    ).rejects.toThrow('key backend unavailable')

    expect(() => storeModule.getAnthropicApiKey()).toThrow('Secure stores are not initialized')
  })
})
