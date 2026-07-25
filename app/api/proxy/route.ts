import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const targetUrl = searchParams.get("url")

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
  }

  try {
    // Validate URL format
    new URL(targetUrl)
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
  }

  try {
    console.log("[v0] API Proxy: Fetching", targetUrl)

    const headers = new Headers({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "http://localhost:3000/",
      Origin: "http://localhost:3000",
    })

    // Remove headers that might cause issues
    headers.delete("host")
    headers.delete("connection")

    const response = await fetch(targetUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(30000), // 30 second timeout
    })

    console.log("[v0] API Proxy: Response status", response.status)

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `HTTP ${response.status}`,
          details: response.statusText,
        },
        { status: response.status }
      )
    }

    const contentType = response.headers.get("content-type") || "text/html"
    const contentLength = response.headers.get("content-length")

    // Handle binary content (images, PDFs, etc.)
    if (
      contentType.includes("image/") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("application/pdf") ||
      contentType.includes("font/") ||
      contentType.includes("application/x-font")
    ) {
      const buffer = await response.arrayBuffer()
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          "Content-Type": contentType,
          "Content-Length": contentLength || buffer.byteLength.toString(),
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      })
    }

    // Handle text content (HTML, CSS, JS, etc.)
    let content = await response.text()

    // For HTML content, rewrite URLs to go through proxy
    if (contentType.includes("text/html")) {
      content = rewriteHtmlUrls(content, targetUrl)
    }

    // For CSS content, rewrite URLs to go through proxy
    if (contentType.includes("text/css")) {
      content = rewriteCssUrls(content, targetUrl)
    }

    return new NextResponse(content, {
      status: response.status,
      headers: {
        "Content-Type": contentType + "; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("[v0] API Proxy: Error", error)

    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    if (errorMessage.includes("timeout")) {
      return NextResponse.json(
        {
          error: "Request timeout",
          details: "The target website took too long to respond",
        },
        { status: 504 }
      )
    }

    if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ENOTFOUND")) {
      return NextResponse.json(
        {
          error: "Connection failed",
          details: "Could not reach the target website",
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      {
        error: "Proxy error",
        details: errorMessage,
      },
      { status: 502 }
    )
  }
}

function rewriteHtmlUrls(html: string, baseUrl: string): string {
  const baseUrlObj = new URL(baseUrl)
  const baseOrigin = baseUrlObj.origin

  // Rewrite href attributes (links, stylesheets)
  html = html.replace(/href=["'](?!(?:http|data:|#|javascript:|mailto:))/g, (match) => {
    return match + `/api/proxy?url=${encodeURIComponent(baseOrigin)}/`
  })

  // Rewrite src attributes (images, scripts)
  html = html.replace(/src=["'](?!(?:http|data:|#|javascript:|blob:))/g, (match) => {
    return match + `/api/proxy?url=${encodeURIComponent(baseOrigin)}/`
  })

  // Rewrite srcset attributes (responsive images)
  html = html.replace(/srcset=["']([^"']*?)["']/g, (match, srcset) => {
    const rewritten = srcset
      .split(",")
      .map((src: string) => {
        const parts = src.trim().split(/\s+/)
        const url = parts[0]
        if (url && !url.match(/^(?:http|data:|#|javascript:|blob:)/)) {
          const absoluteUrl = new URL(url, baseUrl).href
          return `/api/proxy?url=${encodeURIComponent(absoluteUrl)} ${parts.slice(1).join(" ")}`
        }
        return src
      })
      .join(",")
    return `srcset="${rewritten}"`
  })

  // Rewrite inline CSS
  html = html.replace(/style=["']([^"']*?)["']/g, (match, style) => {
    const rewritten = style.replace(/url\((?!(?:http|data:|#|javascript:|blob:))([^)]+)\)/g, (urlMatch: string, url: string) => {
      const cleanUrl = url.replace(/^['"]|['"]$/g, "")
      if (!cleanUrl.match(/^(?:http|data:|#|javascript:|blob:)/)) {
        const absoluteUrl = new URL(cleanUrl, baseUrl).href
        return `url(/api/proxy?url=${encodeURIComponent(absoluteUrl)})`
      }
      return urlMatch
    })
    return `style="${rewritten}"`
  })

  return html
}

function rewriteCssUrls(css: string, baseUrl: string): string {
  const baseUrlObj = new URL(baseUrl)

  // Rewrite url() references in CSS
  css = css.replace(/url\((?!(?:http|data:|#|javascript:|blob:))([^)]+)\)/g, (match, url) => {
    const cleanUrl = url.replace(/^['"]|['"]$/g, "")

    if (cleanUrl.match(/^(?:http|data:|#|javascript:|blob:)/)) {
      return match
    }

    try {
      const absoluteUrl = new URL(cleanUrl, baseUrl).href
      return `url(/api/proxy?url=${encodeURIComponent(absoluteUrl)})`
    } catch {
      return match
    }
  })

  // Rewrite @import statements
  css = css.replace(/@import\s+(?:url\()?(?!(?:http|data:|#|javascript:|blob:))([^);]+)\)?/g, (match, url) => {
    const cleanUrl = url.replace(/^['"]|['"]$/g, "").trim()

    if (cleanUrl.match(/^(?:http|data:|#|javascript:|blob:)/)) {
      return match
    }

    try {
      const absoluteUrl = new URL(cleanUrl, baseUrl).href
      return `@import url(/api/proxy?url=${encodeURIComponent(absoluteUrl)})`
    } catch {
      return match
    }
  })

  return css
}
