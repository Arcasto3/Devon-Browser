interface CacheEntry {
  url: string
  content: string
  contentType: string
  timestamp: number
  etag?: string
  headers?: Record<string, string>
}

interface CacheStats {
  hits: number
  misses: number
  size: number
}

export class CacheManager {
  private static DB_NAME = "proxy-browser-cache"
  private static DB_VERSION = 1
  private static STORE_NAME = "resources"
  private static MAX_CACHE_SIZE = 100 * 1024 * 1024 // 100MB
  private static CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours
  private static db: IDBDatabase | null = null
  private static stats: CacheStats = { hits: 0, misses: 0, size: 0 }
  private static initPromise: Promise<void> | null = null

  static async init(): Promise<void> {
    if (typeof window === "undefined" || typeof indexedDB === "undefined") {
      console.warn("[v0] IndexedDB not available")
      return Promise.resolve()
    }

    if (this.initPromise) {
      return this.initPromise
    }

    if (this.db) {
      return Promise.resolve()
    }

    this.initPromise = new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

        request.onerror = () => {
          console.warn("[v0] IndexedDB init error:", request.error)
          resolve() // Resolve instead of reject to allow graceful degradation
        }

        request.onsuccess = () => {
          this.db = request.result
          this.calculateCacheSize().catch(() => {})
          console.log("[v0] Cache manager initialized")
          resolve()
        }

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains(this.STORE_NAME)) {
            const store = db.createObjectStore(this.STORE_NAME, { keyPath: "url" })
            store.createIndex("timestamp", "timestamp", { unique: false })
          }
        }
      } catch (error) {
        console.warn("[v0] IndexedDB not supported:", error)
        resolve() // Resolve to allow app to continue without caching
      }
    })

    return this.initPromise
  }

  static async get(url: string): Promise<CacheEntry | null> {
    if (!this.db) {
      await this.init()
      if (!this.db) return null // Cache not available
    }

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([this.STORE_NAME], "readonly")
        const store = transaction.objectStore(this.STORE_NAME)
        const request = store.get(url)

        request.onsuccess = () => {
          const entry = request.result as CacheEntry | undefined
          if (entry && Date.now() - entry.timestamp < this.CACHE_DURATION) {
            this.stats.hits++
            console.log("[v0] Cache hit for:", url)
            resolve(entry)
          } else {
            this.stats.misses++
            console.log("[v0] Cache miss for:", url)
            if (entry) this.delete(url).catch(() => {}) // Remove expired entry
            resolve(null)
          }
        }

        request.onerror = () => {
          this.stats.misses++
          console.warn("[v0] Cache get error:", request.error)
          resolve(null)
        }
      } catch (error) {
        console.warn("[v0] Cache get exception:", error)
        resolve(null)
      }
    })
  }

  static async set(entry: CacheEntry): Promise<void> {
    if (!this.db) {
      await this.init()
      if (!this.db) return // Cache not available
    }

    // Check cache size and evict if necessary
    await this.evictIfNeeded(entry.content.length)

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([this.STORE_NAME], "readwrite")
        const store = transaction.objectStore(this.STORE_NAME)
        const request = store.put(entry)

        request.onsuccess = () => {
          this.stats.size += entry.content.length
          resolve()
        }
        request.onerror = () => {
          console.warn("[v0] Cache set error:", request.error)
          resolve()
        }
      } catch (error) {
        console.warn("[v0] Cache set exception:", error)
        resolve()
      }
    })
  }

  static async delete(url: string): Promise<void> {
    if (!this.db) await this.init()
    if (!this.db) return

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([this.STORE_NAME], "readwrite")
        const store = transaction.objectStore(this.STORE_NAME)
        const request = store.delete(url)

        request.onsuccess = () => resolve()
        request.onerror = () => {
          console.warn("[v0] Cache delete error:", request.error)
          resolve()
        }
      } catch (error) {
        console.warn("[v0] Cache delete exception:", error)
        resolve()
      }
    })
  }

  static async clear(): Promise<void> {
    if (!this.db) await this.init()
    if (!this.db) return

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([this.STORE_NAME], "readwrite")
        const store = transaction.objectStore(this.STORE_NAME)
        const request = store.clear()

        request.onsuccess = () => {
          this.stats = { hits: 0, misses: 0, size: 0 }
          console.log("[v0] Cache cleared")
          resolve()
        }
        request.onerror = () => {
          console.warn("[v0] Cache clear error:", request.error)
          resolve()
        }
      } catch (error) {
        console.warn("[v0] Cache clear exception:", error)
        resolve()
      }
    })
  }

  private static async calculateCacheSize(): Promise<void> {
    if (!this.db) return

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([this.STORE_NAME], "readonly")
        const store = transaction.objectStore(this.STORE_NAME)
        const request = store.getAll()

        request.onsuccess = () => {
          const entries = request.result as CacheEntry[]
          this.stats.size = entries.reduce((sum, entry) => sum + entry.content.length, 0)
          resolve()
        }
        request.onerror = () => {
          console.warn("[v0] Cache size calculation error:", request.error)
          resolve()
        }
      } catch (error) {
        console.warn("[v0] Cache size calculation exception:", error)
        resolve()
      }
    })
  }

  private static async evictIfNeeded(newEntrySize: number): Promise<void> {
    if (this.stats.size + newEntrySize <= this.MAX_CACHE_SIZE) return
    if (!this.db) return

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([this.STORE_NAME], "readwrite")
        const store = transaction.objectStore(this.STORE_NAME)
        const index = store.index("timestamp")
        const request = index.openCursor()

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result
          if (cursor && this.stats.size + newEntrySize > this.MAX_CACHE_SIZE) {
            const entry = cursor.value as CacheEntry
            this.stats.size -= entry.content.length
            cursor.delete()
            cursor.continue()
          } else {
            resolve()
          }
        }

        request.onerror = () => {
          console.warn("[v0] Cache eviction error:", request.error)
          resolve()
        }
      } catch (error) {
        console.warn("[v0] Cache eviction exception:", error)
        resolve()
      }
    })
  }

  static getStats(): CacheStats {
    return { ...this.stats }
  }
}
