import { mkdirSync, constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export function configureUserData(app) {
  const previous = path.join(app.getPath('appData'), 'holyrics-web-control-v2');
  const destination = path.join(app.getPath('appData'), 'HWC3');
  mkdirSync(destination, { recursive: true });
  // Set both paths before Electron creates its first browser session or instance lock.
  app.setPath('userData', destination);
  app.setPath('sessionData', destination);
  return async function migrateUserData() {
    const marker = path.join(destination, '.legacy-migration-complete');
    async function exists(file) {
      try { await fs.access(file); return true; }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    }
    if (await exists(marker)) return;
    const previousData = path.join(previous, 'data');
    const nextData = path.join(destination, 'data');
    if (!(await exists(nextData)) && await exists(previousData)) {
      // Keep the device list and its signing secret together, even if copying is interrupted.
      const staging = await fs.mkdtemp(path.join(destination, '.migration-'));
      const stagedData = path.join(staging, 'data');
      await fs.cp(previousData, stagedData, { recursive: true, force: false, errorOnExist: true });
      await fs.rename(stagedData, nextData);
      await fs.rmdir(staging);
    }
    for (const filename of ['startup-preferences.json', 'interface-preferences.json']) {
      try { await fs.copyFile(path.join(previous, filename), path.join(destination, filename), constants.COPYFILE_EXCL); }
      catch (error) { if (!['ENOENT', 'EEXIST'].includes(error.code)) throw error; }
    }
    await fs.writeFile(marker, 'Migración de ajustes completada. La carpeta anterior se conserva.\n', 'utf8');
  };
}
