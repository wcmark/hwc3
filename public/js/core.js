import './back-to-top.js';

export async function holyrics(action, data = {}) {
  const response = await fetch(`/api/holyrics/${encodeURIComponent(action)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data)
  });
  const result = await response.json().catch(() => ({}));
  if (result.code === 'DEVICE_UNAUTHORIZED') window.location.replace('/access');
  if (result.code === 'PAGE_FORBIDDEN') {
    currentInfo().then(info => {
      if (!info.allowedPages.includes(window.location.pathname)) window.location.replace(info.landingPath || '/access');
    }).catch(() => {});
  }
  if (!response.ok || result.status === 'error') throw new Error(result.error ?? `Error HTTP ${response.status}`);
  return result;
}

export function toast(message, error = false) {
  let node = document.querySelector('.toast');
  if (!node) { node = document.createElement('div'); node.className = 'toast'; document.body.append(node); }
  node.textContent = message; node.classList.toggle('error', error);
  clearTimeout(node._timer); node._timer = setTimeout(() => node.remove(), 3300);
}

export function setBusy(button, busy) { if (button) button.disabled = Boolean(busy); }
export function esc(text = '') { return String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }

export async function currentInfo() {
  const response = await fetch('/api/app-info');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Error HTTP ${response.status}`);
  return result;
}

export function renderNav(active = '', allowedPages = []) {
  const nav = document.querySelector('.nav');
  const links = [['/','Inicio'],['/ppt','Presentación'],['/playlists','Playlists'],['/letras','Letras'],['/medios','Medios'],['/biblia','Biblia'],['/chat','Chat']];
  if (nav) nav.innerHTML = links.filter(([href]) => allowedPages.includes(href)).map(([href,label]) => `<a href="${href}" class="${active === href ? 'active' : ''}"${href === '/chat' ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`).join('');
  document.querySelectorAll('.home-shell .tile').forEach(tile => { tile.hidden = !allowedPages.includes(tile.getAttribute('href')); });
}

export async function showConnection() {
  const pill = document.querySelector('.status-pill');
  if (!pill) return;
  try {
    const info = await currentInfo();
    pill.textContent = info.connected ? `Holyrics · ${info.activeTeam}` : 'Configura Holyrics';
    pill.classList.toggle('online', info.connected);
  } catch { pill.textContent = 'Sin conexión'; }
}

export function initShell(active = '') {
  renderNav(active);
  currentInfo().then(info => {
    renderNav(active, info.allowedPages ?? []);
    if (info.allowedPages && !info.allowedPages.includes(active)) window.location.replace(info.landingPath || '/access');
    const pill = document.querySelector('.status-pill');
    if (pill) {
      pill.textContent = info.connected ? `Holyrics · ${info.activeTeam}` : 'Configura Holyrics';
      pill.classList.toggle('online', info.connected);
    }
  }).catch(() => {
    const pill = document.querySelector('.status-pill');
    if (pill) pill.textContent = 'Sin conexión';
  });
}
