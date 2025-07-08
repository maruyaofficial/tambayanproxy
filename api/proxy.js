export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing 'url' parameter" });

  try {
    const decodedUrl = decodeURIComponent(url);
    const parsed = new URL(decodedUrl);

    // Allow only safe CDN domains
    const allowedHosts = [
      "akamaized.net",
      "amagi.com",
      "convrgelive.nathcreqtives.com",
      "proxy.nathcreqtives.com",
      "linear.channel.amagi.tv"
    ];

    const valid = allowedHosts.some(domain => parsed.hostname.includes(domain));
    if (!valid) {
      return res.status(403).json({ error: "Access denied to this host." });
    }

    const headers = {
      "User-Agent": req.headers["user-agent"] || "TambayanProxy/1.0",
    };

    const response = await fetch(decodedUrl, { headers });

    if (!response.ok) {
      return res.status(response.status).send("Upstream error");
    }

    // Fallback detection
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    if (contentType.includes("application/vnd.apple.mpegurl")) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    } else if (contentType.includes("video/mp4")) {
      res.setHeader("Content-Type", "video/mp4");
    } else {
      res.setHeader("Content-Type", contentType);
    }

    res.setHeader("Access-Control-Allow-Origin", "*");

    response.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: "Proxy failed", details: err.message });
  }
}
