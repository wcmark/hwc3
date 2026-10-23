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
  const loginOptions = { path: executable, args: [startupArgument] };
  let pending = Promise.resolve();

  function read() {
    const login = canStartWithWindows ? app.getLoginItemSettings(loginOptions) : null;
    return {
      startMinimized, canStartWithWindows,
      startWithWindows: Boolean(login?.openAtLogin && login?.executableWillLaunchAtLogin),
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
        const previous = canStartWithWindows ? app.getLoginItemSettings(loginOptions) : null;
        const previousEnabled = Boolean(previous?.openAtLogin && previous?.executableWillLaunchAtLogin);
        const changeLogin = canStartWithWindows && (value.startWithWindows !== previousEnabled || (!value.startWithWindows && previous?.openAtLogin));
        if (changeLogin) {
          app.setLoginItemSettings({ ...loginOptions, name: loginName, openAtLogin: value.startWithWindows, enabled: value.startWithWindows });
          if (read().startWithWindows !== value.startWithWindows) throw new Error('Windows no confirmó el cambio de inicio automático.');
        }
        try {
          await fs.mkdir(path.dirname(file), { recursive: true });
          await fs.writeFile(`${file}.tmp`, JSON.stringify({ startMinimized: value.startMinimized }, null, 2), 'utf8');
          await fs.rename(`${file}.tmp`, file);
        } catch (error) {
          if (changeLogin) app.setLoginItemSettings({ ...loginOptions, name: loginName, openAtLogin: previous.openAtLogin, enabled: previousEnabled });
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
