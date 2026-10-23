import { toast } from './core.js';

const bridge = window.holyricsDesktop;
const form = document.querySelector('#startupForm');
const windows = document.querySelector('#startWithWindows');
const minimized = document.querySelector('#startMinimized');
const save = document.querySelector('#saveStartup');
const hint = document.querySelector('#startupHint');
const result = document.querySelector('#startupResult');
let settings;

function render(value) {
  settings = value;
  windows.checked = value.startWithWindows;
  minimized.checked = value.startMinimized;
  windows.disabled = !value.canStartWithWindows;
  minimized.disabled = false;
  save.disabled = false;
  hint.textContent = !value.canStartWithWindows
    ? 'Podés configurar el inicio minimizado ahora. El inicio con Windows estará disponible en el ejecutable instalado o portable.'
    : value.portable
      ? 'Guardá el portable en una ubicación fija antes de activar el inicio con Windows. Al iniciar minimizado, el servidor funciona y la ventana se abre desde el icono de la bandeja.'
      : 'El inicio con Windows se aplica a tu usuario. Al iniciar minimizado, el servidor funciona y la ventana se abre desde el icono de la bandeja.';
}
if (bridge?.getStartupSettings && bridge?.setStartupSettings) {
  bridge.getStartupSettings().then(render).catch(error => { result.textContent = error.message; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!settings || save.disabled) return;
    const next = { startWithWindows: windows.checked, startMinimized: minimized.checked };
    windows.disabled = true; minimized.disabled = true; save.disabled = true;
    result.textContent = 'Guardando…';
    try {
      render(await bridge.setStartupSettings(next));
      result.textContent = 'Guardado. El inicio minimizado se aplicará la próxima vez que abras la app.';
      toast('Opciones de inicio guardadas');
    } catch (error) {
      result.textContent = error.message;
      try { render(await bridge.getStartupSettings()); } catch { render(settings); }
      toast(error.message, true);
    }
  });
}
