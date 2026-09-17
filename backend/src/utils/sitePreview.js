// sitePreview.js — given a blog post's source link, fetches that page and
// pulls out whatever image best represents the site: og:image first (what
// the site itself designates as its share/preview image), falling back to
// twitter:image, then a plain <link rel="icon"> favicon. Used by
// GET /api/blog/site-preview so the admin "Use site picture" button can
// fill in the cover photo automatically instead of the admin hunting down
// an image link by hand.
const fetch = require('node-fetch');

const META_PATTERNS = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
];
const ICON_PATTERNS = [
  /<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i,
  /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["']/i,
];
const SITE_NAME_PATTERN = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i;

function resolveUrl(maybeRelative, base) {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

async function fetchSitePreview(sourceUrl) {
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarqueeBot/1.0; +https://example.com)' },
    redirect: 'follow',
    size: 2 * 1024 * 1024, // 2MB cap — we only need the <head>, no reason to pull a whole heavy page
  });
  if (!res.ok) throw new Error(`Source page returned ${res.status}`);
  const html = await res.text();

  let imageUrl = null;
  for (const pattern of META_PATTERNS) {
    const m = html.match(pattern);
    if (m) { imageUrl = resolveUrl(m[1], sourceUrl); if (imageUrl) break; }
  }
  if (!imageUrl) {
    for (const pattern of ICON_PATTERNS) {
      const m = html.match(pattern);
      if (m) { imageUrl = resolveUrl(m[1], sourceUrl); if (imageUrl) break; }
    }
  }
  // Last resort: the default /favicon.ico most sites serve even with no
  // <link rel="icon"> in the markup at all.
  if (!imageUrl) imageUrl = resolveUrl('/favicon.ico', sourceUrl);

  const siteNameMatch = html.match(SITE_NAME_PATTERN);
  const siteName = siteNameMatch ? siteNameMatch[1] : new URL(sourceUrl).hostname.replace(/^www\./, '');

  return { imageUrl, siteName };
}

module.exports = { fetchSitePreview };
