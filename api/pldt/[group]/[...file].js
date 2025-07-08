export default async function handler(req, res) {
  const { group, file } = req.query;

  if (!group || !file || !Array.isArray(file)) {
    return res.status(400).json({ error: "Missing or invalid parameters" });
  }

  const filename = file.join("/");
  const url = `https://qp-pldt-live-${group}-prod.akamaized.net/out/u/${filename}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "TambayanProxy/1.0"
      }
    });

    if (!response.ok) {
      return res.status(response.status).send("Upstream error");
    }

    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");

    response.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: "Proxy error", details: err.message });
  }
}