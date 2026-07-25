import { type NextRequest, NextResponse } from "next/server"

const MIME_TYPES = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".jsx": "text/jsx",
  ".ts": "application/typescript",
  ".tsx": "text/tsx",
  ".json": "application/json",
  ".css": "text/css",
  ".html": "text/html",
  ".htm": "text/html",
  ".node": "application/node",
  ".express": "application/javascript",
  ".phantom": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
}

function getMimeType(url: string): string {
  const extension = url.split(".").pop()?.toLowerCase()
  return extension ? MIME_TYPES[`.${extension}` as keyof typeof MIME_TYPES] || "text/plain" : "text/plain"
}

function processJavaScript(content: string, targetUrl: string): string {
  try {
    content = content.replace(/(?:import\s+.*?\s+from\s+['"`])([^'"`]+)(['"`])/g, (match, modulePath, quote) => {
      if (modulePath.startsWith("http") || modulePath.startsWith("//")) {
        return match
      }
      try {
        const absoluteUrl = new URL(modulePath, targetUrl).href
        return match.replace(modulePath, `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`)
      } catch {
        return match
      }
    })

    // FIXED: $$ -> \( and \) for dynamic imports
    content = content.replace(/import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, (match, modulePath) => {
      if (modulePath.startsWith("http") || modulePath.startsWith("//")) {
        return match
      }
      try {
        const absoluteUrl = new URL(modulePath, targetUrl).href
        return `import('/api/proxy?url=${encodeURIComponent(absoluteUrl)}')`
      } catch {
        return match
      }
    })

    // FIXED: $$ -> \( and \) for require calls
    content = content.replace(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, (match, modulePath) => {
      if (modulePath.startsWith("http") || modulePath.startsWith("//")) {
        return match
      }
      try {
        const absoluteUrl = new URL(modulePath, targetUrl).href
        return `require('/api/proxy?url=${encodeURIComponent(absoluteUrl)}')`
      } catch {
        return match
      }
    })

    content = content.replace(/export\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g, (match, modulePath, quote) => {
      if (modulePath.startsWith("http") || modulePath.startsWith("//")) {
        return match
      }
      try {
        const absoluteUrl = new URL(modulePath, targetUrl).href
        return match.replace(modulePath, `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`)
      } catch {
        return match
      }
    })

    content = content.replace(/new\s+(?:Shared)?Worker\s*\(\s*['"`]([^'"`]+)['"`]/g, (match, workerPath) => {
      if (workerPath.startsWith("http") || workerPath.startsWith("//")) {
        return match
      }
      try {
        const absoluteUrl = new URL(workerPath, targetUrl).href
        return match.replace(workerPath, `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`)
      } catch {
        return match
      }
    })

    return content
  } catch (error) {
    console.error("[v0] Error processing JavaScript:", error)
    return content
  }
}

function processTypeScript(content: string, targetUrl: string): string {
  content = processJavaScript(content, targetUrl)

  content = content.replace(/(?:import\s+type\s+.*?\s+from\s+['"`])([^'"`]+)(['"`])/g, (match, modulePath, quote) => {
    if (modulePath.startsWith("http") || modulePath.startsWith("//")) {
      return match
    }
    try {
      const absoluteUrl = new URL(modulePath, targetUrl).href
      return match.replace(modulePath, `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`)
    } catch {
      return match
    }
  })

  return content
}

function processCSS(content: string, targetUrl: string): string {
  // FIXED: $$ -> \( and \) for @import url(...)
  content = content.replace(/@import\s+(?:url\()?['"`]?([^'"`()]+)['"`]?\)?/g, (match, cssPath) => {
    if (cssPath.startsWith("http") || cssPath.startsWith("//")) {
      return match
    }
    try {
      const absoluteUrl = new URL(cssPath, targetUrl).href
      return `@import url('/api/proxy?url=${encodeURIComponent(absoluteUrl)}')`
    } catch {
      return match
    }
  })

  // FIXED: $$ -> \( and \) for url() references
  content = content.replace(/url\(['"`]?([^'"`()]+)['"`]?\)/g, (match, resourcePath) => {
    if (resourcePath.startsWith("http") || resourcePath.startsWith("//") || resourcePath.startsWith("data:")) {
      return match
    }
    try {
      const absoluteUrl = new URL(resourcePath, targetUrl).href
      return `url('/api/proxy?url=${encodeURIComponent(absoluteUrl)}')`
    } catch {
      return match
    }
  })

  return content
}

function processHTML(content: string, targetUrl: string): string {
  const url = new URL(targetUrl)

  content = content.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, scriptContent) => {
    if (scriptContent.trim()) {
      const wrappedScript = `
        try {
          ${scriptContent}
        } catch (error) {
          console.error('[v0] Script error:', error);
        }
      `
      return `<script${attrs}>${wrappedScript}</script>`
    }
    return match
  })

  content = content.replace(
    /<a\s+([^>]*?)href=["'](?!http|\/\/|#|mailto:|tel:|javascript:|data:)([^"']+)["']([^>]*?)>/gi,
    (match, beforeHref, hrefUrl, afterHref) => {
      try {
        const absoluteUrl = new URL(hrefUrl, targetUrl).href
        return `<a ${beforeHref}href="/api/proxy?url=${encodeURIComponent(absoluteUrl)}"${afterHref}>`
      } catch {
        return match
      }
    },
  )

  content = content.replace(
    /<form\s+([^>]*?)action=["'](?!http|\/\/|#|mailto:|tel:|javascript:|data:)([^"']+)["']([^>]*?)>/gi,
    (match, beforeAction, actionUrl, afterAction) => {
      try {
        const absoluteUrl = new URL(actionUrl, targetUrl).href
        return `<form ${beforeAction}action="/api/proxy?url=${encodeURIComponent(absoluteUrl)}"${afterAction}>`
      } catch {
        return match
      }
    },
  )

  content = content.replace(
    /(src|data-src|srcset)=["'](?!http|\/\/|#|mailto:|tel:|data:)([^"']+)["']/gi,
    (match, attr, resourceUrl) => {
      try {
        const absoluteUrl = new URL(resourceUrl, targetUrl).href
        return `${attr}="/api/proxy?url=${encodeURIComponent(absoluteUrl)}"`
      } catch {
        return match
      }
    },
  )

  content = content.replace(/srcset=["']([^"']+)["']/gi, (match, srcset) => {
    const processedSrcset = srcset.replace(/(?!http|\/\/|data:)([^\s,]+)/g, (url: string) => {
      try {
        const absoluteUrl = new URL(url, targetUrl).href
        return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`
      } catch {
        return url
      }
    })
    return `srcset="${processedSrcset}"`
  })

  content = content.replace(/(href|src|action)=["']\/\/([^"']+)["']/gi, `$1="${url.protocol}//$2"`)

  const proxyScript = `
    <script>
      (function() {
        console.log('[v0] Proxy browser initialized for: ${targetUrl}');

        document.addEventListener('click', function(e) {
          const link = e.target.closest('a[href]');
          if (link && link.href) {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('//') && 
                !href.startsWith('#') && !href.startsWith('mailto:') && 
                !href.startsWith('tel:') && !href.startsWith('javascript:') &&
                !href.startsWith('data:')) {
              e.preventDefault();
              try {
                const absoluteUrl = new URL(href, '${targetUrl}').href;
                window.location.href = '/api/proxy?url=' + encodeURIComponent(absoluteUrl);
              } catch (error) {
                console.error('[v0] Navigation error:', error);
              }
            }
          }
        });

        document.addEventListener('submit', function(e) {
          const form = e.target;
          if (form.action && !form.action.startsWith('http') && !form.action.startsWith('//')) {
            e.preventDefault();
            try {
              const absoluteUrl = new URL(form.action, '${targetUrl}').href;
              form.action = '/api/proxy?url=' + encodeURIComponent(absoluteUrl);
              form.submit();
            } catch (error) {
              console.error('[v0] Form submission error:', error);
            }
          }
        });

        const originalLocation = window.location;
        const locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
        
        if (locationDescriptor && locationDescriptor.configurable) {
          Object.defineProperty(window, 'location', {
            get: function() { return originalLocation; },
            set: function(url) {
              if (typeof url === 'string' && !url.startsWith('http') && !url.startsWith('//') &&
                  !url.startsWith('#') && !url.startsWith('mailto:') && !url.startsWith('tel:')) {
                try {
                  const absoluteUrl = new URL(url, '${targetUrl}').href;
                  originalLocation.href = '/api/proxy?url=' + encodeURIComponent(absoluteUrl);
                } catch (error) {
                  console.error('[v0] Location change error:', error);
                  originalLocation.href = url;
                }
              } else {
                originalLocation.href = url;
              }
            }
          });
        }

        window.addEventListener('error', function(e) {
          console.error('[v0] Page error:', e.message, e.filename, e.lineno, e.colno);
        });

        window.addEventListener('unhandledrejection', function(e) {
          console.error('[v0] Unhandled promise rejection:', e.reason);
        });
      })();
    </script>
  `

  content = content.replace(
    /<head>/i,
    `<head>
      <base href="${targetUrl}">
      <meta name="referrer" content="no-referrer">
      <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
      ${proxyScript}`,
  )

  return content
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const targetUrl = searchParams.get("url")

  if (!targetUrl) {
    return NextResponse.json({ error: "URL parameter is required" }, { status: 400 })
  }

  try {
    const url = new URL(targetUrl)

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return NextResponse.json({ error: "Only HTTP and HTTPS protocols are allowed" }, { status: 400 })
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      redirect: "follow",
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Failed to fetch: ${response.status} ${response.statusText}`,
        },
        { status: response.status },
      )
    }

    const contentType = response.headers.get("content-type") || getMimeType(targetUrl)

    if (contentType.includes("application/wasm") || targetUrl.endsWith(".wasm")) {
      const buffer = await response.arrayBuffer()
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/wasm",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      })
    }

    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      let html = await response.text()
      html = processHTML(html, targetUrl)

      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Frame-Options": "SAMEORIGIN",
          "Content-Security-Policy":
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' * data: blob:; frame-ancestors 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' * blob:; worker-src 'self' blob:;",
        },
      })
    } else if (
      contentType.includes("application/javascript") ||
      contentType.includes("text/javascript") ||
      targetUrl.endsWith(".js") ||
      targetUrl.endsWith(".mjs")
    ) {
      let js = await response.text()
      js = processJavaScript(js, targetUrl)

      return new NextResponse(js, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      })
    } else if (contentType.includes("application/typescript") || targetUrl.endsWith(".ts")) {
      let ts = await response.text()
      ts = processTypeScript(ts, targetUrl)

      return new NextResponse(ts, {
        headers: {
          "Content-Type": "application/typescript; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      })
    } else if (
      contentType.includes("text/tsx") ||
      contentType.includes("text/jsx") ||
      targetUrl.endsWith(".tsx") ||
      targetUrl.endsWith(".jsx")
    ) {
      let jsx = await response.text()
      jsx = processTypeScript(jsx, targetUrl)

      return new NextResponse(jsx, {
        headers: {
          "Content-Type": contentType.includes("tsx") ? "text/tsx; charset=utf-8" : "text/jsx; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      })
    } else if (contentType.includes("text/css") || targetUrl.endsWith(".css")) {
      let css = await response.text()
      css = processCSS(css, targetUrl)

      return new NextResponse(css, {
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      })
    } else if (contentType.includes("application/json") || targetUrl.endsWith(".json")) {
      const json = await response.text()

      return new NextResponse(json, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      })
    } else {
      const buffer = await response.arrayBuffer()
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      })
    }
  } catch (error) {
    console.error("[v0] Proxy error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  const { url: targetUrl, body, headers: requestHeaders } = await request.json()

  if (!targetUrl) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 })
  }

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...requestHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.text()

    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "text/plain",
      },
    })
  } catch (error) {
    console.error("[v0] Proxy POST error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}
