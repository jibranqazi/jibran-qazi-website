const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store subscribers in memory (replace with a DB later)
const subscribers = [];

// POST /subscribe — accept email or phone
app.post('/subscribe', (req, res) => {
  const { contact } = req.body;

  if (!contact || typeof contact !== 'string') {
    return res.status(400).json({ error: 'Contact is required.' });
  }

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim());
  const isPhone = /^[\+]?[\d\s\-\(\)]{7,15}$/.test(contact.trim());

  if (!isEmail && !isPhone) {
    return res.status(400).json({ error: 'Please provide a valid email or phone number.' });
  }

  if (subscribers.includes(contact.trim())) {
    return res.status(409).json({ error: 'Already subscribed.' });
  }

  subscribers.push(contact.trim());
  console.log(`New subscriber: ${contact.trim()} (total: ${subscribers.length})`);

  res.status(201).json({ message: 'Subscribed successfully.' });
});

// Catch-all → serve index.html
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Jibran Qazi server running at http://localhost:${PORT}`);
});
