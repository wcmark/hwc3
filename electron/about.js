const api = window.holyricsAbout;
const checkbox = document.querySelector('#dontShow');
const errorNode = document.querySelector('#error');
function showError(message = '') { errorNode.textContent = message; errorNode.hidden = !message; }
async function openLink(id) {
  try { await api.openLink(id); showError(); }
  catch { showError('No se pudo abrir el enlace en el navegador.'); }
}
async function load() {
  if (!api) { showError('Abrí esta ventana desde el menú Acerca de de la aplicación de Windows.'); return; }
  try {
    const info = await api.getInfo();
    for (const field of ['heading','appName','description','contactHeading','location','supportMessage']) document.querySelector(`#${field}`).textContent = info[field];
    document.querySelector('#version').textContent = `Versión ${info.version}`;
    document.querySelector('#mode').textContent = info.mode === 'welcome' ? 'Bienvenido' : 'Acerca de';
    document.querySelector('#continueButton').textContent = info.mode === 'welcome' ? 'Continuar' : 'Cerrar';
    document.querySelector('#links').replaceChildren(...info.links.map(link => {
      const node = document.createElement('a');
      node.className = 'contact-link'; node.href = link.url;
      const label = document.createElement('span'); label.textContent = link.label;
      node.append(label, document.createTextNode(link.text));
      node.addEventListener('click', event => { event.preventDefault(); openLink(link.id); });
      return node;
    }));
    checkbox.checked = !info.showWelcome;
    checkbox.disabled = false;
    document.querySelector('#supportButton').disabled = !info.supportUrl;
    const supportPending = document.querySelector('#supportPending');
    if (supportPending) supportPending.hidden = Boolean(info.supportUrl);
  } catch { showError('No se pudo cargar la información de la aplicación.'); }
}
checkbox.addEventListener('change', async () => {
  const desired = checkbox.checked;
  checkbox.disabled = true;
  try { await api.setDontShowAgain(desired); showError(); }
  catch { checkbox.checked = !desired; showError('No se pudo guardar esta preferencia. Volvé a intentarlo.'); }
  finally { checkbox.disabled = false; }
});
document.querySelector('#supportButton').addEventListener('click', () => openLink('support'));
document.querySelector('#continueButton').addEventListener('click', () => api?.close());
document.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); api?.close(); } });
load();
