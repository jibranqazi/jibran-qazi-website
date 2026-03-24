const express = require('express');
const path = require('path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'jq2026admin';
const REGION = 'us-east-1';
const TABLE = 'jibranqazi-subscribers';

const client = new DynamoDBClient({ region: REGION });
const db = DynamoDBDocumentClient.from(client);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── POST /subscribe ──────────────────────────────────────────────
app.post('/subscribe', async (req, res) => {
  const { contact } = req.body;

  if (!contact || typeof contact !== 'string') {
    return res.status(400).json({ error: 'Contact is required.' });
  }

  const val = contact.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  const isPhone = /^[\+]?[\d\s\-\(\)]{7,15}$/.test(val);

  if (!isEmail && !isPhone) {
    return res.status(400).json({ error: 'Please enter a valid email or phone number.' });
  }

  try {
    await db.send(new PutCommand({
      TableName: TABLE,
      Item: {
        contact: val,
        type: isEmail ? 'email' : 'phone',
        subscribedAt: new Date().toISOString()
      },
      ConditionExpression: 'attribute_not_exists(contact)'
    }));

    res.status(201).json({ message: 'Subscribed successfully.' });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return res.status(409).json({ error: 'Already subscribed.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── GET /admin ───────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Jibran Qazi Admin"');
    return res.status(401).send('Unauthorized');
  }

  const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const [user, pass] = credentials.split(':');

  if (user !== 'admin' || pass !== ADMIN_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="Jibran Qazi Admin"');
    return res.status(401).send('Unauthorized');
  }

  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// ── GET /admin/subscribers (API) ─────────────────────────────────
app.get('/admin/subscribers', async (req, res) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const [user, pass] = credentials.split(':');

  if (user !== 'admin' || pass !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await db.send(new ScanCommand({ TableName: TABLE }));
    const sorted = (result.Items || []).sort((a, b) =>
      new Date(b.subscribedAt) - new Date(a.subscribedAt)
    );
    res.json({ count: sorted.length, subscribers: sorted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch subscribers.' });
  }
});

// ── Catch-all ────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Jibran Qazi server running at http://localhost:${PORT}`);
});
