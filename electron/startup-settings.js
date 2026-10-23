import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const loginName = 'com.wcmark.holyricswebcontrol';
export const startupArgument = '--windows-startup';

export async function createStartupPreferences(file) {
  let startMinimized = false;
  try { startMinimized = JSON.parse(await fs.readFile(file, 'utf8')).startMinimized === true; }
  catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  const canStartWithWindows = process.platform === 'win32' && app.isPackaged;
  // A portable build extracts Electron into a temporary folder. Register its launcher instead.
  const executable = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  // Electron 44 parses this path as a command line when enumerating launchItems.
  // Quote it for paths such as "Holyrics Web Control.exe" (also used by portable builds).
  const loginOptions = { path: `"${executable.replace(/^"|"$/g, '')}"`, args: [startupArgument] };
  let pending = Promise.resolve();

  function loginState() {
    if (!canStartWithWindows) return { registered: false, enabled: false };
    const login = app.getLoginItemSettings(loginOptions);
    const item = login.launchItems?.find(entry => entry.name === loginName && entry.scope === 'user');
    // openAtLogin compares the complete command; launchItems confirms this entry is enabled.
    // Do not compare launchItems.args: Electron may omit command-line switches from that list.
    return { registered: Boolean(item), enabled: Boolean(login.openAtLogin && item?.enabled) };
  }
  function read() {
    return {
      startMinimized, canStartWithWindows,
      startWithWindows: loginState().enabled,
      portable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE)
    };
  }
  return {
    get startMinimized() { return startMinimized; },
    read,
    update(value) {
      if (!value || typeof value.startMinimized !== 'boolean' || typeof value.startWithWindows !== 'boolean') {
        return Promise.reject(new Error('Opciones de inicio inválidas.'));
      }
      if (value.startWithWindows && !canStartWithWindows) {
        return Promise.reject(new Error('El inicio con Windows se configura desde el ejecutable instalado o portable.'));
      }
      const operation = pending.then(async () => {
        const previous = loginState();
        const changeLogin = canStartWithWindows && (value.startWithWindows !== previous.enabled || (!value.startWithWindows && previous.registered));
        try {
          if (changeLogin) {
            app.setLoginItemSettings({ ...loginOptions, name: loginName, openAtLogin: value.startWithWindows, enabled: value.startWithWindows });
            const confirmed = loginState();
            if (value.startWithWindows ? !confirmed.enabled : confirmed.registered) {
              throw new Error('No se pudo actualizar el inicio con Windows. Revisá los permisos de inicio de aplicaciones de tu usuario.');
            }
          }
          await fs.mkdir(path.dirname(file), { recursive: true });
          await fs.writeFile(`${file}.tmp`, JSON.stringify({ startMinimized: value.startMinimized }, null, 2), 'utf8');
          await fs.rename(`${file}.tmp`, file);
        } catch (error) {
          if (changeLogin) app.setLoginItemSettings({ ...loginOptions, name: loginName, openAtLogin: previous.registered, enabled: previous.enabled });
          throw error;
        }
        startMinimized = value.startMinimized;
        return read();
      });
      pending = operation.catch(() => {});
      return operation;
    }
  };
}
