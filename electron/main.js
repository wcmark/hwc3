import { app, BrowserWindow, Menu, Tray, shell, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.js';
import { createWelcomePreferences, readAboutContent } from './about-settings.js';
import { createStartupPreferences, startupArgument } from './startup-settings.js';
import { configureUserData } from './user-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appIcon = path.join(here, process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png');
let mainWindow;
let tray;
let webServer;
let aboutWindow;
let aboutMode = 'about';
let aboutContent;
let welcomePreferences;
let startupPreferences;
let revealAfterStartup = false;
const migrateUserData = configureUserData(app);
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on('second-instance', (_event, commandLine) => {
  if (commandLine.includes(startupArgument)) return;
  if (webServer) openWindow().catch(error => dialog.showErrorBox('No se pudo abrir la configuración', error.message));
  else revealAfterStartup = true;
});

function requireWindow(event, window) {
  if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('Solicitud no autorizada.');
  }
}

async function openAbout(mode = 'about') {
  await openWindow();
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.show(); aboutWindow.focus(); return;
  }
  aboutMode = mode;
  aboutWindow = new BrowserWindow({
    width: 600, height: 720, minWidth: 440, minHeight: 520,
    title: mode === 'welcome' ? 'Bienvenido · Web Control para Holyrics' : 'Acerca de · Web Control para Holyrics',
    parent: mainWindow, modal: true, show: false, autoHideMenuBar: true,
    icon: appIcon,
    backgroundColor: '#0b1114',
    webPreferences: { preload: path.join(here, 'about-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  aboutWindow.setMenu(null);
  aboutWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  aboutWindow.webContents.on('will-navigate', event => event.preventDefault());
  aboutWindow.webContents.on('will-redirect', event => event.preventDefault());
  aboutWindow.once('ready-to-show', () => { if (aboutWindow && !aboutWindow.isDestroyed()) aboutWindow.show(); });
  aboutWindow.on('closed', () => { aboutWindow = null; });
  await aboutWindow.loadFile(path.join(here, 'about.html'));
}

function openAboutFromMenu() {
  openAbout().catch(error => dialog.showErrorBox('No se pudo abrir Acerca de', error.message));
}

function createMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Aplicación', submenu: [
      { label: 'Configuración', click: openWindow },
      { label: 'Abrir panel web', click: () => shell.openExternal(`http://localhost:${webServer.server.address().port}`) },
      { type: 'separator' },
      { label: 'Salir', click: () => { app.isQuitting = true; app.quit(); } }
    ] },
    { label: 'Editar', submenu: [{ role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' }, { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' }, { role: 'selectAll', label: 'Seleccionar todo' }] },
    { label: 'Ayuda', submenu: [{ label: 'Acerca de', click: openAboutFromMenu }] }
  ]));
}

async function openWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  const port = webServer.server.address().port;
  mainWindow = new BrowserWindow({
    width: 980, height: 760, minWidth: 760, minHeight: 600, show: false,
    title: 'Holyrics Web Control',
    icon: appIcon,
    backgroundColor: '#0b1114',
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('close', event => {
    if (!app.isQuitting) { event.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(`http://127.0.0.1:${port}/desktop`);
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  tray = new Tray(appIcon);
  tray.setToolTip('Holyrics Web Control');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir configuración', click: openWindow },
    { label: 'Abrir panel web', click: () => shell.openExternal(`http://localhost:${webServer.server.address().port}`) },
    { label: 'Acerca de', click: openAboutFromMenu },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', openWindow);
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  app.setAppUserModelId('com.wcmark.holyricswebcontrol');
  await migrateUserData();
  const dataDir = path.join(app.getPath('userData'), 'data');
  startupPreferences = await createStartupPreferences(path.join(app.getPath('userData'), 'startup-preferences.json'));
  welcomePreferences = await createWelcomePreferences(path.join(app.getPath('userData'), 'interface-preferences.json'));
  aboutContent = await readAboutContent(path.join(here, 'about-content.json'));
  webServer = await startServer({ dataDir });
  ipcMain.handle('open-web-panel', event => {
    requireWindow(event, mainWindow);
    return shell.openExternal(`http://localhost:${webServer.server.address().port}`);
  });
  ipcMain.handle('open-about', event => { requireWindow(event, mainWindow); return openAbout(); });
  ipcMain.handle('startup-settings-get', event => { requireWindow(event, mainWindow); return startupPreferences.read(); });
  ipcMain.handle('startup-settings-set', (event, settings) => { requireWindow(event, mainWindow); return startupPreferences.update(settings); });
  ipcMain.handle('about-info', event => {
    requireWindow(event, aboutWindow);
    return { ...aboutContent, version: app.getVersion(), mode: aboutMode, showWelcome: welcomePreferences.showWelcome };
  });
  ipcMain.handle('about-preference', (event, dontShow) => {
    requireWindow(event, aboutWindow);
    return welcomePreferences.setDontShowAgain(dontShow);
  });
  ipcMain.handle('about-open-link', (event, id) => {
    requireWindow(event, aboutWindow);
    const url = id === 'support' ? aboutContent.supportUrl : aboutContent.links.find(link => link.id === id)?.url;
    if (!url) throw new Error('Enlace no disponible.');
    return shell.openExternal(url);
  });
  ipcMain.handle('about-close', event => { requireWindow(event, aboutWindow); aboutWindow.close(); });
  createMenu();
  createTray();
  if (!startupPreferences.startMinimized || revealAfterStartup) {
    await openWindow();
    if (welcomePreferences.showWelcome) await openAbout('welcome');
  }
}).catch(error => { dialog.showErrorBox('No se pudo iniciar Web Control', error.message); app.quit(); });

app.on('before-quit', async () => { app.isQuitting = true; if (webServer) await webServer.close(); });
// Keep the server and tray alive even when no configuration window exists.
app.on('window-all-closed', () => {});
