const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand, DeleteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient, SignUpCommand: CognitoSignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand, GlobalSignOutCommand, GetUserCommand, ResendConfirmationCodeCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'jq2026admin';
const REGION = 'us-east-1';
const TABLE = 'jibranqazi-subscribers';
const POSTS_TABLE = 'jibranqazi-posts';
const COMMUNITY_POSTS_TABLE = 'jibranqazi-community-posts';
const COMMUNITY_COMMENTS_TABLE = 'jibranqazi-community-comments';
const USERS_TABLE = 'jibranqazi-users';

const client = new DynamoDBClient({ region: REGION });
const db = DynamoDBDocumentClient.from(client);

const COGNITO_USER_POOL_ID = 'us-east-1_U8ewOmecJ';
const COGNITO_CLIENT_ID = '1vauub27u2tvlp33bs826e6q0v';

const cognito = new CognitoIdentityProviderClient({ region: REGION });
const ses = new SESv2Client({ region: REGION });

function buildWelcomeEmailHtml(withPromo) {
  const promoBlock = withPromo ? `
              <!-- Promo code block -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1a1008;padding:40px 32px;text-align:center;">
                    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#c8a97e;">Your exclusive offer</p>
                    <p style="margin:0 0 20px;font-size:36px;font-weight:400;letter-spacing:0.18em;color:#faf6f1;">$15 OFF</p>
                    <p style="margin:0 0 24px;font-size:13px;color:#a89070;line-height:1.6;">Any order &nbsp;·&nbsp; No minimum &nbsp;·&nbsp; No expiry</p>
                    <div style="display:inline-block;border:1px solid #c8a97e;padding:14px 32px;">
                      <span style="font-size:18px;letter-spacing:0.3em;text-transform:uppercase;color:#c8a97e;">WELCOME15</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:40px 0 0;font-size:14px;line-height:1.8;color:#6b5740;font-style:italic;">
                Apply this code at checkout when you are ready.
              </p>` : '';

  const promoPara = withPromo
    ? `<p style="margin:0 0 40px;font-size:15px;line-height:1.8;color:#1a1008;">As a founding subscriber, we would like to offer you something in return.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome — Jibran Qazi</title>
</head>
<body style="margin:0;padding:0;background:#faf6f1;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f1;padding:60px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:48px;text-align:center;border-bottom:1px solid #d9c9b4;">
              <p style="margin:0;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#8c7355;">New York City</p>
              <h1 style="margin:12px 0 0;font-size:32px;font-weight:400;letter-spacing:0.12em;text-transform:uppercase;color:#1a1008;">Jibran Qazi</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:48px 0 40px;">
              <p style="margin:0 0 28px;font-size:15px;line-height:1.8;color:#1a1008;">
                Thank you for joining us before we open. You are among the first.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.8;color:#1a1008;">
                Something rare is being made — and when we launch on <strong style="font-weight:600;">August 1, 2026</strong>, you will be the first to know.
              </p>
              ${promoPara}
              ${promoBlock}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #d9c9b4;padding-top:36px;text-align:center;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8c7355;">Jibran Qazi</p>
              <p style="margin:0;font-size:12px;color:#a89070;">A New York City Design Studio</p>
              <p style="margin:16px 0 0;font-size:11px;color:#c4b49a;">
                <a href="https://jibranqazi.com" style="color:#c4b49a;text-decoration:none;">jibranqazi.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendWelcomeEmail(toEmail, withPromo) {
  const html = buildWelcomeEmailHtml(withPromo);
  const promoText = withPromo
    ? `\n\nAs a founding subscriber, here is $15 off any order — no minimum, no expiry.\n\nYour code: WELCOME15\n\nApply it at checkout when you are ready.`
    : '';

  await ses.send(new SendEmailCommand({
    FromEmailAddress: 'Jibran Qazi <Jibran@jibranqazi.com>',
    Destination: { ToAddresses: [toEmail] },
    Content: {
      Simple: {
        Subject: { Data: 'You\'re on the list — Jibran Qazi' },
        Body: {
          Html: { Data: html },
          Text: { Data: `Thank you for joining us.\n\nSomething rare is being made. When we launch on August 1, 2026, you will be the first to know.${promoText}\n\n— Jibran Qazi\njibranqazi.com` }
        }
      }
    }
  }));
}

const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: COGNITO_USER_POOL_ID,
  tokenUse: 'access',
  clientId: COGNITO_CLIENT_ID
});

async function requireMember(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const payload = await jwtVerifier.verify(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

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

async function ensureCommunityTables() {
  const configs = [
    { TableName: COMMUNITY_POSTS_TABLE, key: 'id' },
    { TableName: COMMUNITY_COMMENTS_TABLE, key: 'id' },
    { TableName: USERS_TABLE, key: 'sub' }
  ];
  for (const { TableName, key } of configs) {
    try {
      await client.send(new DescribeTableCommand({ TableName }));
    } catch (err) {
      if (err.name === 'ResourceNotFoundException') {
        await client.send(new CreateTableCommand({
          TableName,
          KeySchema: [{ AttributeName: key, KeyType: 'HASH' }],
          AttributeDefinitions: [{ AttributeName: key, AttributeType: 'S' }],
          BillingMode: 'PAY_PER_REQUEST'
        }));
        console.log(`Created ${TableName}`);
      }
    }
  }
}
ensureCommunityTables().catch(console.error);

async function getCallerName(accessToken) {
  try {
    const u = await cognito.send(new GetUserCommand({ AccessToken: accessToken }));
    const attrs = {};
    u.UserAttributes.forEach(a => { attrs[a.Name] = a.Value; });
    return attrs.name || attrs.email || 'Member';
  } catch { return 'Member'; }
}

function stripVoters({ voters, ...rest }) { return rest; }

async function enrichWithKarma(items) {
  const subs = [...new Set(items.map(i => i.authorSub).filter(Boolean))];
  const karmaMap = {};
  await Promise.all(subs.map(async sub => {
    try {
      const r = await db.send(new GetCommand({ TableName: USERS_TABLE, Key: { sub } }));
      karmaMap[sub] = r.Item?.karma || 0;
    } catch {}
  }));
  return items.map(i => ({ ...i, authorKarma: karmaMap[i.authorSub] || 0 }));
}

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
    if (isEmail) {
      db.send(new ScanCommand({ TableName: TABLE, Select: 'COUNT' }))
        .then(r => sendWelcomeEmail(val, r.Count <= 50))
        .catch(err => console.error('Welcome email failed:', err.message));
    }
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

// ── Auth routes ───────────────────────────────────────────────────
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/signin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signin.html')));
app.get('/members', (req, res) => res.sendFile(path.join(__dirname, 'public', 'members.html')));

app.post('/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required.' });
  try {
    await cognito.send(new CognitoSignUpCommand({
      ClientId: COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: 'name', Value: name }]
    }));
    res.json({ message: 'Check your email for your verification code.' });
  } catch (err) {
    const msg = err.name === 'UsernameExistsException'
      ? 'An account with this email already exists.'
      : err.message;
    res.status(400).json({ error: msg });
  }
});

app.post('/auth/verify', async (req, res) => {
  const { email, code } = req.body;
  try {
    await cognito.send(new ConfirmSignUpCommand({
      ClientId: COGNITO_CLIENT_ID,
      Username: email,
      ConfirmationCode: code
    }));
    res.json({ message: 'Email verified. Welcome.' });
  } catch (err) {
    const msg = err.name === 'CodeMismatchException'
      ? 'Incorrect code. Please try again.'
      : err.name === 'ExpiredCodeException'
      ? 'Code expired. Please request a new one.'
      : err.message;
    res.status(400).json({ error: msg });
  }
});

app.post('/auth/resend', async (req, res) => {
  const { email } = req.body;
  try {
    await cognito.send(new ResendConfirmationCodeCommand({ ClientId: COGNITO_CLIENT_ID, Username: email }));
    res.json({ message: 'New code sent.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  try {
    const result = await cognito.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password }
    }));
    res.json({
      accessToken: result.AuthenticationResult.AccessToken,
      refreshToken: result.AuthenticationResult.RefreshToken,
      idToken: result.AuthenticationResult.IdToken,
      expiresIn: result.AuthenticationResult.ExpiresIn
    });
  } catch (err) {
    const msg = err.name === 'NotAuthorizedException'
      ? 'Incorrect email or password.'
      : err.name === 'UserNotConfirmedException'
      ? 'Please verify your email first.'
      : err.message;
    res.status(401).json({ error: msg });
  }
});

app.post('/auth/signout', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    if (token) await cognito.send(new GlobalSignOutCommand({ AccessToken: token }));
  } catch {}
  res.json({ message: 'Signed out.' });
});

app.get('/auth/me', requireMember, async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const result = await cognito.send(new GetUserCommand({ AccessToken: token }));
    const attrs = {};
    result.UserAttributes.forEach(a => { attrs[a.Name] = a.Value; });
    res.json({ email: attrs.email, name: attrs.name, sub: attrs.sub, memberSince: attrs['custom:memberSince'] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /journal ──────────────────────────────────────────────────
app.get('/journal', (req, res) => res.sendFile(path.join(__dirname, 'public', 'journal.html')));
app.get('/journal/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'post.html')));

// ── Community pages ───────────────────────────────────────────────
app.get('/community', (req, res) => res.sendFile(path.join(__dirname, 'public', 'community.html')));
app.get('/community/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'community-thread.html')));

// GET /api/community/posts
app.get('/api/community/posts', async (req, res) => {
  try {
    const result = await db.send(new ScanCommand({ TableName: COMMUNITY_POSTS_TABLE }));
    const posts = (result.Items || [])
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(stripVoters);
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load posts.' });
  }
});

// POST /api/community/posts
app.post('/api/community/posts', requireMember, async (req, res) => {
  const { title, body } = req.body;
  if (!title?.trim() || !body?.trim()) return res.status(400).json({ error: 'Title and body required.' });
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const authorName = await getCallerName(token);
  const post = {
    id: crypto.randomUUID(),
    title: title.trim().slice(0, 300),
    body: body.trim().slice(0, 10000),
    authorName,
    authorSub: req.user.sub,
    upvotes: 0,
    commentCount: 0,
    createdAt: new Date().toISOString()
  };
  try {
    await db.send(new PutCommand({ TableName: COMMUNITY_POSTS_TABLE, Item: post }));
    await db.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { sub: req.user.sub },
      UpdateExpression: 'SET displayName = if_not_exists(displayName, :n), karma = if_not_exists(karma, :zero)',
      ExpressionAttributeValues: { ':n': authorName, ':zero': 0 }
    }));
    res.status(201).json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

// GET /api/community/posts/:id
app.get('/api/community/posts/:id', async (req, res) => {
  try {
    const result = await db.send(new GetCommand({ TableName: COMMUNITY_POSTS_TABLE, Key: { id: req.params.id } }));
    if (!result.Item) return res.status(404).json({ error: 'Post not found.' });
    const [enriched] = await enrichWithKarma([stripVoters(result.Item)]);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load post.' });
  }
});

// GET /api/community/posts/:id/comments
app.get('/api/community/posts/:id/comments', async (req, res) => {
  try {
    const result = await db.send(new ScanCommand({
      TableName: COMMUNITY_COMMENTS_TABLE,
      FilterExpression: 'postId = :pid',
      ExpressionAttributeValues: { ':pid': req.params.id }
    }));
    const sorted = (result.Items || [])
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(stripVoters);
    const enriched = await enrichWithKarma(sorted);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load comments.' });
  }
});

// POST /api/community/posts/:id/comments
app.post('/api/community/posts/:id/comments', requireMember, async (req, res) => {
  const { body, parentId } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Comment body required.' });
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const authorName = await getCallerName(token);
  const comment = {
    id: crypto.randomUUID(),
    postId: req.params.id,
    parentId: parentId || null,
    authorName,
    authorSub: req.user.sub,
    body: body.trim().slice(0, 5000),
    upvotes: 0,
    createdAt: new Date().toISOString()
  };
  try {
    await db.send(new PutCommand({ TableName: COMMUNITY_COMMENTS_TABLE, Item: comment }));
    await db.send(new UpdateCommand({
      TableName: COMMUNITY_POSTS_TABLE,
      Key: { id: req.params.id },
      UpdateExpression: 'ADD commentCount :one',
      ExpressionAttributeValues: { ':one': 1 }
    }));
    await db.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { sub: req.user.sub },
      UpdateExpression: 'SET displayName = if_not_exists(displayName, :n), karma = if_not_exists(karma, :zero)',
      ExpressionAttributeValues: { ':n': authorName, ':zero': 0 }
    }));
    res.status(201).json(comment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to post comment.' });
  }
});

// POST /api/community/posts/:id/upvote
app.post('/api/community/posts/:id/upvote', requireMember, async (req, res) => {
  const sub = req.user.sub;
  try {
    const result = await db.send(new UpdateCommand({
      TableName: COMMUNITY_POSTS_TABLE,
      Key: { id: req.params.id },
      UpdateExpression: 'ADD upvotes :one, voters :voterSet',
      ConditionExpression: 'attribute_exists(id) AND NOT contains(voters, :sub)',
      ExpressionAttributeValues: { ':one': 1, ':voterSet': new Set([sub]), ':sub': sub },
      ReturnValues: 'ALL_NEW'
    }));
    const post = result.Attributes;
    if (post.authorSub && post.authorSub !== sub) {
      await db.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { sub: post.authorSub },
        UpdateExpression: 'ADD karma :one SET displayName = if_not_exists(displayName, :n)',
        ExpressionAttributeValues: { ':one': 1, ':n': post.authorName }
      }));
    }
    res.json({ upvotes: post.upvotes });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return res.status(409).json({ error: 'Already upvoted.' });
    console.error(err);
    res.status(500).json({ error: 'Failed to upvote.' });
  }
});

// POST /api/community/comments/:id/upvote
app.post('/api/community/comments/:id/upvote', requireMember, async (req, res) => {
  const sub = req.user.sub;
  try {
    const result = await db.send(new UpdateCommand({
      TableName: COMMUNITY_COMMENTS_TABLE,
      Key: { id: req.params.id },
      UpdateExpression: 'ADD upvotes :one, voters :voterSet',
      ConditionExpression: 'attribute_exists(id) AND NOT contains(voters, :sub)',
      ExpressionAttributeValues: { ':one': 1, ':voterSet': new Set([sub]), ':sub': sub },
      ReturnValues: 'ALL_NEW'
    }));
    const comment = result.Attributes;
    if (comment.authorSub && comment.authorSub !== sub) {
      await db.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { sub: comment.authorSub },
        UpdateExpression: 'ADD karma :one SET displayName = if_not_exists(displayName, :n)',
        ExpressionAttributeValues: { ':one': 1, ':n': comment.authorName }
      }));
    }
    res.json({ upvotes: comment.upvotes });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return res.status(409).json({ error: 'Already upvoted.' });
    console.error(err);
    res.status(500).json({ error: 'Failed to upvote.' });
  }
});


// ── Catch-all ─────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Jibran Qazi server running at http://localhost:${PORT}`);
});
