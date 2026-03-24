const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand, DeleteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'jq2026admin';
const REGION = 'us-east-1';
const TABLE = 'jibranqazi-subscribers';
const POSTS_TABLE = 'jibranqazi-posts';

const client = new DynamoDBClient({ region: REGION });
const db = DynamoDBDocumentClient.from(client);

// ── Multer (media uploads) ────────────────────────────────────────
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|webm/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  }
});

// ── Ensure posts table exists ─────────────────────────────────────
async function ensurePostsTable() {
  try {
    await client.send(new DescribeTableCommand({ TableName: POSTS_TABLE }));
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      await client.send(new CreateTableCommand({
        TableName: POSTS_TABLE,
        KeySchema: [{ AttributeName: 'slug', KeyType: 'HASH' }],
        AttributeDefinitions: [{ AttributeName: 'slug', AttributeType: 'S' }],
        BillingMode: 'PAY_PER_REQUEST'
      }));
      console.log('Created jibranqazi-posts table');
    }
  }
}
ensurePostsTable().catch(console.error);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Jibran Qazi Admin"');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  if (user !== 'admin' || pass !== ADMIN_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="Jibran Qazi Admin"');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── POST /subscribe ───────────────────────────────────────────────
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
      Item: { contact: val, type: isEmail ? 'email' : 'phone', subscribedAt: new Date().toISOString() },
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

// ── GET /admin ────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Jibran Qazi Admin"');
    return res.status(401).send('Unauthorized');
  }
  const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  if (user !== 'admin' || pass !== ADMIN_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="Jibran Qazi Admin"');
    return res.status(401).send('Unauthorized');
  }
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// ── GET /admin/write ──────────────────────────────────────────────
app.get('/admin/write', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'write.html'));
});

app.get('/admin/write/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'write.html'));
});

// ── GET /admin/subscribers ────────────────────────────────────────
app.get('/admin/subscribers', requireAdmin, async (req, res) => {
  try {
    const result = await db.send(new ScanCommand({ TableName: TABLE }));
    const sorted = (result.Items || []).sort((a, b) => new Date(b.subscribedAt) - new Date(a.subscribedAt));
    res.json({ count: sorted.length, subscribers: sorted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch subscribers.' });
  }
});

// ── GET /admin/api/posts ──────────────────────────────────────────
app.get('/admin/api/posts', requireAdmin, async (req, res) => {
  try {
    const result = await db.send(new ScanCommand({ TableName: POSTS_TABLE }));
    const sorted = (result.Items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(sorted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch posts.' });
  }
});

// ── POST /admin/api/posts ─────────────────────────────────────────
app.post('/admin/api/posts', requireAdmin, async (req, res) => {
  const { title, category, content, status, mediaUrls } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required.' });

  const slug = title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);

  const post = {
    slug,
    title,
    category: category || 'Journal',
    content,
    status: status || 'published',
    mediaUrls: mediaUrls || [],
    date: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString()
  };

  try {
    await db.send(new PutCommand({ TableName: POSTS_TABLE, Item: post }));
    res.status(201).json(post);
  } catch (err) {
    console.error('DynamoDB PutCommand error:', err.name, err.message);
    res.status(500).json({ error: 'Failed to save post.' });
  }
});

// ── PUT /admin/api/posts/:slug ────────────────────────────────────
app.put('/admin/api/posts/:slug', requireAdmin, async (req, res) => {
  const { title, category, content, status, mediaUrls } = req.body;
  try {
    const result = await db.send(new UpdateCommand({
      TableName: POSTS_TABLE,
      Key: { slug: req.params.slug },
      UpdateExpression: 'SET title = :t, category = :c, content = :co, #s = :st, mediaUrls = :m, updatedAt = :u',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':t': title, ':c': category, ':co': content,
        ':st': status, ':m': mediaUrls || [], ':u': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));
    res.json(result.Attributes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update post.' });
  }
});

// ── DELETE /admin/api/posts/:slug ─────────────────────────────────
app.delete('/admin/api/posts/:slug', requireAdmin, async (req, res) => {
  try {
    await db.send(new DeleteCommand({ TableName: POSTS_TABLE, Key: { slug: req.params.slug } }));
    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete post.' });
  }
});

// ── POST /admin/upload ────────────────────────────────────────────
app.post('/admin/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname });
});

// ── Public API: GET /api/posts ────────────────────────────────────
app.get('/api/posts', async (req, res) => {
  try {
    const result = await db.send(new ScanCommand({
      TableName: POSTS_TABLE,
      FilterExpression: '#s = :pub',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':pub': 'published' }
    }));
    const sorted = (result.Items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(sorted);
  } catch {
    res.json([]);
  }
});

// ── Public API: GET /api/posts/:slug ──────────────────────────────
app.get('/api/posts/:slug', async (req, res) => {
  try {
    const result = await db.send(new GetCommand({
      TableName: POSTS_TABLE,
      Key: { slug: req.params.slug }
    }));
    if (!result.Item) return res.status(404).json({ error: 'Post not found' });
    res.json(result.Item);
  } catch {
    res.status(500).json({ error: 'Error loading post' });
  }
});

// ── GET /journal ──────────────────────────────────────────────────
app.get('/journal', (req, res) => res.sendFile(path.join(__dirname, 'public', 'journal.html')));
app.get('/journal/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'post.html')));

// ── Catch-all ─────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Jibran Qazi server running at http://localhost:${PORT}`);
});
