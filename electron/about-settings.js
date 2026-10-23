import fs from 'node:fs/promises';
import path from 'node:path';

export function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export async function readAboutContent(file) {
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  return {
    heading: String(data.heading ?? ''),
    appName: String(data.appName ?? 'Web Control para Holyrics'),
    description: String(data.description ?? ''),
    contactHeading: String(data.contactHeading ?? 'Información de contacto'),
    links: (Array.isArray(data.links) ? data.links : []).filter(link => link.id !== 'support' && safeExternalUrl(link.url)).map(link => ({
      id: String(link.id), label: String(link.label ?? ''), text: String(link.text ?? link.url), url: safeExternalUrl(link.url)
    })),
    location: String(data.location ?? ''),
    supportMessage: String(data.supportMessage ?? ''),
    supportUrl: safeExternalUrl(data.supportUrl)
  };
}

export async function createWelcomePreferences(file) {
  let showWelcome = true;
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    showWelcome = data.showWelcomeOnStartup !== false;
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  let pending = Promise.resolve();
  return {
    get showWelcome() { return showWelcome; },
    setDontShowAgain(value) {
      if (typeof value !== 'boolean') return Promise.reject(new Error('Preferencia inválida.'));
      const operation = pending.then(async () => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(`${file}.tmp`, JSON.stringify({ showWelcomeOnStartup: !value }, null, 2), 'utf8');
        await fs.rename(`${file}.tmp`, file);
        showWelcome = !value;
        return { showWelcome };
      });
      pending = operation.catch(() => {});
      return operation;
    }
  };
}
