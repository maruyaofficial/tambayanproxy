// File: /api/license/clearkey.js
export default function handler(req, res) {
  const keys = {
    keys: [
      {
        kty: "oct",
        alg: "A128KW",
        kid: "92032b0e41a543fb9830751273b8debd",
        k: "03f8b65e2af785b10d6634735dbe6c11"
      }
    ],
    type: "temporary"
  };

  res.setHeader("Content-Type", "application/json");
  res.status(200).json(keys);
}
