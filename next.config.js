/** @type {import('next').NextConfig} */
const nextConfig = {
  redirects: async () => {
    return [
      // Redirect /browse to home
      {
        source: "/browse",
        destination: "/",
        permanent: false,
      },
      // Redirect /proxy to home
      {
        source: "/proxy",
        destination: "/",
        permanent: false,
      },
      // Redirect /browser to home
      {
        source: "/browser",
        destination: "/",
        permanent: false,
      },
      // Redirect /bookmarks to home (bookmarks are accessed via the main app)
      {
        source: "/bookmarks",
        destination: "/",
        permanent: false,
      },
      // Redirect /history to home
      {
        source: "/history",
        destination: "/",
        permanent: false,
      },
      // Redirect trailing slashes to non-trailing versions
      {
        source: "/:path+/",
        destination: "/:path+",
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
