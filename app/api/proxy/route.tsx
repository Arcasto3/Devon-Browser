import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// MIME types mapping
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".jsx": "application/javascript",
  ".ts": "application/javascript",
  ".tsx": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

// Helper function to get MIME type from URL
function getMimeType(url: string): string {
  const extension = new URL(url).pathname.split(".").pop()?.toLowerCase() || "";
  return MIME_TYPES[`.${extension}`] || "application/octet-stream";
}

// Helper function to process JavaScript content
function processJavaScript(content: string, targetUrl: string): string {
  return content.replace(
    /(import|require|export|new URL\()(["'`])(?!https?:\/\/|\/\/|data:|chrome-extension:)(.*?)\2/g,
    (match, keyword, quote, url) => {
      try {
        const absoluteUrl = new URL(url, targetUrl).href;
        return `${keyword}${quote}${absoluteUrl}${quote}`;
      } catch {
        return match;
      }
    }
  );
}

// Helper function to process TypeScript content
function processTypeScript(content: string, targetUrl: string): string {
  return processJavaScript(content, targetUrl).replace(
    /import type\s*{([^}]*)}\s*from\s*(["'`])(?!https?:\/\/|\/\/|data:|chrome-extension:)(.*?)\2/g,
    (match, types, quote, url) => {
      try {
        const absoluteUrl = new URL(url, targetUrl).href;
        return `import type {${types}} from ${quote}${absoluteUrl}${quote}`;
      } catch {
        return match;
      }
    }
  );
}

// Helper function to process CSS content
function processCSS(content: string, targetUrl: string): string {
  return content.replace(
    /(@import\s+["'`])(?!https?:\/\/|\/\/|data:)(.*?)\1|(url\()(["'`])(?!https?:\/\/|\/\/|data:)(.*?)\4/g,
    (match, importQuote, importUrl, urlPrefix, urlQuote, url) => {
      try {
        const absoluteUrl = new URL(url, targetUrl).href;
        if (importUrl) {
          return `@import ${importQuote}${absoluteUrl}${importQuote}`;
        } else {
          return `url(${urlPrefix}${absoluteUrl}${urlQuote}`;
        }
      } catch {
        return match;
      }
    }
  );
}

// Helper function to process HTML content
function processHTML(content: string, targetUrl: string): string {
  let processed = content
    .replace(
      /(href|src)="(?!https?:\/\/|\/\/|data:|mailto:|tel:|#)(.*?)"/g,
      (match, attr, url) => {
        try {
          const absoluteUrl = new URL(url, targetUrl).href;
          return `${attr}="${absoluteUrl}"`;
        } catch {
          return match;
        }
      }
    )
    .replace(
      /<form\s+action="(?!https?:\/\/|\/\/|data:|mailto:)(.*?)"/g,
      (match, url) => {
        try {
          const absoluteUrl = new URL(url, targetUrl).href;
          return `<form action="${absoluteUrl}"`;
        } catch {
          return match;
        }
      }
    )
    .replace(
      /<script\s+src="(?!https?:\/\/|\/\/|data:)(.*?)"/g,
      (match, url) => {
        try {
          const absoluteUrl = new URL(url, targetUrl).href;
          return `<script src="${absoluteUrl}"`;
        } catch {
          return match;
        }
      }
    );

  // Inject client-side proxy script to handle navigation and form submission
  processed = processed.replace(
    "</body>",
    `
      <script>
        document.addEventListener('click', (e) => {
          const link = e.target.closest('a');
          if (link && !link.href.startsWith('http') && !link.href.startsWith('//')) {
            e.preventDefault();
            window.location.href = link.href;
          }
        });

        document.addEventListener('submit', (e) => {
          const form = e.target;
          if (form.tagName === 'FORM') {
            e.preventDefault();
            const formData = new FormData(form);
            fetch(form.action, {
              method: form.method,
              body: formData,
            }).then(response => response.text()).then(html => {
              document.open();
              document.write(html);
              document.close();
            });
          }
        });
      </script>
    </body>`
  );

  return processed;
}

// Main API handler
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    return new NextResponse("Missing target URL", { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "*/*",
      },
      redirect: "manual", // Changed to "manual" to handle redirects
    });

    // Handle redirects manually
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        try {
          const absoluteLocation = new URL(location, targetUrl).href;
          const proxiedLocation = `/api/proxy?url=${encodeURIComponent(absoluteLocation)}`;
          return NextResponse.redirect(proxiedLocation, response.status);
        } catch {
          // Fallback: redirect as-is if URL parsing fails
          return NextResponse.redirect(location, response.status);
        }
      }
    }

    if (!response.ok) {
      return new NextResponse("Failed to fetch", { status: response.status });
    }

    const contentType = response.headers.get("content-type") || getMimeType(targetUrl);
    const html = await response.text();

    // Process content based on MIME type
    let processedContent = html;
    if (contentType.includes("text/html")) {
      processedContent = processHTML(html, targetUrl);
    } else if (contentType.includes("application/javascript") || contentType.includes("text/javascript")) {
      processedContent = processJavaScript(html, targetUrl);
    } else if (contentType.includes("text/typescript")) {
      processedContent = processTypeScript(html, targetUrl);
    } else if (contentType.includes("text/css")) {
      processedContent = processCSS(html, targetUrl);
    }

    return new NextResponse(processedContent, {
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    return new NextResponse("Error fetching or processing the resource", { status: 500 });
  }
}

// POST handler (unchanged)
export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  const { url: targetUrl, body, headers: customHeaders } = await request.json();

  if (!targetUrl) {
    return new NextResponse("Missing target URL", { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Content-Type": "application/json",
        ...customHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return new NextResponse("Failed to fetch", { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const content = await response.text();

    return new NextResponse(content, {
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    return new NextResponse("Error fetching or processing the resource", { status: 500 });
  }
}
