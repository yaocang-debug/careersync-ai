const $ = (selector) => document.querySelector(selector);
const toast = $('.toast');
const api = async (url, options = {}) => {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
};
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
function message(text) { toast.textContent = text; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
const adminApi = async (url, options = {}) => { const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }; const token = localStorage.getItem('careersync-session'); if (token) headers.Authorization = `Bearer ${token}`; const response = await fetch(url, { ...options, headers }); const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; };
async function renderAdmin() {
  const el = $('#admin-content'); el.innerHTML = '<p class="loading">Loading platform controls...</p>';
  try {
    const { metrics, companies, jobs, applications, auditEvents } = await api('/api/admin/dashboard');
    el.innerHTML = `<section class="metrics"><article><p>Total users</p><strong>${metrics.users}</strong><span class="positive">Active accounts</span></article><article><p>Companies</p><strong>${metrics.companies}</strong><span class="positive">Verification queue</span></article><article><p>Live jobs</p><strong>${metrics.activeJobs}</strong><span class="positive">Discoverable now</span></article><article><p>Applications</p><strong>${metrics.applications}</strong><span class="positive">Across platform</span></article></section><div class="admin-grid"><div class="admin-sections"><section class="panel"><div class="panel-head"><h2>Company verification</h2><span class="verified">Moderate</span></div><table class="admin-table"><thead><tr><th>COMPANY</th><th>TRUST</th><th>STATUS</th></tr></thead><tbody>${companies.map((c) => `<tr><td>${escape(c.displayName)}</td><td>${c.trustScore || '—'} / 5</td><td><select data-company="${c.id}"><option value="pending" ${c.verificationStatus === 'pending' ? 'selected' : ''}>Pending</option><option value="verified" ${c.verificationStatus === 'verified' ? 'selected' : ''}>Verified</option><option value="suspended" ${c.verificationStatus === 'suspended' ? 'selected' : ''}>Suspended</option></select></td></tr>`).join('')}</tbody></table></section><section class="panel"><div class="panel-head"><h2>Job moderation</h2><span>${jobs.length} listings</span></div><table class="admin-table"><thead><tr><th>ROLE</th><th>COMPANY</th><th>STATUS</th></tr></thead><tbody>${jobs.map((j) => `<tr><td>${escape(j.title)}</td><td>Northstar Labs</td><td><select data-job="${j.id}"><option value="published" ${j.status === 'published' ? 'selected' : ''}>Published</option><option value="draft" ${j.status === 'draft' ? 'selected' : ''}>Draft</option><option value="closed" ${j.status === 'closed' ? 'selected' : ''}>Closed</option></select></td></tr>`).join('')}</tbody></table></section></div><div class="admin-sections"><section class="panel"><div class="panel-head"><h2>Applications</h2><span>${applications.length} total</span></div>${applications.length ? applications.map((a) => `<div class="trust-row"><span>${escape(a.status)}</span><b>${new Date(a.submittedAt).toLocaleDateString()}</b></div>`).join('') : '<div class="empty"><h3>No applications</h3><p>Platform activity will appear here.</p></div>'}</section><section class="panel"><div class="panel-head"><h2>Audit trail</h2><span>Latest events</span></div><ul class="audit-list">${auditEvents.length ? auditEvents.map((a) => `<li><strong>${escape(a.type.replaceAll('.', ' '))}</strong><small>${escape(a.detail)} · ${new Date(a.createdAt).toLocaleString()}</small></li>`).join('') : '<li>No activity yet.</li>'}</ul></section></div></div>`;
  } catch (error) { el.innerHTML = `<p class="error">${escape(error.message)}</p>`; }
}
document.addEventListener('change', async (event) => {
  try {
    if (event.target.dataset.company) { await api(`/api/admin/companies/${event.target.dataset.company}`, { method: 'PATCH', body: JSON.stringify({ verificationStatus: event.target.value }) }); message('Company verification updated.'); }
    if (event.target.dataset.job) { await api(`/api/admin/jobs/${event.target.dataset.job}`, { method: 'PATCH', body: JSON.stringify({ status: event.target.value }) }); message('Job moderation status updated.'); }
  } catch (error) { message(error.message); }
});
document.addEventListener('input', (event) => {
  if (event.target.id !== 'admin-search') return;
  const query = event.target.value.toLowerCase(); document.querySelectorAll('.admin-table tbody tr,.audit-list li').forEach((row) => { row.hidden = query && !row.textContent.toLowerCase().includes(query); });
});
document.addEventListener('change', (event) => {
  if (event.target.id !== 'admin-status-filter') return;
  const status = event.target.value; document.querySelectorAll('.admin-table tbody tr').forEach((row) => { row.hidden = status !== 'all' && !row.textContent.toLowerCase().includes(status); });
});
document.addEventListener('click', (event) => {
  const tab = event.target.dataset.adminTab; if (!tab) return;
  document.querySelectorAll('[data-admin-tab]').forEach((button) => button.classList.toggle('active', button === event.target));
  const map = { overview: '.metrics', verification: '.admin-table', jobs: '.admin-table', applications: '.admin-sections', interviews: '.admin-sections', users: '.admin-grid', audit: '.audit-list' };
  document.querySelector(map[tab])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
if (document.querySelector('#admin-ai-open')) document.querySelector('#admin-ai-open').onclick = () => document.querySelector('#admin-ai-dialog').showModal();
if (document.querySelector('#admin-ai-close')) document.querySelector('#admin-ai-close').onclick = () => document.querySelector('#admin-ai-dialog').close();
const adminAssistantHistory = [];
async function streamAdminReply(textValue, history, onText) { const response = await fetch('/api/assistant/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: textValue, role: 'admin', history }) }); if (!response.ok) throw new Error('Admin Copilot is unavailable.'); const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let answer = ''; while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (!line.startsWith('data:')) continue; const payload = line.slice(5).trim(); if (payload === '[DONE]') continue; try { const part = JSON.parse(payload); answer += part.text || ''; onText(answer); } catch {} } } return answer; }
if (document.querySelector('#admin-ai-form')) document.querySelector('#admin-ai-form').onsubmit = async (event) => { event.preventDefault(); const input = event.target.querySelector('input'); const textValue = input.value.trim(); if (!textValue) return; const messages = document.querySelector('#admin-ai-messages'); messages.insertAdjacentHTML('beforeend', `<div class="assistant-message user">${escape(textValue)}</div><div class="assistant-message bot assistant-typing">Thinking...</div>`); const bot = messages.lastElementChild; input.value = ''; try { const answer = await streamAdminReply(textValue, adminAssistantHistory, (text) => { bot.textContent = text; messages.scrollTop = messages.scrollHeight; }); adminAssistantHistory.push({ role: 'user', text: textValue }, { role: 'model', text: answer }); } catch (error) { bot.textContent = error.message; } };
renderAdmin();
