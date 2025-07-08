export default async function handler(req, res) {
  const targetUrl = req.query.url;

  if (!targetUrl || !/^https?:\/\//.test(targetUrl)) {
    return res.status(400).json({ error: 'Missing or invalid ?url=' });
  }

  const parsedHost = new URL(targetUrl).hostname;

  const allowed = ['akamaized.net', 'amagi.tv', 'skygo.mn'].some(domain =>
    parsedHost.endsWith(domain)
  );

  if (!allowed) {
    return res.status(403).json({ error: 'Domain not allowed' });
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: req.method || 'GET',
      headers: {
        'User-Agent': req.headers['user-agent'] || '',
        'Range': req.headers['range'] || '',
        'Accept': '*/*'
      }
    });

    // Forward status
    res.status(upstreamResponse.status);

    // Forward headers
    upstreamResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'HEAD') {
      return res.end();
    }

    const reader = upstreamResponse.body?.getReader();
    if (!reader) return res.end();

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) return controller.close();
        controller.enqueue(value);
      }
    });

    const nodeStream = streamToNodeReadable(stream);
    nodeStream.pipe(res);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy failed', details: err.message });
  }
}

import { Readable } from 'stream';

function streamToNodeReadable(stream) {
  const reader = stream.getReader();
  return new Readable({
    async read() {
      const { done, value } = await reader.read();
      this.push(done ? null : value);
    }
  });
}
