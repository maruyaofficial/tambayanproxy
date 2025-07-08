export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    const decodedUrl = decodeURIComponent(url);

    const allowedHosts = [
      "akamaized.net",
      "amagi.com",
      "convrgelive.nathcreqtives.com",
      "proxy.nathcreqtives.com"
    ];
    const parsed = new URL(decodedUrl);
    if (!allowedHosts.some(h => parsed.hostname.includes(h))) {
      return res.status(403).json({ error: "Host not allowed" });
    }

    const headers = {
      "User-Agent": req.headers["user-agent"] || "TambayanProxy/1.0",
      // Optional: Inject auth headers for DRM-protected endpoints
      "x-auth-token": process.env.AUTH_TOKEN || ""
    };

    const response = await fetch(decodedUrl, { headers });

    if (!response.ok) {
      return res.status(response.status).send("Upstream error");
    }

    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const stream = response.body;
    stream.pipe(res);
  } catch (e) {
    res.status(500).json({ error: "Proxy failed", details: e.message });
  }
}
