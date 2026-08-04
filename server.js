/* Development MVP server. Replace JSON storage and demo identity before production. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const storePath = path.join(root, 'data', 'store.json');
const publicTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8' };
const employee = { id: 'usr_aisha', name: 'Aisha Tan', title: 'Product Designer', skills: ['Figma', 'Research', 'Design systems', 'Prototyping'], location: 'Kuala Lumpur', preferences: { workMode: ['Hybrid', 'Remote'] } };
const employer = { id: 'usr_northstar', companyId: 'cmp_northstar', name: 'Northstar Labs' };
const admin = { id: 'usr_admin', name: 'Platform Administrator', role: 'platform_admin' };
const categories = ['Agriculture', 'Household Services', 'Travel & Tourism', 'Retail', 'Food & Beverage', 'Construction', 'Healthcare', 'Education', 'Technology', 'Logistics', 'Other'];
const requestWindows = new Map();
const loginFailures = new Map();
const sessions = new Map();

function readStore() { return JSON.parse(fs.readFileSync(storePath, 'utf8')); }
function writeStore(store) { fs.writeFileSync(storePath, JSON.stringify(store, null, 2)); }
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function audit(store, actorId, type, entityType, entityId, detail) {
  store.auditEvents ??= [];
  store.auditEvents.unshift({ id: id('audit'), actorId, type, entityType, entityId, detail, createdAt: new Date().toISOString() });
}
function remindersFor(store, audience) {
  const now = Date.now(); const lead = 24 * 60 * 60 * 1000;
  return (store.interviews || []).map((interview) => {
    const application = store.applications.find((item) => item.id === interview.applicationId);
    const job = application && store.jobs.find((item) => item.id === application.jobId);
    const when = new Date(interview.scheduledAt).getTime();
    return { ...interview, application, job, audience, reminderAt: new Date(when - lead).toISOString(), due: now >= when - lead && now < when, upcoming: now < when };
  }).filter((item) => item.application && item.upcoming).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}
function assistantReply(message) {
  const text = String(message || '').toLowerCase();
  if (text.includes('apply') || text.includes('application')) return { answer: 'Open a job match, expand “View job details and match reasons”, then select Apply. You can cancel while the application is submitted, reviewing, or shortlisted.', suggestions: ['How do I cancel an application?', 'How do I prepare for an interview?'] };
  if (text.includes('interview')) return { answer: 'Employers can schedule an online interview with a meeting link or an in-person interview with a location. Both sides receive a reminder 24 hours before the scheduled time.', suggestions: ['What should I prepare?', 'How do reminders work?'] };
  if (text.includes('salary') || text.includes('pay')) return { answer: 'Every vacancy can show a daily, weekly, or monthly pay range, working hours, off-days, and the company payment method so you can compare roles clearly.', suggestions: ['Find part-time jobs', 'Show monthly jobs'] };
  if (text.includes('security') || text.includes('2fa') || text.includes('two factor')) return { answer: 'Open Security in the top bar to enable two-factor authentication. In this local build, the verification code is shown on screen; production should deliver it by SMS or email.', suggestions: ['Enable 2FA'] };
  return { answer: 'I can help with job search, applications, interviews, salary details, profile setup, and account security. What would you like to do?', suggestions: ['Find jobs in my category', 'How do I apply?', 'Enable 2FA'] };
}
async function geminiReply(message, role = 'employee', history = []) {
  if (!process.env.GEMINI_API_KEY) return { ...assistantReply(message), provider: 'local-fallback' };
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const system = role === 'admin' ? 'You are CareerSync Admin Copilot. Help platform administrators moderate jobs and companies, interpret metrics, spot safety risks, and explain actions. Never expose private user data. Be concise and operational.' : 'You are CareerSync AI Career Coach. Help employees and employers with job search, applications, interviews, pay details, profile completion, and workplace safety. Give practical, accurate answers. Never use protected traits for hiring decisions.';
  try {
    const safeHistory = Array.isArray(history) ? history.filter((item) => ['user', 'model'].includes(item.role) && item.text).slice(-10).map((item) => ({ role: item.role, parts: [{ text: String(item.text).slice(0, 4000) }] })) : [];
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [...safeHistory, { role: 'user', parts: [{ text: String(message || '') }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 500 } }) });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    const data = await response.json(); const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    if (!answer) throw new Error('Gemini returned no answer');
    return { answer, provider: 'gemini', suggestions: [] };
  } catch (error) { console.error(error.message); return { ...assistantReply(message), provider: 'local-fallback', warning: 'Gemini was unavailable; local guidance was used.' }; }
}
async function streamAssistant(res, input) {
  const role = input.role || 'employee'; const message = input.message || ''; const history = Array.isArray(input.history) ? input.history : [];
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  if (!process.env.GEMINI_API_KEY) { const fallback = assistantReply(message).answer; res.write(`data: ${JSON.stringify({ text: fallback, provider: 'local-fallback' })}\n\n`); res.write('data: [DONE]\n\n'); return res.end(); }
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'; const system = role === 'admin' ? 'You are CareerSync Admin Copilot. Help platform administrators moderate jobs and companies, interpret metrics, spot safety risks, and explain actions. Never expose private user data. Be concise and operational.' : 'You are CareerSync AI Career Coach. Help employees and employers with job search, applications, interviews, pay details, profile completion, and workplace safety. Give practical, accurate answers. Never use protected traits for hiring decisions.';
  const safeHistory = history.filter((item) => ['user', 'model'].includes(item.role) && item.text).slice(-10).map((item) => ({ role: item.role, parts: [{ text: String(item.text).slice(0, 4000) }] }));
  try {
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [...safeHistory, { role: 'user', parts: [{ text: String(message) }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 500 } }) });
    if (!upstream.ok) throw new Error(`Gemini stream failed (${upstream.status})`);
    const decoder = new TextDecoder(); let buffer = '';
    for await (const chunk of upstream.body) { buffer += decoder.decode(chunk, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (!line.startsWith('data:')) continue; const raw = line.slice(5).trim(); if (!raw || raw === '[DONE]') continue; try { const data = JSON.parse(raw); const textPart = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(''); if (textPart) res.write(`data: ${JSON.stringify({ text: textPart, provider: 'gemini' })}\n\n`); } catch {} } }
    res.write('data: [DONE]\n\n'); res.end();
  } catch (error) { const fallback = assistantReply(message).answer; res.write(`data: ${JSON.stringify({ text: fallback, provider: 'local-fallback', warning: error.message })}\n\n`); res.write('data: [DONE]\n\n'); res.end(); }
}
function findUserByIdentifier(store, identifier) {
  const value = String(identifier || '').trim().toLowerCase(); store.users ??= [];
  return store.users.find((user) => user.email === value || user.username?.toLowerCase() === value || user.name?.toLowerCase() === value || user.profile?.phone?.toLowerCase() === value);
}
function publicUser(user) { return user ? { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, companyId: user.companyId, profile: user.profile, twoFactorEnabled: !!user.twoFactorEnabled } : null; }
function requestKey(req, suffix) { return `${req.socket.remoteAddress || 'local'}:${suffix}`; }
function rateLimited(key, max, windowMs) { const now = Date.now(); const current = requestWindows.get(key); if (!current || current.resetAt <= now) { requestWindows.set(key, { count: 1, resetAt: now + windowMs }); return false; } current.count += 1; return current.count > max; }
function locked(identifier) { const entry = loginFailures.get(String(identifier || '').toLowerCase()); return entry && entry.lockedUntil > Date.now(); }
function recordLoginFailure(identifier) { const key = String(identifier || '').toLowerCase(); const entry = loginFailures.get(key) || { count: 0 }; entry.count += 1; if (entry.count >= 5) entry.lockedUntil = Date.now() + 15 * 60 * 1000; loginFailures.set(key, entry); }
function clearLoginFailures(identifier) { loginFailures.delete(String(identifier || '').toLowerCase()); }
function notify(store, recipientId, type, title, body, actionUrl, dedupeKey) { store.notifications ??= []; if (dedupeKey && store.notifications.some((item) => item.dedupeKey === dedupeKey)) return; store.notifications.unshift({ id: id('notif'), recipientId, type, title, body, actionUrl: actionUrl || '', readAt: null, dedupeKey: dedupeKey || null, createdAt: new Date().toISOString() }); }
async function deliverVerificationCode(user, channel, code) {
  if (channel === 'email' && process.env.SENDGRID_API_KEY && process.env.MAIL_FROM && user.email) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ personalizations: [{ to: [{ email: user.email }] }], from: { email: process.env.MAIL_FROM, name: 'CareerSync AI' }, subject: 'Your CareerSync verification code', content: [{ type: 'text/plain', value: `Your CareerSync verification code is ${code}. It expires in 10 minutes.` }] }) });
    return { sent: response.ok, provider: 'sendgrid' };
  }
  if (channel === 'sms' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM && user.profile?.phone) {
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'); const form = new URLSearchParams({ To: user.profile.phone, From: process.env.TWILIO_FROM, Body: `CareerSync verification code: ${code}. Expires in 10 minutes.` });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    return { sent: response.ok, provider: 'twilio' };
  }
  return { sent: false, provider: 'development', reason: 'No email or SMS provider is configured.' };
}
function ensureOffer(store, application) { store.offers ??= []; let offer = store.offers.find((item) => item.applicationId === application.id && ['sent', 'accepted'].includes(item.status)); if (!offer) { const job = store.jobs.find((item) => item.id === application.jobId); offer = { id: id('offer'), applicationId: application.id, title: job?.title || 'CareerSync offer', salary: job?.salary || 'To be discussed', payFrequency: job?.paymentFrequency || 'Monthly', benefits: [], startDate: null, probationMonths: null, workHoursPerDay: job?.workHoursPerDay || 8, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), status: 'sent', createdAt: new Date().toISOString() }; store.offers.push(offer); } return offer; }
function issueSession(user) { const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { userId: user.id, role: user.role, companyId: user.companyId || null, expiresAt: Date.now() + 8 * 60 * 60 * 1000 }); return { token, expiresAt: sessions.get(token).expiresAt }; }
function sessionFrom(req) { const header = req.headers.authorization || ''; const token = header.startsWith('Bearer ') ? header.slice(7) : ''; const session = sessions.get(token); if (!session) return null; if (session.expiresAt <= Date.now()) { sessions.delete(token); return null; } return { ...session, token }; }
function requireRole(req, res, roles) { const session = sessionFrom(req); if (process.env.AUTH_ENFORCED !== 'true') return session || { userId: 'local-demo', role: 'platform_admin' }; if (!session || !roles.includes(session.role)) { json(res, 401, { error: 'Authentication required.' }); return null; } return session; }
function match(job) {
  const required = job.requiredSkills || [];
  const common = required.filter((skill) => employee.skills.map((s) => s.toLowerCase()).includes(skill.toLowerCase()));
  const skillScore = required.length ? common.length / required.length : 0.6;
  const modeScore = employee.preferences.workMode.includes(job.workMode) ? 1 : 0.45;
  const locationScore = job.location === employee.location || job.workMode === 'Remote' ? 1 : 0.55;
  const score = Math.round((skillScore * .65 + modeScore * .2 + locationScore * .15) * 100);
  return { score, factors: [
    `${common.length} of ${required.length || 0} required skills match`,
    `${job.workMode} work preference ${modeScore === 1 ? 'matches' : 'partially matches'}`,
    `${job.location || 'Flexible location'} ${locationScore === 1 ? 'fits your preferences' : 'may need review'}`
  ] };
}
async function body(req) { let data = ''; for await (const chunk of req) data += chunk; return data ? JSON.parse(data) : {}; }
function serveFile(req, res) {
  let file = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const target = path.normalize(path.join(root, file));
  if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return json(res, 404, { error: 'Not found' });
  res.writeHead(200, { 'Content-Type': publicTypes[path.extname(target)] || 'application/octet-stream' }); fs.createReadStream(target).pipe(res);
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return serveFile(req, res);
    const store = readStore();
    if (req.method === 'GET' && url.pathname === '/api/me') return json(res, 200, { employee, employer, admin });
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const input = await body(req); const role = input.role === 'employer' ? 'employer_admin' : 'employee';
      if (!input.name?.trim() || !input.email?.trim() || !input.password || input.password.length < 6) return json(res, 400, { error: 'Name, email, and a password of at least 6 characters are required.' });
      store.users ??= []; if (store.users.some((user) => user.email === input.email.trim().toLowerCase())) return json(res, 409, { error: 'An account with this email already exists.' });
      if (input.profileImage && input.profileImage.length > 3000000) return json(res, 413, { error: 'Profile picture must be smaller than 2 MB.' });
      const profile = { age: input.age ? Number(input.age) : null, region: input.region?.trim() || '', phone: input.phone?.trim() || '', gender: input.gender || 'prefer_not_to_say', maritalStatus: input.maritalStatus || 'prefer_not_to_say', healthStatus: input.healthStatus || 'prefer_not_to_say', profileImage: input.profileImage || '', visibility: input.profileVisibility || 'private' };
    const baseUsername = String(input.username || input.name).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '.').replace(/^\.|\.$/g, '') || 'user';
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(baseUsername)) return json(res, 400, { error: 'Username must be 3–30 characters using letters, numbers, dots, underscores, or hyphens.' });
    if (store.users.some((item) => item.username?.toLowerCase() === baseUsername)) return json(res, 409, { error: 'That username is already taken.' });
    const username = baseUsername;
    const user = { id: id('usr'), name: input.name.trim(), username, email: input.email.trim().toLowerCase(), role, profile, passwordHash: crypto.createHash('sha256').update(input.password).digest('hex'), createdAt: new Date().toISOString(), status: 'active' };
      if (role === 'employer_admin') {
        if (!input.companyName?.trim()) return json(res, 400, { error: 'Company name is required for employer registration.' });
        const company = { id: id('cmp'), displayName: input.companyName.trim(), trustScore: 0, verified: false, verificationStatus: 'pending', createdAt: new Date().toISOString() }; user.companyId = company.id; store.companies.push(company);
      }
      store.users.push(user); audit(store, user.id, 'account.registered', 'user', user.id, role); writeStore(store); return json(res, 201, { user: publicUser(user), message: `${role === 'employer_admin' ? 'Employer account created and sent for company verification.' : 'Employee account created.'} Your username is ${user.username}.` });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login/password') {
      if (rateLimited(requestKey(req, 'login-password'), 20, 15 * 60 * 1000)) return json(res, 429, { error: 'Too many login attempts. Try again later.' });
      const input = await body(req); if (locked(input.identifier)) return json(res, 423, { error: 'This account is temporarily locked after too many failed attempts.' }); const user = findUserByIdentifier(store, input.identifier); const hash = crypto.createHash('sha256').update(String(input.password || '')).digest('hex');
      if (!user || hash !== user.passwordHash) { recordLoginFailure(input.identifier); return json(res, 401, { error: 'Incorrect login details.' }); }
      clearLoginFailures(input.identifier);
      audit(store, user.id, 'auth.login', 'user', user.id, 'Password login'); writeStore(store); return json(res, 200, { user: publicUser(user), session: issueSession(user), message: 'Login successful.' });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login/request') {
      if (rateLimited(requestKey(req, 'login-code'), 5, 15 * 60 * 1000)) return json(res, 429, { error: 'Too many code requests. Try again later.' });
      const input = await body(req); if (!String(input.identifier || '').trim()) return json(res, 400, { error: `Enter your registered ${input.channel === 'sms' ? 'phone number' : 'email'} before requesting a code.` }); const user = findUserByIdentifier(store, input.identifier); if (!user) return json(res, 404, { error: 'No registered account matches that email, phone number, name, or username.' });
      const code = String(Math.floor(100000 + Math.random() * 900000)); user.loginCodeHash = crypto.createHash('sha256').update(code).digest('hex'); user.loginCodeExpiresAt = Date.now() + 600000; user.loginCodeChannel = input.channel || 'email'; const delivery = await deliverVerificationCode(user, user.loginCodeChannel, code); writeStore(store); return json(res, 200, { message: delivery.sent ? `Verification code sent by ${user.loginCodeChannel === 'sms' ? 'SMS' : 'email'}.` : `Code created, but ${user.loginCodeChannel === 'sms' ? 'SMS' : 'email'} delivery is not configured on this server.`, delivery, devCode: delivery.sent ? undefined : code });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login/verify') {
      const input = await body(req); const user = findUserByIdentifier(store, input.identifier); const hash = crypto.createHash('sha256').update(String(input.code || '')).digest('hex');
      if (!user || !user.loginCodeHash || user.loginCodeExpiresAt < Date.now() || hash !== user.loginCodeHash) return json(res, 400, { error: 'Invalid or expired verification code.' });
      delete user.loginCodeHash; delete user.loginCodeExpiresAt; delete user.loginCodeChannel; audit(store, user.id, 'auth.login', 'user', user.id, 'Verification-code login'); writeStore(store); return json(res, 200, { user: publicUser(user), session: issueSession(user), message: 'Login successful.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/session') { const session = sessionFrom(req); return json(res, session ? 200 : 401, session ? { session } : { error: 'Session expired.' }); }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') { const session = sessionFrom(req); if (session) sessions.delete(session.token); return json(res, 200, { message: 'Logged out.' }); }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout-all') { const session = sessionFrom(req); if (session) for (const [token, item] of sessions) if (item.userId === session.userId) sessions.delete(token); return json(res, 200, { message: 'All sessions revoked.' }); }
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok', service: 'careersync-ai', timestamp: new Date().toISOString() });
    if (req.method === 'GET' && url.pathname === '/api/categories') return json(res, 200, { categories });
    if (req.method === 'POST' && url.pathname === '/api/assistant/stream') { const input = await body(req); return streamAssistant(res, input); }
    if (req.method === 'POST' && url.pathname === '/api/assistant') { const input = await body(req); return json(res, 200, await geminiReply(input.message, input.role || 'employee', input.history || [])); }
    if (req.method === 'POST' && url.pathname === '/api/auth/2fa/request') {
      const input = await body(req); store.users ??= []; const user = store.users.find((item) => item.email === input.email?.trim().toLowerCase());
      if (!user) return json(res, 404, { error: 'No registered account found for that email.' });
      const code = '246810'; user.twoFactorCodeHash = crypto.createHash('sha256').update(code).digest('hex'); user.twoFactorExpiresAt = Date.now() + 300000; writeStore(store); return json(res, 200, { message: 'Verification code created.', devCode: code });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/2fa/verify') {
      const input = await body(req); store.users ??= []; const user = store.users.find((item) => item.email === input.email?.trim().toLowerCase()); const hash = crypto.createHash('sha256').update(String(input.code || '')).digest('hex');
      if (!user || !user.twoFactorCodeHash || user.twoFactorExpiresAt < Date.now() || hash !== user.twoFactorCodeHash) return json(res, 400, { error: 'Invalid or expired verification code.' });
      user.twoFactorEnabled = true; delete user.twoFactorCodeHash; delete user.twoFactorExpiresAt; audit(store, user.id, 'security.2fa_enabled', 'user', user.id, 'Two-factor authentication enabled'); writeStore(store); return json(res, 200, { message: 'Two-factor authentication enabled.' });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/password-reset/request') {
      if (rateLimited(requestKey(req, 'password-reset'), 5, 15 * 60 * 1000)) return json(res, 429, { error: 'Too many reset requests. Try again later.' });
      const input = await body(req); const user = findUserByIdentifier(store, input.identifier); if (!user) return json(res, 404, { error: 'No registered account matches that email or phone number.' });
      if (input.channel === 'email' && !user.email) return json(res, 400, { error: 'This account has no registered email address.' });
      if (input.channel === 'sms' && !user.profile?.phone) return json(res, 400, { error: 'This account has no registered phone number.' });
      const code = String(Math.floor(100000 + Math.random() * 900000)); user.passwordResetCodeHash = crypto.createHash('sha256').update(code).digest('hex'); user.passwordResetExpiresAt = Date.now() + 600000; user.passwordResetChannel = input.channel; writeStore(store); return json(res, 200, { message: `Verification code prepared for ${input.channel === 'sms' ? 'SMS' : 'email'}.`, devCode: code });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/password-reset/confirm') {
      const input = await body(req); const user = findUserByIdentifier(store, input.identifier); const hash = crypto.createHash('sha256').update(String(input.code || '')).digest('hex');
      if (!user || !user.passwordResetCodeHash || user.passwordResetExpiresAt < Date.now() || hash !== user.passwordResetCodeHash) return json(res, 400, { error: 'Invalid or expired verification code.' });
      if (!input.newPassword || input.newPassword.length < 6) return json(res, 400, { error: 'New password must be at least 6 characters.' });
      user.passwordHash = crypto.createHash('sha256').update(input.newPassword).digest('hex'); delete user.passwordResetCodeHash; delete user.passwordResetExpiresAt; delete user.passwordResetChannel; audit(store, user.id, 'security.password_reset', 'user', user.id, 'Password reset completed'); writeStore(store); return json(res, 200, { message: 'Password reset successfully. You can now sign in.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/jobs') {
      const applied = new Set(store.applications.filter((a) => a.employeeId === employee.id).map((a) => a.jobId));
      const jobs = store.jobs.filter((j) => j.status === 'published').map((job) => ({ ...job, ...match(job), applied: applied.has(job.id) })).sort((a, b) => b.score - a.score);
      return json(res, 200, { jobs });
    }
    if (req.method === 'POST' && /^\/api\/jobs\/[^/]+\/apply$/.test(url.pathname)) {
      const jobId = url.pathname.split('/')[3];
      if (!store.jobs.some((job) => job.id === jobId && job.status === 'published')) return json(res, 404, { error: 'Job not found' });
      if (store.applications.some((application) => application.jobId === jobId && application.employeeId === employee.id)) return json(res, 409, { error: 'You already applied for this role.' });
      const application = { id: id('app'), jobId, employeeId: employee.id, status: 'submitted', submittedAt: new Date().toISOString() };
      store.applications.push(application); notify(store, employer.id, 'application', 'New application received', `Aisha applied for ${store.jobs.find((item) => item.id === jobId)?.title || 'your job'}.`, '/?view=employer&section=candidates', `application:${application.id}`); audit(store, employee.id, 'application.submitted', 'application', application.id, `Applied to ${jobId}`); writeStore(store); return json(res, 201, { application });
    }
    if (req.method === 'GET' && url.pathname === '/api/my-applications') {
      return json(res, 200, { applications: store.applications.filter((a) => a.employeeId === employee.id).map((a) => ({ ...a, cancellable: ['submitted', 'reviewing', 'shortlisted'].includes(a.status), job: store.jobs.find((j) => j.id === a.jobId), interview: (store.interviews || []).find((i) => i.applicationId === a.id), offer: (store.offers || []).find((i) => i.applicationId === a.id && ['sent', 'accepted', 'declined'].includes(i.status)) })) });
    }
    if (req.method === 'GET' && url.pathname === '/api/my-notifications') return json(res, 200, { notifications: (store.notifications || []).filter((item) => item.recipientId === employee.id) });
    if (req.method === 'GET' && url.pathname === '/api/my-offers') return json(res, 200, { offers: (store.offers || []).filter((item) => { const app = store.applications.find((a) => a.id === item.applicationId); return app?.employeeId === employee.id; }).map((item) => ({ ...item, job: store.jobs.find((job) => job.id === store.applications.find((a) => a.id === item.applicationId)?.jobId) })) });
    if (req.method === 'PATCH' && /^\/api\/applications\/[^/]+\/cancel$/.test(url.pathname)) {
      const application = store.applications.find((a) => a.id === url.pathname.split('/')[3] && a.employeeId === employee.id);
      if (!application) return json(res, 404, { error: 'Application not found.' });
      if (!['submitted', 'reviewing', 'shortlisted'].includes(application.status)) return json(res, 409, { error: 'This application can no longer be cancelled because the employer has moved it to the interview or offer stage.' });
      application.status = 'withdrawn'; application.updatedAt = new Date().toISOString(); audit(store, employee.id, 'application.withdrawn', 'application', application.id, 'Cancelled by employee'); writeStore(store); return json(res, 200, { application });
    }
    if (req.method === 'GET' && url.pathname === '/api/employee/reminders') return json(res, 200, { reminders: remindersFor(store, 'employee') });
    if (req.method === 'GET' && url.pathname === '/api/employer/dashboard') {
      const jobs = store.jobs.filter((job) => job.companyId === employer.companyId);
      const applications = store.applications.filter((application) => jobs.some((job) => job.id === application.jobId));
      const candidates = applications.map((application) => ({ ...application, candidate: employee, job: jobs.find((job) => job.id === application.jobId), ...match(jobs.find((job) => job.id === application.jobId)) })).sort((a, b) => b.score - a.score);
 return json(res, 200, { company: store.companies.find((company) => company.id === employer.companyId), jobs, candidates, interviews: (store.interviews || []).filter((i) => applications.some((a) => a.id === i.applicationId)), reminders: remindersFor(store, 'employer'), notifications: (store.notifications || []).filter((item) => item.recipientId === employer.id), metrics: { activeJobs: jobs.filter((j) => j.status === 'published').length, applicants: applications.length, responseDays: 2.8 } });
    }
    if (req.method === 'POST' && url.pathname === '/api/employer/jobs') {
      const input = await body(req);
      if (!input.title?.trim() || !input.description?.trim() || !input.requiredSkills?.length) return json(res, 400, { error: 'Title, description, and at least one required skill are required.' });
      const job = { id: id('job'), companyId: employer.companyId, title: input.title.trim(), description: input.description.trim(), category: categories.includes(input.category) ? input.category : 'Other', location: input.location?.trim() || 'Kuala Lumpur', workMode: input.workMode || 'Hybrid', salary: input.salary?.trim() || 'Salary not disclosed', paymentFrequency: input.paymentFrequency || 'Monthly', employmentType: input.employmentType || 'Permanent', workHoursPerDay: Number(input.workHoursPerDay) || 8, offDays: input.offDays?.trim() || 'Saturday and Sunday', minPay: input.minPay?.trim() || '', maxPay: input.maxPay?.trim() || '', paymentMethod: input.paymentMethod || 'Bank transfer', requiredSkills: input.requiredSkills.map((s) => s.trim()).filter(Boolean), status: 'published', createdAt: new Date().toISOString() };
      store.jobs.push(job); audit(store, employer.id, 'job.published', 'job', job.id, job.title); writeStore(store); return json(res, 201, { job });
    }
    if (req.method === 'PATCH' && /^\/api\/employer\/applications\/[^/]+$/.test(url.pathname)) {
      const input = await body(req); const application = store.applications.find((a) => a.id === url.pathname.split('/').pop());
      const allowed = ['submitted', 'reviewing', 'shortlisted', 'interviewing', 'offered', 'hired', 'rejected'];
      if (!application) return json(res, 404, { error: 'Application not found' });
      if (!allowed.includes(input.status)) return json(res, 400, { error: 'Invalid status' });
      application.status = input.status; application.updatedAt = new Date().toISOString(); if (input.status === 'shortlisted' || input.status === 'offered') { const offer = ensureOffer(store, application); notify(store, employee.id, 'offer', 'Your offer letter is ready', `Northstar Labs shortlisted you for ${store.jobs.find((item) => item.id === application.jobId)?.title || 'the role'}.`, '/?view=employee&section=offers', `offer:${offer.id}`); notify(store, employer.id, 'offer', 'Offer letter issued', 'The employee has been notified that their offer is ready.', '/?view=employer&section=candidates', `offer-employer:${offer.id}`); } if (input.status === 'interviewing') notify(store, employee.id, 'interview', 'Interview stage updated', 'Your application has moved to the interview stage.', '/?view=employee&section=interviews', `interview-stage:${application.id}`); audit(store, employer.id, 'application.status_updated', 'application', application.id, input.status); writeStore(store); return json(res, 200, { application });
    }
    if (req.method === 'GET' && url.pathname === '/api/employer/notifications') return json(res, 200, { notifications: (store.notifications || []).filter((item) => item.recipientId === employer.id) });
    if (req.method === 'PATCH' && /^\/api\/offers\/[^/]+\/respond$/.test(url.pathname)) { const input = await body(req); const offer = (store.offers || []).find((item) => item.id === url.pathname.split('/')[3]); const application = offer && store.applications.find((item) => item.id === offer.applicationId && item.employeeId === employee.id); if (!offer || !application) return json(res, 404, { error: 'Offer not found.' }); if (!['accepted', 'declined'].includes(input.status)) return json(res, 400, { error: 'Invalid offer response.' }); offer.status = input.status; offer.respondedAt = new Date().toISOString(); application.status = input.status === 'accepted' ? 'hired' : 'rejected'; notify(store, employer.id, 'offer', `Offer ${input.status}`, `The employee has ${input.status} the offer.`, '/?view=employer&section=candidates', `offer-response:${offer.id}`); audit(store, employee.id, 'offer.responded', 'offer', offer.id, input.status); writeStore(store); return json(res, 200, { offer, application }); }
    if (req.method === 'POST' && url.pathname === '/api/employer/interviews') {
      const input = await body(req); const application = store.applications.find((a) => a.id === input.applicationId);
      if (!application) return json(res, 404, { error: 'Application not found' });
      if (!input.scheduledAt || !input.timezone || !input.interviewMode) return json(res, 400, { error: 'Date, time zone, and interview format are required.' });
      if (input.interviewMode === 'online' && !input.meetingLink) return json(res, 400, { error: 'A meeting link is required for online interviews.' });
      if (input.interviewMode === 'online') { try { new URL(input.meetingLink); } catch { return json(res, 400, { error: 'Please provide a valid meeting link.' }); } }
      if (input.interviewMode === 'in-person' && !input.location?.trim()) return json(res, 400, { error: 'A meeting location is required for in-person interviews.' });
      store.interviews ??= []; const interview = { id: id('int'), applicationId: application.id, scheduledAt: input.scheduledAt, timezone: input.timezone, interviewMode: input.interviewMode, meetingLink: input.meetingLink || '', location: input.location?.trim() || '', notes: input.notes?.trim() || '', employerReminderAt: new Date(new Date(input.scheduledAt).getTime() - 86400000).toISOString(), employeeReminderAt: new Date(new Date(input.scheduledAt).getTime() - 86400000).toISOString(), createdAt: new Date().toISOString() };
      const existing = store.interviews.findIndex((i) => i.applicationId === application.id); if (existing >= 0) store.interviews[existing] = interview; else store.interviews.push(interview);
      application.status = 'interviewing'; application.updatedAt = new Date().toISOString(); audit(store, employer.id, 'interview.scheduled', 'interview', interview.id, `${input.scheduledAt} (${input.timezone})`); writeStore(store); return json(res, 201, { interview });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/dashboard') {
      if (!requireRole(req, res, ['platform_admin'])) return;
      const users = [...(store.users || []), { id: employee.id, name: employee.name, role: 'employee', status: 'active' }, { id: employer.id, name: employer.name, role: 'employer_admin', status: 'active' }, { id: admin.id, name: admin.name, role: admin.role, status: 'active' }];
      return json(res, 200, { users, companies: store.companies, jobs: store.jobs, applications: store.applications, auditEvents: (store.auditEvents || []).slice(0, 12), metrics: { users: users.length, companies: store.companies.length, activeJobs: store.jobs.filter((j) => j.status === 'published').length, applications: store.applications.length } });
    }
    if (req.method === 'PATCH' && /^\/api\/admin\/companies\/[^/]+$/.test(url.pathname)) {
      if (!requireRole(req, res, ['platform_admin'])) return;
      const input = await body(req); const company = store.companies.find((c) => c.id === url.pathname.split('/').pop()); const allowed = ['pending', 'verified', 'suspended'];
      if (!company) return json(res, 404, { error: 'Company not found' });
      if (!allowed.includes(input.verificationStatus)) return json(res, 400, { error: 'Invalid verification status' });
      company.verificationStatus = input.verificationStatus; company.verified = input.verificationStatus === 'verified'; audit(store, admin.id, 'company.verification_updated', 'company', company.id, input.verificationStatus); writeStore(store); return json(res, 200, { company });
    }
    if (req.method === 'PATCH' && /^\/api\/admin\/jobs\/[^/]+$/.test(url.pathname)) {
      if (!requireRole(req, res, ['platform_admin'])) return;
      const input = await body(req); const job = store.jobs.find((j) => j.id === url.pathname.split('/').pop()); const allowed = ['published', 'closed', 'draft'];
      if (!job) return json(res, 404, { error: 'Job not found' });
      if (!allowed.includes(input.status)) return json(res, 400, { error: 'Invalid job status' });
      job.status = input.status; audit(store, admin.id, 'job.moderation_updated', 'job', job.id, input.status); writeStore(store); return json(res, 200, { job });
    }
    return json(res, 404, { error: 'API route not found' });
  } catch (error) { console.error(error); return json(res, 500, { error: 'Something went wrong. Please retry.' }); }
});
server.listen(process.env.PORT || 3000, () => console.log(`CareerSync AI running at http://localhost:${process.env.PORT || 3000}`));
