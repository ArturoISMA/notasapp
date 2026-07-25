const path = require('path');
const express = require('express');
const chatHandler = require('./api/chat');

const app = express();
const port = process.env.PORT || 5501;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running.' });
});

app.get('/api/chat', (req, res) => {
  res.json({ status: 'ok', message: 'Chat API endpoint is reachable. Use POST to send questions.' });
});

app.post('/api/chat', chatHandler);

app.listen(port, () => {
  console.log(`NotasApp running on http://localhost:${port}`);
});
