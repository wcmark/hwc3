import { holyrics, initShell, toast } from './core.js';
initShell('/');
async function refresh() {
  const name = document.querySelector('#currentName'), meta = document.querySelector('#currentMeta');
  try {
    const result = await holyrics('GetCurrentPresentation', { include_slides: false });
    const data = result.data;
    if (!data) { name.textContent = 'No hay una presentación activa'; meta.textContent = 'El control estará disponible cuando inicies una presentación en Holyrics.'; return; }
    name.textContent = data.name || `Presentación ${data.type ?? ''}`;
    meta.textContent = `${data.type ?? 'presentación'} · diapositiva ${data.slide_number ?? '—'} de ${data.total_slides ?? '—'}`;
  } catch (error) { name.textContent = 'Holyrics no está disponible'; meta.textContent = error.message; }
}
refresh(); setInterval(refresh, 2500);
