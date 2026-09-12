// server.js
// Backend for CrossRoads (formerly Study Peer Finder).
// Handles: authentication (signup/login/sessions), storing/editing user
// profiles, and filter-driven peer matching.

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- DATABASE SETUP ----------
const db = new Database(path.join(__dirname, 'peerfinder.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    gender TEXT,
    course TEXT,
    semester INTEGER,
    subjects TEXT,      -- JSON array, only relevant if semester > 2
    city TEXT,
    hostel_block TEXT,
    interests TEXT,     -- JSON array
    clubs TEXT,          -- JSON array
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// ---------- HELPERS ----------

function parseJsonArray(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    gender: row.gender || '',
    course: row.course,
    semester: row.semester,
    subjects: parseJsonArray(row.subjects),
    city: row.city,
    hostel_block: row.hostel_block,
    interests: parseJsonArray(row.interests),
    clubs: parseJsonArray(row.clubs),
    profileComplete: !!(row.course && row.interests && parseJsonArray(row.interests).length > 0)
  };
}

// Jaccard similarity: overlap size / union size
function jaccard(listA, listB) {
  const setA = new Set(listA.map(s => s.toLowerCase().trim()).filter(Boolean));
  const setB = new Set(listB.map(s => s.toLowerCase().trim()).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = [...setA].filter(x => setB.has(x));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

function commonItems(listA, listB) {
  const lowerB = listB.map(s => s.toLowerCase().trim());
  return listA.filter(item => lowerB.includes(item.toLowerCase().trim()));
}

// Combined weighted similarity score between two full user objects
function computeMatchScore(target, other) {
  const W_INTERESTS = 0.4;
  const W_SUBJECTS = 0.25;
  const W_CLUBS = 0.15;
  const W_LOCATION = 0.2;

  const interestSim = jaccard(target.interests, other.interests);
  const subjectSim = jaccard(target.subjects, other.subjects);
  const clubSim = jaccard(target.clubs, other.clubs);

  let locationSim = 0;
  if (target.city && target.city === other.city) locationSim += 0.5;
  if (target.hostel_block && target.hostel_block === other.hostel_block) locationSim += 0.5;

  const score =
    W_INTERESTS * interestSim +
    W_SUBJECTS * subjectSim +
    W_CLUBS * clubSim +
    W_LOCATION * locationSim;

  return {
    score: Math.round(score * 100),
    commonInterests: commonItems(target.interests, other.interests),
    commonSubjects: commonItems(target.subjects, other.subjects),
    commonClubs: commonItems(target.clubs, other.clubs),
    sameCity: !!target.city && target.city === other.city,
    sameHostel: !!target.hostel_block && target.hostel_block === other.hostel_block
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

// Reads the "Authorization: Bearer <token>" header, attaches req.userId.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });

  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

  req.userId = session.user_id;
  req.token = token;
  next();
}

// ---------- AUTH ROUTES ----------

// Sign up: creates the account. Profile details (course, interests, etc.)
// are filled in afterwards via PUT /api/me.
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists. Try signing in instead.' });

  const passwordHash = bcrypt.hashSync(password, 10);

  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, subjects, interests, clubs)
    VALUES (?, ?, ?, '[]', '[]', '[]')
  `).run(name.trim(), normalizedEmail, passwordHash);

  const token = createSession(result.lastInsertRowid);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.json({ token, user: serializeUser(row) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const normalizedEmail = email.trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  const token = createSession(row.id);
  res.json({ token, user: serializeUser(row) });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ message: 'Signed out.' });
});

// ---------- PROFILE ROUTES (always act on the signed-in user) ----------

app.get('/api/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!row) return res.status(404).json({ error: 'Account not found.' });
  res.json(serializeUser(row));
});

app.put('/api/me', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!existing) return res.status(404).json({ error: 'Account not found.' });

  const { name, gender, course, semester, subjects, city, hostel_block, interests, clubs } = req.body;

  const finalName = (name && name.trim()) ? name.trim() : existing.name;
  if (!interests || interests.length === 0) {
    return res.status(400).json({ error: 'At least one interest is required.' });
  }

  const semNum = parseInt(semester, 10) || null;
  // Subjects only make sense past semester 2 — ignore them otherwise, even if sent.
  const finalSubjects = semNum && semNum > 2 ? (subjects || []) : [];

  db.prepare(`
    UPDATE users SET name=?, gender=?, course=?, semester=?, subjects=?, city=?, hostel_block=?, interests=?, clubs=?
    WHERE id=?
  `).run(
    finalName,
    gender || '',
    course || '',
    semNum,
    JSON.stringify(finalSubjects),
    city || '',
    hostel_block || '',
    JSON.stringify(interests || []),
    JSON.stringify(clubs || []),
    req.userId
  );

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json(serializeUser(row));
});

// Get filtered + ranked matches for the signed-in user
// Query params (all optional, 'true'/'false' strings): sameCity, otherCity, hostel, interests, seniors
app.get('/api/me/matches', requireAuth, (req, res) => {
  const targetRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!targetRow) return res.status(404).json({ error: 'Account not found.' });

  const target = serializeUser(targetRow);

  const wantSameCity = req.query.sameCity === 'true';
  const wantOtherCity = req.query.otherCity === 'true';
  const wantHostel = req.query.hostel === 'true';
  const wantInterests = req.query.interests === 'true';
  const wantSeniors = req.query.seniors === 'true';

  let otherRows = db.prepare('SELECT * FROM users WHERE id != ?').all(req.userId);
  let others = otherRows.map(serializeUser).filter(u => u.profileComplete);

  // City filter: if both flags are on, they cancel out (contradictory), so skip city filtering.
  if (wantSameCity && !wantOtherCity) {
    others = others.filter(u => u.city && u.city === target.city);
  } else if (wantOtherCity && !wantSameCity) {
    others = others.filter(u => u.city && u.city !== target.city);
  }

  if (wantHostel) {
    others = others.filter(u => u.hostel_block && u.hostel_block === target.hostel_block);
  }

  if (wantInterests) {
    others = others.filter(u => jaccard(target.interests, u.interests) > 0);
  }

  if (wantSeniors) {
    // "Senior" = same course, further along in semester count
    others = others.filter(u => u.course && u.course === target.course && (u.semester || 0) > (target.semester || 0));
  }

  const matches = others.map(other => {
    const result = computeMatchScore(target, other);
    return {
      id: other.id,
      name: other.name,
      gender: other.gender,
      course: other.course,
      semester: other.semester,
      subjects: other.subjects,
      city: other.city,
      hostel_block: other.hostel_block,
      interests: other.interests,
      clubs: other.clubs,
      isSenior: !!(other.course === target.course && (other.semester || 0) > (target.semester || 0)),
      matchScore: result.score,
      commonInterests: result.commonInterests,
      commonSubjects: result.commonSubjects,
      commonClubs: result.commonClubs,
      sameCity: result.sameCity,
      sameHostel: result.sameHostel
    };
  });

  matches.sort((a, b) => b.matchScore - a.matchScore);

  res.json({ user: target, matches: matches.slice(0, 15) });
});

// Wipe all data (testing/reset)
app.delete('/api/reset', (req, res) => {
  db.prepare('DELETE FROM sessions').run();
  db.prepare('DELETE FROM users').run();
  res.json({ message: 'All data cleared.' });
});

app.listen(PORT, () => {
  console.log(`CrossRoads running at http://localhost:${PORT}`);
});
