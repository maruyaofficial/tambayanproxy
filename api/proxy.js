export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || req.method !== 'POST') {
    return res.status(400).json({ error: 'Missing or invalid URL or method' });
  }

  try {
    const response = await fetch(decodeURIComponent(url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: req,
    });

    const data = await response.arrayBuffer();

    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Proxy error' });
  }
}
