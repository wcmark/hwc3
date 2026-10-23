import { esc, toast } from './core.js';

const pendingNode = document.querySelector('#pendingRequests');
const trustedNode = document.querySelector('#trustedDevices');
const drafts = new Map();
const signatures = new Map();
let pageOptions = [], requestNumber = 0;

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json' } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Error HTTP ${response.status}`);
  return data;
}
function selectedPages(form) {
  return [...form.querySelectorAll('input[name="page"]:checked')].map(input => input.value);
}
function permissions(key, pages) {
  const chosen = drafts.get(key) ?? pages;
  return `<fieldset class="device-permissions"><legend>Páginas permitidas</legend><div class="device-page-options">${pageOptions.map(page => `<label><input type="checkbox" name="page" value="${esc(page.path)}"${chosen.includes(page.path) ? ' checked' : ''}><span>${esc(page.name)}</span></label>`).join('')}</div><div class="row"><button type="button" class="btn secondary" data-preset="presenter" title="Permitir únicamente la página Presentación">Solo Presentación</button><button type="button" class="btn secondary" data-preset="all">Todas</button><button type="button" class="btn secondary" data-preset="none">Ninguna</button></div></fieldset>`;
}
function render(node, items, kind) {
  const signature = JSON.stringify([items, pageOptions]);
  // Polling must not discard edits or replace the control currently in use.
  if (signatures.get(kind) === signature || node.contains(document.activeElement)) return;
  signatures.set(kind, signature);
  node.innerHTML = items.length ? items.map(item => {
    const key = `${kind}:${item.id}`;
    const date = kind === 'pending' ? new Date(item.createdAt).toLocaleString() : `aprobado ${new Date(item.approvedAt).toLocaleDateString()}`;
    return `<form class="device-permission-card" data-device-id="${esc(item.id)}" data-kind="${kind}" data-key="${esc(key)}"><div><strong>${esc(item.name)}</strong><div class="muted tiny">${esc(item.ip ?? '')} · ${esc(date)}</div></div>${permissions(key, item.pages ?? pageOptions.map(page => page.path))}<div class="row"><button type="submit" class="btn primary">${kind === 'pending' ? 'Aceptar con estos permisos' : 'Guardar permisos'}</button><button type="button" class="btn danger" data-remove>${kind === 'pending' ? 'Rechazar' : 'Revocar'}</button><span class="permission-status muted tiny" role="status">${drafts.has(key) ? 'Cambios sin guardar' : ''}</span></div></form>`;
  }).join('') : `<div class="empty">${kind === 'pending' ? 'No hay solicitudes pendientes.' : 'Todavía no hay dispositivos aprobados.'}</div>`;
}
export async function loadAccess() {
  const currentRequest = ++requestNumber;
  try {
    const data = await request('/api/desktop/access-requests');
    if (currentRequest !== requestNumber) return;
    pageOptions = data.pageOptions ?? [];
    document.querySelector('#pendingCount').textContent = String(data.pending?.length ?? 0);
    render(pendingNode, data.pending ?? [], 'pending');
    render(trustedNode, data.trusted ?? [], 'trusted');
  } catch (error) { toast(error.message, true); }
}
function markDraft(form) {
  drafts.set(form.dataset.key, selectedPages(form));
  form.querySelector('.permission-status').textContent = 'Cambios sin guardar';
}
async function mutate(form, remove = false) {
  const { deviceId, kind, key } = form.dataset;
  const id = encodeURIComponent(deviceId), pending = kind === 'pending';
  if (remove && !pending && !confirm('¿Revocar el acceso de este dispositivo?')) return;
  const pages = selectedPages(form);
  const controls = [...form.querySelectorAll('button,input')];
  if (controls.some(control => control.disabled)) return;
  controls.forEach(control => { control.disabled = true; });
  try {
    const url = pending ? `/api/desktop/access-requests/${id}/${remove ? 'reject' : 'accept'}`
      : `/api/desktop/devices/${id}${remove ? '' : '/permissions'}`;
    await request(url, { method: pending ? 'POST' : remove ? 'DELETE' : 'PUT', body: JSON.stringify({ pages }) });
    drafts.delete(key);
    signatures.delete(kind);
    if (form.contains(document.activeElement)) document.activeElement.blur();
    toast(remove ? pending ? 'Solicitud rechazada' : 'Acceso revocado' : pending ? 'Dispositivo autorizado' : 'Permisos guardados');
    await loadAccess();
  } catch (error) { toast(error.message, true); }
  finally { controls.forEach(control => { control.disabled = false; }); }
}
for (const node of [pendingNode, trustedNode]) {
  node.addEventListener('change', event => {
    const form = event.target.closest('form');
    if (form) markDraft(form);
  });
  node.addEventListener('submit', event => { event.preventDefault(); mutate(event.target); });
  node.addEventListener('click', event => {
    const button = event.target.closest('button'), form = button?.closest('form');
    if (!form) return;
    if (button.hasAttribute('data-remove')) mutate(form, true);
    if (button.dataset.preset) {
      form.querySelectorAll('input[name="page"]').forEach(input => {
        input.checked = button.dataset.preset === 'all' || (button.dataset.preset === 'presenter' && input.value === '/ppt');
      });
      markDraft(form);
    }
  });
}
