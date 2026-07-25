export interface ProxyResponse {
  content: string
  contentType: string
  status: number
  title?: string
  favicon?: string
  fileType?: "script" | "style" | "document" | "image" | "data" | "other"
  language?: "javascript" | "typescript" | "jsx" | "tsx" | "css" | "html" | "json" | "other"
}

export async function fetchThroughProxy(url: string): Promise<ProxyResponse> {
  console.log("[v0] Fetching URL:", url)
  try {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`
    const response = await fetch(proxyUrl)

    console.log("[v0] Proxy response status:", response.status, response.statusText)

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`
      let errorDetails = ""
      try {
        const error = await response.json()
        errorMessage = error.error || errorMessage
        errorDetails = error.details || ""
        console.error("[v0] Proxy error details:", errorMessage, errorDetails)
      } catch {
        // If response is not JSON, try to get text
        try {
          const errorText = await response.text()
          if (errorText) {
            errorMessage = errorText.substring(0, 200) // Limit error message length
            console.error("[v0] Proxy error text:", errorMessage)
          }
        } catch {
          // Use default error message
        }
      }
      throw new Error(errorMessage)
    }

    const contentType = response.headers.get("content-type") || "text/html"
    console.log("[v0] Content type:", contentType)

    let content: string
    if (
      contentType.includes("image/") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("application/pdf") ||
      contentType.includes("application/zip")
    ) {
      // For binary content, convert to data URL
      const blob = await response.blob()
      content = URL.createObjectURL(blob)
    } else {
      content = await response.text()
      console.log("[v0] Content length:", content.length)
    }

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
      const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch) {
        title = titleMatch[1].trim()
      }
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
    console.error("[v0] Proxy fetch error:", error)
    throw new Error(error instanceof Error ? error.message : "Failed to fetch through proxy")
  }
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
