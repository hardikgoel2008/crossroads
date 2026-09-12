// app.js - handles auth, profile create/edit, and filtered matching

const API_BASE = '';
const TOKEN_KEY = 'crossroadsToken';

// ---------- Course catalogue (VIT Vellore) -> total number of semesters ----------
// Grouped for the dropdown; semester counts follow each programme's usual duration.
// Note: VIT periodically revises the exact specialisations on offer — double-check
// against the current VIT Vellore prospectus/VITEEE counselling list if this ever
// needs to be authoritative for admissions purposes.
const COURSE_GROUPS = [
  {
    label: 'B.Tech — Computer Science',
    semesters: 8,
    courses: [
      'B.Tech Computer Science & Engineering (Core)',
      'B.Tech CSE — Artificial Intelligence & Machine Learning',
      'B.Tech CSE — Artificial Intelligence & Data Engineering',
      'B.Tech CSE — Data Science',
      'B.Tech CSE — Cyber Security',
      'B.Tech CSE — Bioinformatics',
      'B.Tech CSE — Business Systems (with TCS)',
      'B.Tech CSE — Blockchain Technology',
      'B.Tech Information Technology'
    ]
  },
  {
    label: 'B.Tech — Electronics & Electrical',
    semesters: 8,
    courses: [
      'B.Tech Electronics & Communication Engineering (ECE)',
      'B.Tech Electronics Engineering (VLSI Design & Technology)',
      'B.Tech Electronics & Computer Engineering',
      'B.Tech Electrical & Electronics Engineering (EEE)',
      'B.Tech Electronics & Instrumentation Engineering (EIE)'
    ]
  },
  {
    label: 'B.Tech — Mechanical & Civil',
    semesters: 8,
    courses: [
      'B.Tech Mechanical Engineering',
      'B.Tech Mechanical Engineering (Automotive)',
      'B.Tech Civil Engineering',
      'B.Tech Civil Engineering (with L&T)',
      'B.Tech Production & Industrial Engineering'
    ]
  },
  {
    label: 'B.Tech — Chemical & Bio',
    semesters: 8,
    courses: [
      'B.Tech Chemical Engineering',
      'B.Tech Biotechnology'
    ]
  },
  {
    label: 'Integrated Programmes (5-Year)',
    semesters: 10,
    courses: [
      'Integrated M.Tech Computer Science & Engineering',
      'Integrated M.Tech Software Engineering',
      'Integrated M.Sc Data Science',
      'Integrated M.Sc Biotechnology',
      'Integrated M.Sc Applied Psychology',
      'B.Arch'
    ]
  },
  {
    label: 'Management & Commerce',
    semesters: 6,
    courses: [
      'BBA'
    ]
  },
  {
    label: 'Postgraduate',
    semesters: 4,
    courses: [
      'MBA',
      'MCA',
      'M.Tech Computer Science & Engineering',
      'M.Tech VLSI Design'
    ]
  },
  {
    label: 'Sciences',
    semesters: 6,
    courses: [
      'B.Sc Data Science',
      'B.Sc Nutrition & Dietetics'
    ]
  }
];

// Flat lookup: course name -> total semesters
const COURSE_SEMESTERS = {};
COURSE_GROUPS.forEach(group => {
  group.courses.forEach(course => { COURSE_SEMESTERS[course] = group.semesters; });
});

// ---------- Hostel blocks ----------
const HOSTEL_BLOCKS = ['A', 'B', 'B – Annex', 'C', 'D', 'D – Annex', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T'];

// ---------- DOM refs ----------
const authSection = document.getElementById('authSection');
const dashboardSection = document.getElementById('dashboardSection');
const formSection = document.getElementById('formSection');
const resultsSection = document.getElementById('resultsSection');

const navUser = document.getElementById('navUser');
const navAvatar = document.getElementById('navAvatar');
const navUsername = document.getElementById('navUsername');
const logoutBtn = document.getElementById('logoutBtn');

const tabBtns = document.querySelectorAll('.tab-btn');
const signinForm = document.getElementById('signinForm');
const signupForm = document.getElementById('signupForm');
const signinError = document.getElementById('signinError');
const signupError = document.getElementById('signupError');

const dashboardName = document.getElementById('dashboardName');
const goProfileBtn = document.getElementById('goProfileBtn');
const goPeersBtn = document.getElementById('goPeersBtn');
const profileTileDesc = document.getElementById('profileTileDesc');
const peersTileDesc = document.getElementById('peersTileDesc');

const form = document.getElementById('profileForm');
const formTitle = document.getElementById('formTitle');
const formSubtitle = document.getElementById('formSubtitle');
const formSubmitBtn = document.getElementById('formSubmitBtn');
const profileError = document.getElementById('profileError');
const backFromForm = document.getElementById('backFromForm');
const backFromResults = document.getElementById('backFromResults');

const courseSelect = document.getElementById('course');
const semesterSelect = document.getElementById('semester');
const subjectsGroup = document.getElementById('subjectsGroup');
const hostelSelect = document.getElementById('hostelBlock');

const welcomeText = document.getElementById('welcomeText');
const editProfileBtn = document.getElementById('editProfileBtn');
const matchesList = document.getElementById('matchesList');

const filterSameCity = document.getElementById('filterSameCity');
const filterOtherCity = document.getElementById('filterOtherCity');
const filterHostel = document.getElementById('filterHostel');
const filterInterests = document.getElementById('filterInterests');
const filterSeniors = document.getElementById('filterSeniors');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');

// ---------- State ----------
let token = localStorage.getItem(TOKEN_KEY) || null;
let currentUser = null; // last fetched /api/me payload

// ---------- Populate static dropdowns ----------
COURSE_GROUPS.forEach(group => {
  const optgroup = document.createElement('optgroup');
  optgroup.label = group.label;
  group.courses.forEach(course => {
    const opt = document.createElement('option');
    opt.value = course;
    opt.textContent = course;
    optgroup.appendChild(opt);
  });
  courseSelect.appendChild(optgroup);
});

HOSTEL_BLOCKS.forEach(block => {
  const opt = document.createElement('option');
  opt.value = `${block} Block`;
  opt.textContent = `${block} Block`;
  hostelSelect.appendChild(opt);
});

// ---------- View management ----------
function showView(view) {
  authSection.classList.add('hidden');
  dashboardSection.classList.add('hidden');
  formSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  navUser.classList.toggle('hidden', view === 'auth');

  if (view === 'auth') authSection.classList.remove('hidden');
  if (view === 'dashboard') dashboardSection.classList.remove('hidden');
  if (view === 'form') formSection.classList.remove('hidden');
  if (view === 'results') resultsSection.classList.remove('hidden');
}

// ---------- Auth API helpers ----------
async function apiFetch(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, Object.assign({}, options, { headers }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function setToken(newToken) {
  token = newToken;
  if (newToken) localStorage.setItem(TOKEN_KEY, newToken);
  else localStorage.removeItem(TOKEN_KEY);
}

function initialsFor(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function updateNav(user) {
  navAvatar.textContent = initialsFor(user.name);
  navUsername.textContent = user.name;
}

// ---------- Tabs (Sign In / Sign Up) ----------
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    signinForm.classList.toggle('hidden', tab !== 'signin');
    signupForm.classList.toggle('hidden', tab !== 'signup');
    signinError.classList.add('hidden');
    signupError.classList.add('hidden');
  });
});

// ---------- Sign in ----------
signinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  signinError.classList.add('hidden');
  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('signinEmail').value.trim(),
        password: document.getElementById('signinPassword').value
      })
    });
    setToken(data.token);
    currentUser = data.user;
    enterApp();
  } catch (err) {
    signinError.textContent = err.message;
    signinError.classList.remove('hidden');
  }
});

// ---------- Sign up ----------
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  signupError.classList.add('hidden');
  try {
    const data = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('signupName').value.trim(),
        email: document.getElementById('signupEmail').value.trim(),
        password: document.getElementById('signupPassword').value
      })
    });
    setToken(data.token);
    currentUser = data.user;
    // Brand new account -> straight into completing the profile.
    openProfileForm();
  } catch (err) {
    signupError.textContent = err.message;
    signupError.classList.remove('hidden');
  }
});

// ---------- Logout ----------
logoutBtn.addEventListener('click', async () => {
  try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch (_) { /* ignore */ }
  setToken(null);
  currentUser = null;
  form.reset();
  showView('auth');
});

// ---------- Dashboard ----------
function refreshDashboardTiles() {
  dashboardName.textContent = currentUser.name.split(' ')[0];
  updateNav(currentUser);
  if (currentUser.profileComplete) {
    profileTileDesc.textContent = 'View or edit your details';
    peersTileDesc.textContent = 'See your top matches';
  } else {
    profileTileDesc.textContent = 'Finish setting up your profile';
    peersTileDesc.textContent = 'Complete your profile to unlock matches';
  }
}

function enterApp() {
  updateNav(currentUser);
  refreshDashboardTiles();
  showView('dashboard');
}

goProfileBtn.addEventListener('click', () => openProfileForm());
goPeersBtn.addEventListener('click', () => {
  if (!currentUser.profileComplete) {
    openProfileForm();
    return;
  }
  showResultsPage();
});

backFromForm.addEventListener('click', () => { refreshDashboardTiles(); showView('dashboard'); });
backFromResults.addEventListener('click', () => { refreshDashboardTiles(); showView('dashboard'); });

// ---------- Course change -> rebuild semester dropdown ----------
courseSelect.addEventListener('change', () => {
  const total = COURSE_SEMESTERS[courseSelect.value];
  semesterSelect.innerHTML = '';

  if (!total) {
    semesterSelect.disabled = true;
    semesterSelect.innerHTML = '<option value="">-- Select course first --</option>';
    updateSubjectsVisibility();
    return;
  }

  semesterSelect.disabled = false;
  semesterSelect.innerHTML = '<option value="">-- Select semester --</option>';
  for (let i = 1; i <= total; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Semester ${i}`;
    semesterSelect.appendChild(opt);
  }
  updateSubjectsVisibility();
});

// ---------- Semester change -> show/hide subjects field ----------
semesterSelect.addEventListener('change', updateSubjectsVisibility);

function updateSubjectsVisibility() {
  const sem = parseInt(semesterSelect.value, 10);
  if (sem && sem >= 2) {
    subjectsGroup.classList.remove('hidden');
  } else {
    subjectsGroup.classList.add('hidden');
    document.getElementById('subjects').value = '';
  }
}

// ---------- Helpers to parse comma-separated tag-style fields ----------
function parseList(raw) {
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ---------- Build payload from form ----------
function buildPayloadFromForm() {
  const genderInput = document.querySelector('input[name="gender"]:checked');
  return {
    gender: genderInput ? genderInput.value : '',
    course: courseSelect.value,
    semester: semesterSelect.value,
    subjects: parseList(document.getElementById('subjects').value),
    city: document.getElementById('city').value.trim(),
    hostel_block: hostelSelect.value,
    interests: parseList(document.getElementById('interests').value),
    clubs: parseList(document.getElementById('clubs').value)
  };
}

// ---------- Fill form from an existing user object (for editing) ----------
function fillFormFromUser(user) {
  const genderInput = document.querySelector(`input[name="gender"][value="${user.gender}"]`);
  if (genderInput) genderInput.checked = true;
  courseSelect.value = user.course || '';
  courseSelect.dispatchEvent(new Event('change'));
  semesterSelect.value = user.semester || '';
  updateSubjectsVisibility();
  document.getElementById('subjects').value = (user.subjects || []).join(', ');
  document.getElementById('city').value = user.city || '';
  hostelSelect.value = user.hostel_block || '';
  document.getElementById('interests').value = (user.interests || []).join(', ');
  document.getElementById('clubs').value = (user.clubs || []).join(', ');
}

// ---------- Open profile form (used for both first-time completion and edits) ----------
function openProfileForm() {
  form.reset();
  profileError.classList.add('hidden');
  if (currentUser.profileComplete) {
    fillFormFromUser(currentUser);
    formTitle.textContent = 'Edit Your Profile';
    formSubtitle.textContent = 'Update anything below — your matches refresh instantly.';
    formSubmitBtn.textContent = 'Update Profile';
  } else {
    formTitle.textContent = 'Complete Your Profile';
    formSubtitle.textContent = 'A few details so we can find your best-matching peers.';
    formSubmitBtn.textContent = 'Save Profile & Find Peers';
  }
  showView('form');
}

// ---------- Form submit (create OR update) ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  profileError.classList.add('hidden');
  const payload = buildPayloadFromForm();

  try {
    const updatedUser = await apiFetch('/api/me', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    currentUser = updatedUser;
    await showResultsPage();
  } catch (err) {
    profileError.textContent = err.message;
    profileError.classList.remove('hidden');
  }
});

// ---------- Edit profile (from results page) ----------
editProfileBtn.addEventListener('click', () => openProfileForm());

// ---------- Filters ----------
applyFiltersBtn.addEventListener('click', () => fetchAndRenderMatches());

clearFiltersBtn.addEventListener('click', () => {
  filterSameCity.checked = false;
  filterOtherCity.checked = false;
  filterHostel.checked = false;
  filterInterests.checked = false;
  filterSeniors.checked = false;
  fetchAndRenderMatches();
});

// Keep "Same City" / "Other City" mutually exclusive
filterSameCity.addEventListener('change', () => {
  if (filterSameCity.checked) filterOtherCity.checked = false;
});
filterOtherCity.addEventListener('change', () => {
  if (filterOtherCity.checked) filterSameCity.checked = false;
});

function buildFilterQuery() {
  const params = new URLSearchParams();
  params.set('sameCity', filterSameCity.checked);
  params.set('otherCity', filterOtherCity.checked);
  params.set('hostel', filterHostel.checked);
  params.set('interests', filterInterests.checked);
  params.set('seniors', filterSeniors.checked);
  return params.toString();
}

async function fetchAndRenderMatches() {
  try {
    const query = buildFilterQuery();
    const data = await apiFetch(`/api/me/matches?${query}`);
    welcomeText.textContent = `Welcome, ${data.user.name}! Here's who we found for you.`;
    renderMatches(data.matches);
  } catch (err) {
    matchesList.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function showResultsPage() {
  showView('results');
  await fetchAndRenderMatches();
}

// ---------- Render match cards ----------
function renderMatches(matches) {
  matchesList.innerHTML = '';

  if (!matches || matches.length === 0) {
    matchesList.innerHTML = `<div class="empty-state">No matches found with the current filters. Try loosening them, or invite more classmates to join!</div>`;
    return;
  }

  matches.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = 'match-card';
    div.style.animationDelay = `${i * 45}ms`;

    const seniorBadge = m.isSenior ? '<span class="senior-badge">SENIOR</span>' : '';

    div.innerHTML = `
      <span class="match-score">${m.matchScore}% match</span>
      <h3 class="match-name" data-peer-id="${m.id}" data-peer-name="${escapeHtml(m.name)}" data-peer-email="${escapeHtml(m.email || '')}" title="Click to chat">${escapeHtml(m.name)}${seniorBadge}</h3>
      <div class="match-meta match-email">${escapeHtml(m.email || '')}</div>
      <div class="match-meta">${escapeHtml(m.course || '')}${m.semester ? ' · Semester ' + m.semester : ''}</div>
      <div class="match-meta">${escapeHtml(m.city || '')}${m.hostel_block ? ' · ' + escapeHtml(m.hostel_block) : ''}
        ${m.sameCity ? ' (same city)' : ''}${m.sameHostel ? ' (same hostel!)' : ''}</div>
      ${renderTagGroup('Interests', m.interests, m.commonInterests)}
      ${renderTagGroup('Subjects', m.subjects, m.commonSubjects)}
      ${renderTagGroup('Clubs', m.clubs, m.commonClubs)}
    `;
    matchesList.appendChild(div);
  });
}

// Clicking a match's name opens the chat with that peer (event delegation,
// since match cards are re-rendered on every filter/apply).
matchesList.addEventListener('click', (e) => {
  const nameEl = e.target.closest('.match-name');
  if (!nameEl) return;
  openChat(
    parseInt(nameEl.dataset.peerId, 10),
    nameEl.dataset.peerName,
    nameEl.dataset.peerEmail
  );
});

function renderTagGroup(label, allItems, commonItems) {
  if (!allItems || allItems.length === 0) return '';
  const commonLower = (commonItems || []).map(i => i.toLowerCase());
  const tags = allItems.map(item => {
    const isCommon = commonLower.includes(item.toLowerCase());
    return `<span class="tag ${isCommon ? 'common' : ''}">${escapeHtml(item)}</span>`;
  }).join('');
  return `<div class="tag-group-label">${label}</div><div class="tag-group">${tags}</div>`;
}

// ---------- Chat ----------
const chatOverlay = document.getElementById('chatOverlay');
const chatPeerName = document.getElementById('chatPeerName');
const chatPeerEmail = document.getElementById('chatPeerEmail');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatCloseBtn = document.getElementById('chatCloseBtn');

let activeChatPeerId = null;
let chatPollTimer = null;
const CHAT_POLL_MS = 3000;

function openChat(peerId, peerName, peerEmail) {
  activeChatPeerId = peerId;
  chatPeerName.textContent = peerName;
  chatPeerEmail.textContent = peerEmail || '';
  chatMessages.innerHTML = '<div class="chat-loading">Loading conversation…</div>';
  chatOverlay.classList.remove('hidden');
  chatInput.value = '';
  chatInput.focus();

  loadChatMessages();
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = setInterval(loadChatMessages, CHAT_POLL_MS);
}

function closeChat() {
  activeChatPeerId = null;
  chatOverlay.classList.add('hidden');
  if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null; }
}

async function loadChatMessages() {
  if (!activeChatPeerId) return;
  try {
    const data = await apiFetch(`/api/messages/${activeChatPeerId}`);
    renderChatMessages(data.messages);
  } catch (err) {
    chatMessages.innerHTML = `<div class="chat-loading">${escapeHtml(err.message)}</div>`;
  }
}

function renderChatMessages(messages) {
  const wasNearBottom = chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 40;

  if (!messages || messages.length === 0) {
    chatMessages.innerHTML = '<div class="chat-loading">No messages yet — say hi 👋</div>';
    return;
  }

  chatMessages.innerHTML = messages.map(m => `
    <div class="chat-bubble-row ${m.mine ? 'mine' : ''}">
      <div class="chat-bubble">${escapeHtml(m.body)}</div>
    </div>
  `).join('');

  if (wasNearBottom || messages.length <= 1) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = chatInput.value.trim();
  if (!body || !activeChatPeerId) return;

  chatInput.value = '';
  try {
    await apiFetch('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ recipientId: activeChatPeerId, body })
    });
    await loadChatMessages();
  } catch (err) {
    alert(err.message);
  }
});

chatCloseBtn.addEventListener('click', closeChat);
chatOverlay.addEventListener('click', (e) => {
  if (e.target === chatOverlay) closeChat();
});

// ---------- On page load: resume session if we have a saved token ----------
(async function init() {
  if (token) {
    try {
      currentUser = await apiFetch('/api/me');
      enterApp();
      return;
    } catch (err) {
      // token invalid/expired — clear it and fall through to auth screen
      setToken(null);
    }
  }
  showView('auth');
})();
