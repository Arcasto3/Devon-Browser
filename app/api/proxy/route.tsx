import { type NextRequest, NextResponse } from "next/server"

// Regex patterns built via RegExp constructor to prevent bundler escaping issues
const IMPORT_FROM_RE = new RegExp(
  '(?:import\\s+.*?\\s+from\\s+[\'"`])([^\'"`]+)([\'"`])',
  'g'
)
const REQUIRE_RE = new RegExp(
  'require\\s*[(]\\s*[\'"`]([^\'"`]+)[\'"`]\\s*[)]',
  'g'
)
const IMPORT_TYPE_RE = new RegExp(
  '(?:import\\s+type\\s+.*?\\s+from\\s+[\'"`])([^\'"`]+)([\'"`])',
  'g'
)
const CSS_IMPORT_RE = new RegExp(
  '@import\\s+(?:url[(])?[\'"`]?([^\'"`()]+)[\'"`]?[)]?',
  'g'
)
const CSS_URL_RE = new RegExp(
  'url[(][\'"`]?([^\'"`()]+)[\'"`]?[)]',
  'g'
)

function processJavaScript(content: string, targetUrl: string): string {
  content = content.replace(
    new RegExp(IMPORT_FROM_RE.source, IMPORT_FROM_RE.flags),
    (match: string, modulePath: string, quote: string) => {
      if (modulePath.startsWith("http") || modulePath.startsWith("//")) return match
      try {
        const absoluteUrl = new URL(modulePath, targetUrl).href
        return match.replace(modulePath, `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`)
      } catch { return match }
    }
  )

  content = content.replace(
    new RegExp(REQUIRE_RE.source, REQUIRE_RE.flags),
    (match: string, modulePath: string) => {
      if (modulePath.startsWith("http") || modulePath.startsWith("//")) return match
      try {
        const absoluteUrl = new URL(modulePath, targetUrl).href
        return `require('/api/proxy?url=${encodeURIComponent(absoluteUrl)}')`
      } catch { return match }
    }
  )

  return content
}

function processTypeScript(content: string, targetUrl: string): string {
  content = processJavaScript(content, targetUrl)

  content = content.replace(
    new RegExp(IMPORT_TYPE_RE.source, IMPORT_TYPE_RE.flags),
    (match: string, modulePath: string) => {
      if (modulePath.startsWith("http") || modulePath.startsWith("//")) return match
      try {
        const absoluteUrl = new URL(modulePath, targetUrl).href
        return match.replace(modulePath, `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`)
      } catch { return match }
    }
  )

  return content
}

function processCSS(content: string, targetUrl: string): string {
  content = content.replace(
    new RegExp(CSS_IMPORT_RE.source, CSS_IMPORT_RE.flags),
    (match: string, cssPath: string) => {
      if (cssPath.startsWith("http") || cssPath.startsWith("//")) return match
      try {
        const absoluteUrl = new URL(cssPath, targetUrl).href
        return `@import url('/api/proxy?url=${encodeURIComponent(absoluteUrl)}')`
      } catch { return match }
    }
  )

  content = content.replace(
    new RegExp(CSS_URL_RE.source, CSS_URL_RE.flags),
    (match: string, resourcePath: string) => {
      if (resourcePath.startsWith("http") || resourcePath.startsWith("//") || resourcePath.startsWith("data:")) return match
      try {
        const absoluteUrl = new URL(resourcePath, targetUrl).href
        return `url('/api/proxy?url=${encodeURIComponent(absoluteUrl)}')`
      } catch { return match }
    }
  )

  return content
}

function processHTML(content: string, targetUrl: string): string {
  const url = new URL(targetUrl)

  // Handle anchor tags with relative href
  content = content.replace(
    /<a\s+([^>]*?)href=["'](?!http|\/\/|#|mailto:|tel:|javascript:|data:)([^"']+)["']([^>]*?)>/gi,
    (match, before, hrefUrl, after) => {
      try {
        const abs = new URL(hrefUrl, targetUrl).href
        return `<a ${before}href="/api/proxy?url=${encodeURIComponent(abs)}"${after}>`
      } catch { return match }
    }
  )

  // Handle form actions
  content = content.replace(
    /<form\s+([^>]*?)action=["'](?!http|\/\/|#|mailto:|tel:|javascript:|data:)([^"']+)["']([^>]*?)>/gi,
    (match, before, actionUrl, after) => {
      try {
        const abs = new URL(actionUrl, targetUrl).href
        return `<form ${before}action="/api/proxy?url=${encodeURIComponent(abs)}"${after}>`
      } catch { return match }
    }
  )

  // Handle resource attributes (src, data-src)
  content = content.replace(
    /(src|data-src)=["'](?!http|\/\/|#|mailto:|tel:|data:)([^"']+)["']/gi,
    (match, attr, resourceUrl) => {
      try {
        const abs = new URL(resourceUrl, targetUrl).href
        return `${attr}="/api/proxy?url=${encodeURIComponent(abs)}"`
      } catch { return match }
    }
  )

  // Handle CSS link tags with relative href
  content = content.replace(
    /<link\s+([^>]*?)href=["'](?!http|\/\/|data:)([^"']+)["']([^>]*?)>/gi,
    (match, before, hrefUrl, after) => {
      try {
        const abs = new URL(hrefUrl, targetUrl).href
        return `<link ${before}href="/api/proxy?url=${encodeURIComponent(abs)}"${after}>`
      } catch { return match }
    }
  )

  // Replace protocol-relative URLs
  content = content.replace(
    /(href|src|action)=["']\/\/([^"']+)["']/gi,
    `$1="${url.protocol}//$2"`
  )

  const proxyScript = `
    <script>
      (function() {
        document.addEventListener('click', function(e) {
          var link = e.target.closest('a[href]');
          if (link && link.href) {
            var href = link.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('//') &&
                !href.startsWith('#') && !href.startsWith('mailto:') &&
                !href.startsWith('tel:') && !href.startsWith('javascript:') &&
                !href.startsWith('data:') && !href.startsWith('/api/proxy')) {
              e.preventDefault();
              try {
                var absoluteUrl = new URL(href, '${targetUrl}').href;
                window.parent.postMessage({ type: 'proxy-navigate', url: absoluteUrl }, '*');
              } catch(err) { console.error('Proxy nav error:', err); }
            } else if (href && (href.startsWith('http') || href.startsWith('//'))) {
              e.preventDefault();
              var fullUrl = href.startsWith('//') ? '${url.protocol}' + href : href;
              window.parent.postMessage({ type: 'proxy-navigate', url: fullUrl }, '*');
            }
          }
        });

        document.addEventListener('submit', function(e) {
          var form = e.target;
          if (form.action && !form.action.startsWith('http') && !form.action.startsWith('//')) {
            e.preventDefault();
            try {
              var absoluteUrl = new URL(form.action, '${targetUrl}').href;
              form.action = '/api/proxy?url=' + encodeURIComponent(absoluteUrl);
              form.submit();
            } catch(err) { console.error('Proxy form error:', err); }
          }
        });
      })();
    </script>
  `

  // Inject base tag, meta tags, and proxy script into head
  content = content.replace(
    /<head[^>]*>/i,
    `$&
      <base href="${targetUrl}">
      <meta name="referrer" content="no-referrer">
      ${proxyScript}`
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

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
      },
      redirect: "follow",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "")
      return NextResponse.json(
        { error: `Failed to fetch: ${response.status} ${response.statusText}`, details: errorBody.substring(0, 500) },
        { status: response.status }
      )
    }

    const contentType = response.headers.get("content-type") || "text/plain"

    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      let html = await response.text()
      html = processHTML(html, targetUrl)
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Frame-Options": "SAMEORIGIN",
          "Content-Security-Policy": "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors 'self';",
        },
      })
    } else if (contentType.includes("javascript") || targetUrl.endsWith(".js") || targetUrl.endsWith(".mjs")) {
      let js = await response.text()
      js = processJavaScript(js, targetUrl)
      return new NextResponse(js, {
        headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" },
      })
    } else if (contentType.includes("typescript") || targetUrl.endsWith(".ts") || targetUrl.endsWith(".tsx")) {
      let ts = await response.text()
      ts = processTypeScript(ts, targetUrl)
      return new NextResponse(ts, {
        headers: { "Content-Type": "application/typescript; charset=utf-8", "Cache-Control": "public, max-age=3600" },
      })
    } else if (contentType.includes("text/css") || targetUrl.endsWith(".css")) {
      let css = await response.text()
      css = processCSS(css, targetUrl)
      return new NextResponse(css, {
        headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" },
      })
    } else if (contentType.includes("application/json") || targetUrl.endsWith(".json")) {
      const json = await response.text()
      return new NextResponse(json, {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
      })
    } else {
      const buffer = await response.arrayBuffer()
      return new NextResponse(buffer, {
        headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
      })
    }
  } catch (error) {
    const msg = error instanceof Error
      ? error.name === "AbortError" ? "Request timeout" : error.message
      : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { url: targetUrl, body, headers: reqHeaders } = await request.json()

  if (!targetUrl) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 })
  }

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...reqHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.text()
    return new NextResponse(data, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "text/plain" },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
