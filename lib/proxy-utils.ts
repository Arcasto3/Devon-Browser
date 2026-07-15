import { CacheManager } from "./cache-manager"
import { WorkerPool } from "./worker-pool"

export interface ProxyResponse {
  content: string
  contentType: string
  status: number
  title?: string
  favicon?: string
  fileType?: "script" | "style" | "document" | "image" | "data" | "other"
  language?: "javascript" | "typescript" | "jsx" | "tsx" | "css" | "html" | "json" | "other"
}

let initialized = false

async function ensureInitialized() {
  if (!initialized && typeof window !== "undefined") {
    try {
      await Promise.all([
        CacheManager.init().catch((err) => console.warn("[v0] Cache init failed:", err)),
        WorkerPool.init().catch((err) => console.warn("[v0] Worker pool init failed:", err)),
      ])
      initialized = true
      console.log("[v0] Performance features initialized")
    } catch (error) {
      console.warn("[v0] Failed to initialize performance features:", error)
      initialized = true // Mark as initialized to prevent retry loops
    }
  }
}

export async function fetchThroughProxy(url: string): Promise<ProxyResponse> {
  ensureInitialized().catch(() => {})

  try {
    let cached = null
    try {
      cached = await CacheManager.get(url)
    } catch (error) {
      console.warn("[v0] Cache get failed:", error)
    }

    if (cached) {
      console.log("[v0] Cache hit for:", url)
      return {
        content: cached.content,
        contentType: cached.contentType,
        status: 200,
        title: extractTitle(cached.content, url),
        favicon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=16`,
      }
    }

    console.log("[v0] Cache miss for:", url)

    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`
    const response = await fetch(proxyUrl)

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    const contentType = response.headers.get("content-type") || "text/html"
    const content = await response.text()
    const extension = getFileExtension(url)

    let title = new URL(url).hostname
    let fileType: ProxyResponse["fileType"] = "other"
    let language: ProxyResponse["language"] = "other"

    // Determine file type and language
    if (isScriptFile(url)) {
      fileType = "script"
      if (["ts", "tsx"].includes(extension)) {
        language = "typescript"
      } else if (["jsx", "tsx"].includes(extension)) {
        language = extension as "jsx" | "tsx"
      } else if (extension === "json") {
        language = "json"
      } else {
        language = "javascript"
      }

      try {
        const parseResult = await WorkerPool.execute({
          id: `parse-${Date.now()}`,
          type: "parse",
          data: { content, url },
        })

        if (parseResult.success && parseResult.data.hasErrors) {
          console.warn("[v0] Script parsing errors:", parseResult.data.errors)
        }
      } catch (error) {
        console.warn("[v0] Failed to parse script:", error)
      }
    } else if (isStyleFile(url)) {
      fileType = "style"
      language = "css"
    } else if (contentType.includes("text/html")) {
      fileType = "document"
      language = "html"
    } else if (contentType.includes("image/")) {
      fileType = "image"
    } else if (contentType.includes("application/json")) {
      fileType = "data"
      language = "json"
    }

    if (contentType.includes("text/html")) {
      title = extractTitle(content, url)
    }

    try {
      await CacheManager.set({
        url,
        content,
        contentType,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.warn("[v0] Failed to cache response:", error)
    }

    return {
      content,
      contentType,
      status: response.status,
      title,
      favicon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=16`,
      fileType,
      language,
    }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to fetch through proxy")
  }
}

function extractTitle(content: string, url: string): string {
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i)
  return titleMatch ? titleMatch[1].trim() : new URL(url).hostname
}

export function isValidUrl(string: string): boolean {
  try {
    new URL(string)
    return true
  } catch {
    return false
  }
}

export function formatUrl(input: string): string {
  const trimmed = input.trim()

  // If it looks like a search query, use a search engine
  if (!trimmed.includes(".") || trimmed.includes(" ")) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
  }

  // Add protocol if missing
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `https://${trimmed}`
  }

  return trimmed
}

export function getFileExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const extension = pathname.split(".").pop()?.toLowerCase()
    return extension || ""
  } catch {
    return ""
  }
}

export function isScriptFile(url: string): boolean {
  const extension = getFileExtension(url)
  const scriptExtensions = ["js", "mjs", "jsx", "ts", "tsx", "json", "phantom"]
  return scriptExtensions.includes(extension)
}

export function isStyleFile(url: string): boolean {
  const extension = getFileExtension(url)
  return extension === "css"
}

export function isReactFile(url: string): boolean {
  const extension = getFileExtension(url)
  return ["jsx", "tsx"].includes(extension)
}

export function isNodeFile(url: string): boolean {
  const extension = getFileExtension(url)
  const nodeExtensions = ["js", "mjs", "ts", "json", "node", "express"]
  return nodeExtensions.includes(extension)
}
