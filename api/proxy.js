import { Readable } from 'stream';

const ALLOWED_HOSTS = [
  'akamaized.net',
  'amagi.tv',
  'skygo.mn',
  'nocable.cc'
];

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(200).end();
  }

  const targetUrl = req.query.url;
  if (!targetUrl || !/^https?:\/\//.test(targetUrl)) {
    return res.status(400).json({ error: 'Missing or invalid ?url=' });
  }

  const parsedHost = new URL(targetUrl).hostname;
  const allowed = ALLOWED_HOSTS.some(allowedHost =>
    parsedHost === allowedHost || parsedHost.endsWith(`.${allowedHost}`)
  );

  if (!allowed) {
    return res.status(403).json({ error: 'Domain not allowed' });
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: req.method || 'GET',
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Referer': req.headers['referer'] || '',
        'Range': req.headers['range'] || '',
        'Origin': req.headers['origin'] || '',
        'Accept': '*/*',
      },
    });

    res.status(upstreamResponse.status);

    upstreamResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    const reader = upstreamResponse.body.getReader();
    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      }
    });

    const nodeStream = streamToNodeReadable(stream);
    nodeStream.pipe(res);

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy failed', details: err.message });
  }
}

// Converts Web ReadableStream to Node.js Readable
function streamToNodeReadable(stream) {
  const reader = stream.getReader();
  return new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) this.push(null);
      else this.push(value);
    }
  });
}
