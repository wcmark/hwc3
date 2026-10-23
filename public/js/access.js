import './back-to-top.js';

const form = document.querySelector('#accessForm');
const state = document.querySelector('#requestState');
const message = document.querySelector('#accessError');
const button = document.querySelector('#requestButton');
let requestId = '';
let timer;
function enterPanel(result) {
  if (result.landingPath) { window.location.replace(result.landingPath); return; }
  form.hidden = true;
  state.hidden = false;
  state.textContent = 'Tu dispositivo está aprobado, pero no tiene páginas habilitadas. Pedí que te asignen permisos desde Dispositivos confiables en Windows.';
}
let deviceId = localStorage.getItem('hly-device-id');
if (!deviceId) {
  const bytes = new Uint8Array(24);
  if (crypto.getRandomValues) crypto.getRandomValues(bytes); else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  deviceId = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('hly-device-id', deviceId);
}

async function checkExisting() {
  try {
    const result = await fetch(`/api/access/check?deviceId=${encodeURIComponent(deviceId)}`).then(r => r.json());
    if (result.authorized) enterPanel(result);
  } catch {}
}

form.addEventListener('submit', async event => {
  event.preventDefault(); button.disabled = true; message.textContent = '';
  const name = document.querySelector('#deviceName').value.trim();
  try {
    const password = document.querySelector('#extraPassword').value;
    const response = await fetch('/api/access/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId, name, password }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'No se pudo enviar la solicitud.');
    if (result.authorized) return enterPanel(result);
    requestId = result.requestId;
    state.hidden = false; state.textContent = 'Solicitud enviada. Espera la aprobación en la aplicación de Windows. Esta página se actualizará automáticamente.';
    timer = setInterval(poll, 1800);
  } catch (error) { message.textContent = error.message; button.disabled = false; }
});

async function poll() {
  if (!requestId) return;
  try {
    const response = await fetch(`/api/access/status?requestId=${encodeURIComponent(requestId)}`);
    const result = await response.json();
    if (result.status === 'approved') { clearInterval(timer); state.textContent = 'Acceso aprobado. Abriendo el panel…'; setTimeout(() => enterPanel(result), 450); }
    else if (result.status === 'rejected') { clearInterval(timer); state.textContent = 'La solicitud fue rechazada. Puedes volver a solicitar acceso desde Windows.'; button.disabled = false; }
    else if (result.status === 'expired') { clearInterval(timer); state.textContent = 'La solicitud expiró. Envía una nueva solicitud.'; button.disabled = false; }
  } catch {}
}
checkExisting();
