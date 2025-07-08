export default function handler(req, res) {
  const { channel } = req.query;

  const keys = {
    animax: {
      kid: process.env.ANIMAX_KEY_ID,
      k: process.env.ANIMAX_KEY
    },
    cartoon: {
      kid: process.env.CN_KEY_ID,
      k: process.env.CN_KEY
    }
    // Add more channels here if needed
  };

  const entry = keys[channel];
  if (!entry) {
    return res.status(404).json({ error: 'Unknown channel' });
  }

  const response = {
    keys: [
      {
        kty: "oct",
        kid: entry.kid,
        k: entry.k
      }
    ]
  };

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(response);
}