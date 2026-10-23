import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const allowedActions = new Set([
  'GetCPInfo', 'SetTextCP', 'GetVersion', 'GetCurrentPresentation', 'GetSlideDescriptions',
  'ActionNext', 'ActionPrevious', 'ActionGoToIndex', 'CloseCurrentPresentation',
  'CloseCurrentQuickPresentation', 'GetCurrentQuickPresentation', 'ActionNextQuickPresentation', 'ActionPreviousQuickPresentation', 'GetBibleSettings', 'SetBibleSettings',
  'ToggleF8', 'ToggleF9', 'ToggleF10', 'GetF8', 'GetF9', 'GetF10',
  'GetMediaPlaylist', 'MediaPlaylistAction', 'GetMediaPlayerInfo', 'MediaPlayerAction',
  'GetLyricsPlaylist', 'AddLyricsToPlaylist', 'SearchLyrics', 'GetLyrics', 'ShowLyrics',
  'CreateItem', 'EditItem', 'EditSong', 'GetThemes', 'GetBackgrounds', 'GetCurrentTheme',
  'SetCurrentBackground', 'GetAudios', 'GetVideos', 'GetImages', 'GetFiles', 'GetTexts', 'ShowText',
  'GetThumbnail', 'PlayAudio', 'PlayVideo', 'ShowImage', 'ExecuteFile', 'ShowVerse',
  'GetBibleVersions', 'GetBibleVersionsV2', 'GetSchedules', 'GetCurrentSchedule', 'SetCurrentSchedule', 'GetSavedPlaylists',
  'LoadSavedPlaylist', 'ShowAnnouncement', 'GetAnnouncements', 'GetAnnouncement'
]);

const defaultConfig = {
  teams: { Holyrics: { ip: '127.0.0.1', port: '8091', htmlPort: 80, token: '' } },
  activeTeam: 'Holyrics',
  webPort: 5000,
  password: '',
  pptProjection: '/text3',
  pptNextProjection: '',
  pptEnabled: true,
  bindLan: true
};

const cleanIp = (value = '') => value.replace(/^::ffff:/, '').replace(/^\[|\]$/g, '');
const isLoopback = (ip = '') => ['127.0.0.1', '::1', 'localhost'].includes(cleanIp(ip));
const safeName = value => String(value ?? '').trim().replace(/[<>]/g, '').slice(0, 48);
const pageOptions = [
  { path: '/', name: 'Inicio' }, { path: '/ppt', name: 'Presentación' },
  { path: '/playlists', name: 'Playlists' }, { path: '/letras', name: 'Letras' },
  { path: '/medios', name: 'Medios' }, { path: '/biblia', name: 'Biblia' }, { path: '/chat', name: 'Chat' }
];
const pagePaths = pageOptions.map(page => page.path);
const presentationActions = ['GetCurrentPresentation', 'GetSlideDescriptions', 'GetLyrics',
  'ActionNext', 'ActionPrevious', 'ActionGoToIndex', 'CloseCurrentPresentation',
  'ToggleF8', 'ToggleF9', 'ToggleF10', 'GetF8', 'GetF9', 'GetF10',
  'ShowVerse', 'GetCurrentQuickPresentation', 'CloseCurrentQuickPresentation',
  'ActionNextQuickPresentation', 'ActionPreviousQuickPresentation'];
const themeActions = ['GetThemes', 'GetBackgrounds', 'GetCurrentTheme', 'GetThumbnail', 'SetCurrentBackground'];
const actionsByPage = {
  '/': ['GetCurrentPresentation'],
  '/ppt': ['GetCurrentPresentation', 'ActionNext', 'ActionPrevious'],
  '/playlists': [...presentationActions, ...themeActions, 'GetMediaPlaylist', 'MediaPlaylistAction',
    'GetSchedules', 'GetCurrentSchedule', 'SetCurrentSchedule', 'GetSavedPlaylists', 'LoadSavedPlaylist', 'GetLyricsPlaylist'],
  '/letras': [...presentationActions, ...themeActions, 'SearchLyrics', 'ShowLyrics', 'AddLyricsToPlaylist', 'EditSong', 'CreateItem', 'EditItem'],
  '/medios': ['GetMediaPlayerInfo', 'MediaPlayerAction', 'GetAudios', 'GetVideos', 'GetImages', 'GetFiles',
    'GetTexts', 'ShowText', 'GetThumbnail', 'PlayAudio', 'PlayVideo', 'ShowImage', 'ExecuteFile',
    'GetCPInfo', 'SetTextCP', 'GetAnnouncements', 'GetAnnouncement', 'ShowAnnouncement'],
  '/biblia': ['GetCurrentPresentation', 'GetCurrentQuickPresentation', 'ShowVerse', 'CloseCurrentPresentation',
    'CloseCurrentQuickPresentation', 'GetBibleSettings', 'SetBibleSettings', 'GetBibleVersions', 'GetBibleVersionsV2', ...themeActions],
  '/chat': []
};
const normalizePages = pages => pagePaths.filter(page => pages.includes(page));
const validPort = value => /^\d{1,5}$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 65535;
const projectionRoutes = { '/widescreen': 'widescreen', '/text': 'text', '/text2': 'text2', '/text3': 'text3' };
const holyricsWebUrl = (team, pathname) => {
  if (!team?.ip) return '';
  try {
    const address = String(team.ip).trim();
    const url = new URL(/^https?:\/\//i.test(address) ? address : `http://${address}`);
    url.protocol = 'http:';
    url.port = String(validPort(team.htmlPort) ? team.htmlPort : 80);
    url.username = ''; url.password = ''; url.search = ''; url.hash = ''; url.pathname = pathname;
    return url.href;
  } catch { return ''; }
};
const projectionUrl = (team, projection) => {
  const route = projectionRoutes[projection];
  return route ? holyricsWebUrl(team, `/view/${route}`) : '';
};

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export async function startServer({ dataDir = path.join(here, 'data'), onLog = () => {} } = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  const configPath = path.join(dataDir, 'config.json');
  const trustedPath = path.join(dataDir, 'trusted-devices.json');
  const secretPath = path.join(dataDir, 'server-secret');
  let config = { ...defaultConfig, ...(await readJson(configPath, {})) };
  delete config.mediaFolder;
  config.teams = { ...defaultConfig.teams, ...(config.teams ?? {}) };
  for (const team of Object.values(config.teams)) team.htmlPort = validPort(team.htmlPort) ? Number(team.htmlPort) : 80;
  if (!config.teams[config.activeTeam]) config.activeTeam = Object.keys(config.teams)[0] ?? 'Holyrics';
  let trusted = await readJson(trustedPath, {});
  let trustedSave = Promise.resolve();
  function persistTrusted() {
    const snapshot = JSON.stringify(trusted, null, 2);
    trustedSave = trustedSave.catch(() => {}).then(() => fs.writeFile(trustedPath, snapshot, 'utf8'));
    return trustedSave;
  }
  let secret;
  try { secret = await fs.readFile(secretPath, 'utf8'); }
  catch { secret = crypto.randomBytes(48).toString('hex'); await fs.writeFile(secretPath, secret, { mode: 0o600 }); }

  const app = express();
  const pending = new Map();
  const logs = [];
  const log = (message, details = '') => {
    const entry = { at: new Date().toISOString(), message, details };
    logs.unshift(entry); logs.length = Math.min(logs.length, 250); onLog(entry);
  };
  app.disable('x-powered-by');
  app.enable('case sensitive routing');
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  function issueDeviceCookie(res, deviceId) {
    const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const payload = `${deviceId}.${expires}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    res.cookie('hly_device', `${payload}.${signature}`, {
      httpOnly: true, sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/', secure: false
    });
  }

  function authorizedDevice(req) {
    const token = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('hly_device='))?.slice(11);
    if (!token) return null;
    let parts;
    try { parts = decodeURIComponent(token).split('.'); } catch { return null; }
    if (parts.length !== 3) return null;
    const [deviceId, expiresText, signature] = parts;
    const payload = `${deviceId}.${expiresText}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (!Number.isFinite(Number(expiresText)) || Number(expiresText) < Date.now() || !/^[a-f0-9]{64}$/.test(signature)) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    return Object.hasOwn(trusted, deviceId) ? deviceId : null;
  }

  function devicePages(device) {
    // Devices approved before page permissions existed retain their previous access.
    if (device?.pages === undefined) return [...pagePaths];
    return Array.isArray(device.pages) ? normalizePages(device.pages) : [];
  }
  function requestPages(req) {
    if (isLoopback(req.ip)) return [...pagePaths];
    const id = authorizedDevice(req);
    return id ? devicePages(trusted[id]) : [];
  }
  function landingPath(pages) { return pages.find(page => page !== '/ppt' || config.pptEnabled) ?? null; }
  function accessInfo(device) {
    const pages = devicePages(device);
    return { authorized: true, name: device.name, pages, landingPath: landingPath(pages) };
  }
  function browserTeam(req) {
    const team = config.teams[config.activeTeam] ?? {};
    // On a phone, localhost refers to the phone rather than the Holyrics PC.
    if (isLoopback(String(team.ip ?? '').trim()) && !isLoopback(req.ip)) return { ...team, ip: req.hostname };
    return team;
  }

  const localOnly = (req, res, next) => isLoopback(req.ip) ? next() : res.status(403).json({ error: 'Esta acción solo se permite desde la aplicación local de Windows.' });
  const openPaths = new Set(['/access', '/api/access/request', '/api/access/status', '/api/access/check', '/api/desktop/ping']);
  app.use((req, res, next) => {
    if (req.path.startsWith('/public/') || req.path === '/favicon.ico' || openPaths.has(req.path)) return next();
    if (isLoopback(req.ip) || authorizedDevice(req)) return next();
    if (req.path.startsWith('/api/desktop/')) return localOnly(req, res, next);
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Este dispositivo todavía no tiene acceso.', code: 'DEVICE_UNAUTHORIZED' });
    return res.redirect('/access');
  });

  // HTML is served only through the permission-checked page routes below.
  app.use('/public', (req, res, next) => {
    let pathname;
    try { pathname = decodeURIComponent(req.path); } catch { return res.sendStatus(400); }
    if (!/\.(?:css|js|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf)$/i.test(pathname)) return res.sendStatus(403);
    next();
  }, express.static(path.join(here, 'public'), {
    index: false,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (/\.(js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  const pages = {
    '/': 'index.html', '/ppt': 'ppt.html', '/biblia': 'bible.html',
    '/letras': 'lyrics.html', '/playlists': 'playlists.html', '/medios': 'media.html',
    '/access': 'access.html', '/desktop': 'desktop.html'
  };
  function requirePage(req, res, route) {
    const permitted = requestPages(req);
    res.setHeader('Cache-Control', 'no-store');
    if (permitted.includes(route)) return true;
    const destination = landingPath(permitted);
    if (route === '/' && destination) res.redirect(destination);
    else res.status(403).type('html').send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acceso restringido</title><link rel="stylesheet" href="/public/css/app.css"><main class="shell"><section class="panel"><h1>Acceso restringido</h1><p>Este dispositivo no tiene permiso para entrar a esta página. Podés solicitar el cambio desde la aplicación de Windows.</p>${destination ? `<a class="btn" href="${destination}">Ir a una página permitida</a>` : ''}</section></main></html>`);
    return false;
  }
  app.get('/temas', (_req, res) => res.redirect('/letras'));
  for (const [route, filename] of Object.entries(pages)) app.get(route, (req, res, next) => {
    if (route === '/desktop') return localOnly(req, res, () => res.sendFile(path.join(here, 'public', filename)));
    if (route !== '/access' && !requirePage(req, res, route)) return;
    if (route === '/ppt' && !config.pptEnabled) return res.status(404).send('La página /ppt está deshabilitada desde los ajustes de escritorio.');
    res.sendFile(path.join(here, 'public', filename));
  });
  app.get('/chat', (req, res) => {
    if (!requirePage(req, res, '/chat')) return;
    const url = holyricsWebUrl(browserTeam(req), '/chat');
    if (!url) return res.status(503).send('Configura la IP y el puerto HTML de Holyrics desde el escritorio.');
    res.redirect(url);
  });

  app.get('/api/access/check', (req, res) => {
    const deviceId = String(req.query.deviceId ?? '').slice(0, 100);
    if (!/^[a-zA-Z0-9-]{12,100}$/.test(deviceId) || !Object.hasOwn(trusted, deviceId)) return res.json({ authorized: false });
    issueDeviceCookie(res, deviceId);
    res.setHeader('Cache-Control', 'no-store');
    res.json(accessInfo(trusted[deviceId]));
  });
  app.post('/api/access/request', async (req, res) => {
    const deviceId = String(req.body.deviceId ?? '').slice(0, 100);
    const name = safeName(req.body.name);
    if (!/^[a-zA-Z0-9-]{12,100}$/.test(deviceId) || name.length < 2) return res.status(400).json({ error: 'Escribe un nombre válido para el dispositivo.' });
    if (config.password && String(req.body.password ?? '') !== config.password) return res.status(401).json({ error: 'La contraseña adicional no es correcta.' });
    if (Object.hasOwn(trusted, deviceId)) { issueDeviceCookie(res, deviceId); return res.json(accessInfo(trusted[deviceId])); }
    const existing = [...pending.values()].find(item => item.deviceId === deviceId && item.status === 'pending');
    if (existing) return res.json({ requestId: existing.id, status: existing.status });
    const requestItem = { id: crypto.randomBytes(24).toString('hex'), deviceId, name, ip: cleanIp(req.ip), createdAt: Date.now(), status: 'pending' };
    pending.set(requestItem.id, requestItem);
    log(`Solicitud de acceso: ${name}`, requestItem.ip);
    res.json({ requestId: requestItem.id, status: 'pending' });
  });
  app.get('/api/access/status', (req, res) => {
    const item = pending.get(String(req.query.requestId ?? ''));
    if (!item || Date.now() - item.createdAt > 10 * 60 * 1000) return res.status(404).json({ status: 'expired' });
    res.setHeader('Cache-Control', 'no-store');
    if (item.status === 'approved') {
      if (!trusted[item.deviceId]) return res.json({ status: 'rejected' });
      issueDeviceCookie(res, item.deviceId);
      return res.json({ status: item.status, ...accessInfo(trusted[item.deviceId]) });
    }
    res.json({ status: item.status, name: item.name });
  });

  app.get('/api/desktop/ping', localOnly, (_req, res) => res.json({ ok: true, port: Number(config.webPort) }));
  app.get('/api/desktop/config', localOnly, (_req, res) => {
    const lanIps = [...new Set(Object.values(os.networkInterfaces()).flat()
      .filter(item => item && item.family === 'IPv4' && !item.internal)
      .map(item => item.address))];
    const rankIp = ip => {
      const octets = ip.split('.').map(Number);
      if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return 5;
      if (octets[0] === 192 && octets[1] === 168) return 0;
      if (octets[0] === 10) return 1;
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return 2;
      if (octets[0] === 169 && octets[1] === 254) return 4;
      return 3;
    };
    lanIps.sort((a, b) => rankIp(a) - rankIp(b));
    res.json({ ...config, lanIps, preferredLanIp: lanIps[0] ?? '' });
  });
  app.put('/api/desktop/config', localOnly, async (req, res) => {
    const body = req.body ?? {};
    const teams = {};
    for (const [rawName, value] of Object.entries(body.teams ?? {})) {
      const name = safeName(rawName);
      const ip = String(value.ip ?? '').trim();
      const port = String(value.port ?? '8091').trim();
      const token = String(value.token ?? '').trim();
      const htmlPort = value.htmlPort ?? config.teams[name]?.htmlPort ?? 80;
      if (!validPort(htmlPort)) return res.status(400).json({ error: `El puerto HTML de ${name} debe estar entre 1 y 65535.` });
      if (name && ip && validPort(port)) teams[name] = { ip, port, htmlPort: Number(htmlPort), token };
    }
    config = {
      ...config,
      teams: Object.keys(teams).length ? teams : config.teams,
      activeTeam: teams[body.activeTeam] ? body.activeTeam : Object.keys(teams)[0] ?? config.activeTeam,
      webPort: Math.max(1024, Math.min(65535, Number(body.webPort) || 5000)),
      password: String(body.password ?? ''),
      pptProjection: ['/widescreen', '/text', '/text2', '/text3'].includes(body.pptProjection) ? body.pptProjection : '/text3',
      pptNextProjection: ['', '/widescreen', '/text', '/text2', '/text3'].includes(body.pptNextProjection) ? body.pptNextProjection : '',
      pptEnabled: body.pptEnabled !== false,
      bindLan: body.bindLan !== false
    };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    log('Configuración actualizada desde el escritorio');
    res.json({ ok: true, config });
  });
  app.get('/api/desktop/access-requests', localOnly, (_req, res) => res.json({
    pageOptions, pending: [...pending.values()].filter(item => item.status === 'pending'),
    trusted: Object.entries(trusted).map(([id, item]) => ({ id, ...item, pages: devicePages(item) }))
  }));
  app.post('/api/desktop/access-requests/:id/:decision', localOnly, async (req, res) => {
    const item = pending.get(req.params.id);
    if (!item || item.status !== 'pending') return res.status(404).json({ error: 'La solicitud ya no está pendiente.' });
    if (req.params.decision === 'accept') {
      if (req.body.pages !== undefined && !Array.isArray(req.body.pages)) return res.status(400).json({ error: 'Selecciona las páginas permitidas.' });
      item.status = 'approved';
      trusted[item.deviceId] = { name: item.name, ip: item.ip, approvedAt: new Date().toISOString(), pages: req.body.pages === undefined ? [...pagePaths] : normalizePages(req.body.pages) };
      await persistTrusted();
      log(`Acceso aceptado: ${item.name}`, item.ip);
    } else {
      item.status = 'rejected'; log(`Acceso rechazado: ${item.name}`, item.ip);
    }
    res.json({ ok: true });
  });
  app.put('/api/desktop/devices/:id/permissions', localOnly, async (req, res) => {
    const device = trusted[req.params.id];
    if (!device) return res.status(404).json({ error: 'Este dispositivo ya no está aprobado.' });
    if (!Array.isArray(req.body.pages) || req.body.pages.some(page => !pagePaths.includes(page))) {
      return res.status(400).json({ error: 'Selecciona páginas válidas.' });
    }
    device.pages = normalizePages(req.body.pages);
    await persistTrusted();
    log(`Permisos actualizados: ${device.name}`, device.pages.join(', ') || 'Sin páginas permitidas');
    res.json({ ok: true, pages: device.pages });
  });
  app.delete('/api/desktop/devices/:id', localOnly, async (req, res) => {
    delete trusted[req.params.id];
    await persistTrusted();
    log('Acceso de dispositivo revocado', req.params.id);
    res.json({ ok: true });
  });
  app.get('/api/desktop/logs', localOnly, (_req, res) => res.json({ logs }));
  app.post('/api/desktop/test-connection', localOnly, async (_req, res) => {
    const team = config.teams[config.activeTeam];
    if (!team?.ip || !team?.token) return res.status(400).json({ error: 'Completa IP y token de Holyrics primero.' });
    try {
      const response = await fetch(`http://${team.ip}:${team.port}/api/GetVersion?token=${encodeURIComponent(team.token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(3500) });
      const data = await response.json();
      if (!response.ok || data.status !== 'ok') throw new Error(data.error ?? `HTTP ${response.status}`);
      res.json({ ok: true, version: data.data?.version ?? data.data ?? 'Conectado' });
    } catch (error) { res.status(502).json({ error: `No se pudo conectar con Holyrics: ${error.message}` }); }
  });

  app.get('/api/app-info', (req, res) => {
    const team = browserTeam(req);
    const permitted = requestPages(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      connected: Boolean(team.ip && team.token), activeTeam: config.activeTeam,
      allowedPages: permitted, landingPath: landingPath(permitted),
      pptProjection: config.pptProjection, pptNextProjection: config.pptNextProjection,
      pptEnabled: config.pptEnabled,
      holyricsStageUrl: permitted.includes('/ppt') ? projectionUrl(team, config.pptProjection) : '',
      holyricsNextStageUrl: permitted.includes('/ppt') ? projectionUrl(team, config.pptNextProjection) : ''
    });
  });
  app.post('/api/holyrics/:action', async (req, res) => {
    const { action } = req.params;
    if (!allowedActions.has(action)) return res.status(404).json({ error: 'Acción de Holyrics no habilitada.' });
    if (!isLoopback(req.ip)) {
      const permitted = requestPages(req);
      if (!permitted.some(page => actionsByPage[page]?.includes(action))) {
        return res.status(403).json({ error: 'Este dispositivo no tiene permiso para realizar esta acción.', code: 'PAGE_FORBIDDEN' });
      }
      if (action === 'GetCurrentPresentation' && !permitted.some(page => ['/playlists', '/letras', '/biblia'].includes(page))) {
        req.body = { include_slides: false, include_slide_preview: false, include_slide_comment: false };
      }
    }
    if (action === 'GetVersion' || action === 'CreateItem' || action === 'EditItem') {
      // Create/Edit stay available only when explicitly enabled in Holyrics; version is a read-only connection check.
    }
    const team = config.teams[config.activeTeam];
    if (!team?.ip || !team?.port || !team?.token) return res.status(503).json({ error: 'Configura la conexión con Holyrics desde el escritorio.' });
    try {
      const response = await fetch(`http://${team.ip}:${team.port}/api/${action}?token=${encodeURIComponent(team.token)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req.body ?? {}), signal: AbortSignal.timeout(8000)
      });
      const text = await response.text();
      const deviceId = authorizedDevice(req);
      const deviceName = deviceId ? trusted[deviceId]?.name : null;
      const actor = deviceName || (isLoopback(req.ip) ? 'Equipo local' : 'Dispositivo autorizado');
      if (!['GetCurrentPresentation', 'GetCurrentTheme'].includes(action)) log(`Acción ${action} solicitada por ${actor}`, `${cleanIp(req.ip)} · HTTP ${response.status}`);
      res.status(response.status).type(response.headers.get('content-type') ?? 'application/json').send(text);
    } catch (error) {
      log(`Error al consultar Holyrics (${action})`, error.message);
      res.status(502).json({ error: `No se pudo comunicar con Holyrics: ${error.message}` });
    }
  });

  app.get('/health', (_req, res) => res.json({ ok: true, host: os.hostname() }));
  const host = config.bindLan ? '0.0.0.0' : '127.0.0.1';
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(Number(config.webPort) || 5000, host, () => resolve(instance));
    instance.once('error', reject);
  });
  log(`Servidor web iniciado en ${host}:${server.address().port}`);
  return { app, server, getConfig: () => config, close: () => new Promise(resolve => server.close(resolve)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(({ server }) => console.log(`Holyrics Web Control en http://localhost:${server.address().port}`)).catch(error => { console.error(error); process.exitCode = 1; });
}
