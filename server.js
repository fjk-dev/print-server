const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname)));

app.get('/loadimg', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        return res.status(400).send('Missing url parameter');
    }
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.buffer();
        res.set('Content-Type', response.headers.get('content-type'));
        res.send(buffer);
    } catch (err) {
        console.error('Proxy error:', err.message);
        res.status(500).send('Failed to fetch image');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
