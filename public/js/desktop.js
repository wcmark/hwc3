import { toast, esc } from './core.js';
import { loadAccess } from './device-access.js';
import './desktop-startup.js';
const aboutButton = document.querySelector('#aboutApp');
if (window.holyricsDesktop?.openAbout) {
  aboutButton.hidden = false;
  aboutButton.addEventListener('click', () => window.holyricsDesktop.openAbout().catch(error => toast(error.message, true)));
}
const tabs = ['connection','access','logs'];
const configForm = document.querySelector('#configForm');
let config = null;
const lanIps = [];
let selectedTeam = '';
let preferredLanIp = '';

function request(url, options = {}) { return fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } }).then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? `Error HTTP ${response.status}`); return data; }); }
function activeTeam(teamName = selectedTeam) { return config?.teams?.[teamName] ?? {}; }
function saveTeamFields(teamName = selectedTeam) {
  if (!config) return;
  const name = teamName;
  if (!name) return;
  config.teams[name] = { ip: document.querySelector('#teamIp').value.trim(), port: document.querySelector('#teamPort').value.trim() || '8091', htmlPort: document.querySelector('#teamHtmlPort').value.trim() || '80', token: document.querySelector('#teamToken').value.trim() };
}
function showTeam(teamName = selectedTeam) {
  const team = activeTeam(teamName);
  document.querySelector('#teamIp').value = team.ip ?? '';
  document.querySelector('#teamPort').value = team.port ?? '8091';
  document.querySelector('#teamHtmlPort').value = team.htmlPort ?? 80;
  document.querySelector('#teamToken').value = team.token ?? '';
}
function renderTeamSelect() {
  const select = document.querySelector('#teamSelect');
  const entries = Object.entries(config.teams ?? {});
  select.replaceChildren(...entries.map(([name]) => new Option(name, name)));
  selectedTeam = entries.some(([name]) => name === config.activeTeam) ? config.activeTeam : (entries[0]?.[0] ?? '');
  select.value = selectedTeam;
  config.activeTeam = selectedTeam;
  showTeam(selectedTeam);
}
function displayUrl() {
  const port = config.webPort || 5000;
  document.querySelector('#localUrl').textContent = `http://localhost:${port}`;
  document.querySelector('#webLink').href = `http://localhost:${port}`;
  document.querySelector('#lanUrl').textContent = lanIps.length ? `En la red local: ${lanIps.map(ip => `http://${ip}:${port}`).join(' · ')}` : 'No se detectó una dirección IPv4 de red local.';
}
async function loadConfig() {
  const response = await request('/api/desktop/config');
  config = response;
  lanIps.splice(0, lanIps.length, ...(response.lanIps ?? []));
  preferredLanIp = response.preferredLanIp || lanIps[0] || '';
  renderTeamSelect();
  document.querySelector('#webPortInput').value = config.webPort ?? 5000;
  document.querySelector('#passwordInput').value = config.password ?? '';
  document.querySelector('#pptProjection').value = config.pptProjection ?? '/text3';
  document.querySelector('#pptNextProjection').value = config.pptNextProjection ?? '';
  document.querySelector('#pptEnabled').checked = config.pptEnabled !== false;
  document.querySelector('#bindLan').checked = config.bindLan !== false;
  displayUrl();
}
document.querySelector('#teamSelect').addEventListener('change', event => {
  saveTeamFields(selectedTeam);
  selectedTeam = event.target.value;
  config.activeTeam = selectedTeam;
  showTeam(selectedTeam);
});
document.querySelector('#addTeam').addEventListener('click', () => {
  const editor = document.querySelector('#newTeamEditor');
  editor.hidden = false;
  document.querySelector('#newTeamName').focus();
});
document.querySelector('#createTeam').addEventListener('click', () => {
  const nameInput = document.querySelector('#newTeamName');
  const safe = nameInput.value.trim().replace(/[<>]/g, '').slice(0, 48);
  if (safe.length < 2) return toast('Escribe un nombre de al menos dos caracteres.', true);
  if (config.teams[safe]) return toast('Ese nombre de equipo ya existe.', true);
  saveTeamFields(selectedTeam);
  config.teams[safe] = { ip: '', port: '8091', htmlPort: 80, token: '' };
  config.activeTeam = safe;
  nameInput.value = '';
  document.querySelector('#newTeamEditor').hidden = true;
  renderTeamSelect();
  document.querySelector('#teamIp').focus();
});
document.querySelector('#cancelNewTeam').addEventListener('click', () => {
  document.querySelector('#newTeamName').value = '';
  document.querySelector('#newTeamEditor').hidden = true;
});
document.querySelector('#newTeamName').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); document.querySelector('#createTeam').click(); }
  if (event.key === 'Escape') document.querySelector('#cancelNewTeam').click();
});
configForm.addEventListener('submit', async event => {
  event.preventDefault(); saveTeamFields();
  config.activeTeam = document.querySelector('#teamSelect').value;
  config.webPort = Number(document.querySelector('#webPortInput').value);
  config.password = document.querySelector('#passwordInput').value;
  config.pptProjection = document.querySelector('#pptProjection').value;
  config.pptNextProjection = document.querySelector('#pptNextProjection').value;
  config.pptEnabled = document.querySelector('#pptEnabled').checked;
  config.bindLan = document.querySelector('#bindLan').checked;
  try {
    const result = await request('/api/desktop/config', { method: 'PUT', body: JSON.stringify(config) });
    config = result.config; document.querySelector('#saveResult').textContent = 'Configuración guardada. Recargá Presentación para actualizar sus transmisiones. Solo el puerto del servidor web y la conexión a la red requieren reiniciar.'; displayUrl(); toast('Configuración guardada');
  } catch (error) { toast(error.message, true); }
});
document.querySelector('#testConnection').addEventListener('click', async () => {
  saveTeamFields(); config.activeTeam = document.querySelector('#teamSelect').value;
  try {
    await request('/api/desktop/config', { method: 'PUT', body: JSON.stringify({ ...config, activeTeam: config.activeTeam }) });
    const result = await request('/api/desktop/test-connection', { method: 'POST', body: '{}' });
    document.querySelector('#connectionResult').textContent = `Conectado a Holyrics · ${typeof result.version === 'string' ? result.version : 'API disponible'}`;
  } catch (error) { document.querySelector('#connectionResult').textContent = error.message; }
});
document.querySelector('#copyLink').addEventListener('click', async () => {
  if (!preferredLanIp) return toast('No se detectó una dirección IPv4 de red local.', true);
  const address = `http://${preferredLanIp}:${config.webPort || 5000}`;
  try { await navigator.clipboard.writeText(address); toast(`Dirección copiada: ${address}`); }
  catch (error) { toast(error.message || 'No se pudo copiar la dirección.', true); }
});
document.querySelector('#webLink').addEventListener('click', async event => {
  if (!window.holyricsDesktop?.openWebPanel) return;
  event.preventDefault();
  try { await window.holyricsDesktop.openWebPanel(); }
  catch (error) { toast(error.message || 'No se pudo abrir el panel web.', true); }
});
document.querySelector('#legacyConfig').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const old = JSON.parse(await file.text());
    const oldTeams = old.equipos ?? {};
    const migrated = Object.fromEntries(Object.entries(oldTeams).map(([name, item]) => [name, { ip: item.ip ?? '', port: String(item.puerto ?? '8091'), htmlPort: 80, token: item.token ?? '' }]));
    if (Object.keys(migrated).length) config.teams = migrated;
    config.activeTeam = old.equipo_actual && migrated[old.equipo_actual] ? old.equipo_actual : Object.keys(migrated)[0] ?? config.activeTeam;
    config.webPort = Number(old.portServer) || config.webPort;
    config.password = old.password ?? config.password;
    config.pptProjection = ['/widescreen','/text','/text2','/text3'].includes(old.option) ? old.option : config.pptProjection;
    renderTeamSelect();
    document.querySelector('#webPortInput').value = config.webPort;
    document.querySelector('#passwordInput').value = config.password;
    document.querySelector('#pptProjection').value = config.pptProjection;
    document.querySelector('#pptNextProjection').value = config.pptNextProjection ?? '';
    displayUrl();
    toast('Ajustes anteriores importados. Guarda la configuración para aplicarlos.');
  } catch { toast('No se pudo leer ese config.json.', true); }
  event.target.value = '';
});
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.tab-row .active')?.classList.remove('active'); button.classList.add('active');
  tabs.forEach(tab => { const node = document.querySelector(`#${tab}Tab`); node.hidden = tab !== button.dataset.tab; });
  if (button.dataset.tab === 'access') loadAccess(); if (button.dataset.tab === 'logs') loadLogs();
}));
document.querySelector('#refreshAccess').addEventListener('click', loadAccess);
document.querySelector('#refreshLogs').addEventListener('click', loadLogs);
async function loadLogs() {
  try { const data = await request('/api/desktop/logs'); document.querySelector('#logs').innerHTML = (data.logs ?? []).filter(item => !item.message.includes('GetCurrentPresentation')).map(item => `<div class="log"><span class="muted">${new Date(item.at).toLocaleString()}</span> · ${esc(item.message)} ${item.details ? `· ${esc(item.details)}` : ''}</div>`).join('') || '<div class="empty">No hay eventos.</div>'; }
  catch (error) { toast(error.message, true); }
}
loadConfig().catch(error => toast(error.message, true));
setInterval(() => { if (!document.querySelector('#accessTab').hidden) loadAccess(); }, 2500);
setInterval(() => { if (!document.querySelector('#logsTab').hidden) loadLogs(); }, 1000);
