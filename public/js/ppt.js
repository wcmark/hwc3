import { holyrics } from './core.js';

const status = document.querySelector('#connectionState');
const counter = document.querySelector('#slideCounter');
const buttons = [...document.querySelectorAll('.ppt-controls button')];
let counterTimer;
let refreshingCounter = false;
let sendingAction = false;
let stopped = false;

function showStatus(message = '') {
  status.textContent = message;
  status.hidden = !message;
}

function configureStream(frame, url) {
  if (url) {
    if (frame.src !== url) frame.src = url;
  } else {
    frame.removeAttribute('src');
  }
  frame.hidden = !url;
}

async function loadSettings() {
  const response = await fetch('/api/app-info');
  const info = await response.json();
  if (!response.ok) throw new Error(info.error ?? `Error HTTP ${response.status}`);

  configureStream(document.querySelector('#currentStream'), info.holyricsStageUrl);
  document.querySelector('#currentEmpty').hidden = Boolean(info.holyricsStageUrl);

  const nextUrl = info.pptNextProjection ? info.holyricsNextStageUrl : '';
  configureStream(document.querySelector('#nextStream'), nextUrl);
  document.querySelector('#nextPanel').hidden = !nextUrl;
  document.querySelector('#streamGrid').classList.toggle('has-next', Boolean(nextUrl));
  showStatus(info.connected ? '' : 'Configurá la conexión con Holyrics en la aplicación de escritorio.');
}

async function refreshCounter() {
  clearTimeout(counterTimer);
  if (refreshingCounter || document.hidden || stopped) return;
  refreshingCounter = true;
  let delay = 1000;
  try {
    const { data } = await holyrics('GetCurrentPresentation', { include_slides: false });
    const current = data?.slide_number;
    const total = data?.total_slides;
    // Holyrics numbers slides from 1. Older versions/media may omit the count.
    const available = Number.isInteger(current) && Number.isInteger(total)
      && current >= 1 && total >= current;
    counter.textContent = available ? `${current} de ${total}` : '';
  } catch {
    counter.textContent = '';
    delay = 5000;
  } finally {
    refreshingCounter = false;
    if (!document.hidden && !stopped) counterTimer = setTimeout(refreshCounter, delay);
  }
}

async function sendAction(action, button) {
  if (sendingAction) return;
  sendingAction = true;
  buttons.forEach(item => { item.disabled = true; });
  showStatus();
  try {
    await holyrics(action);
    void refreshCounter();
  } catch (error) {
    showStatus(error.message);
  } finally {
    sendingAction = false;
    buttons.forEach(item => { item.disabled = false; });
    button.focus({ preventScroll: true });
  }
}

document.querySelector('#previousSlide').addEventListener('click', event => sendAction('ActionPrevious', event.currentTarget));
document.querySelector('#nextSlide').addEventListener('click', event => sendAction('ActionNext', event.currentTarget));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(counterTimer);
  else void refreshCounter();
});
window.addEventListener('pagehide', () => { stopped = true; clearTimeout(counterTimer); });
window.addEventListener('pageshow', () => { stopped = false; void refreshCounter(); });
loadSettings().catch(error => showStatus(error.message));
void refreshCounter();
