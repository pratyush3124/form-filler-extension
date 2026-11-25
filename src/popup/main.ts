import { send } from '../shared/messages';
import { DEFAULT_SETTINGS, type ExportFile } from '../shared/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main() {
  const data = await send<ExportFile>({ type: 'getAll' });
  let settings = data?.settings ?? DEFAULT_SETTINGS;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try {
    const url = new URL(tab?.url ?? '');
    if (url.protocol === 'http:' || url.protocol === 'https:') host = url.hostname;
  } catch {
    /* no usable URL */
  }

  const global = $<HTMLInputElement>('global');
  const site = $<HTMLInputElement>('site');
  global.checked = settings.enabled;
  if (host) {
    $('host').textContent = host;
    site.checked = !settings.disabledSites.includes(host);
  } else {
    $('siteRow').hidden = true;
    $('note').hidden = false;
  }

  global.addEventListener('change', async () => {
    const res = await send<{ settings: typeof settings }>({ type: 'setSettings', patch: { enabled: global.checked } });
    if (res) settings = res.settings;
  });
  site.addEventListener('change', async () => {
    const sites = new Set(settings.disabledSites);
    if (site.checked) sites.delete(host);
    else sites.add(host);
    const res = await send<{ settings: typeof settings }>({ type: 'setSettings', patch: { disabledSites: [...sites] } });
    if (res) settings = res.settings;
  });
  $('manage').addEventListener('click', () => {
    void chrome.runtime.openOptionsPage();
    window.close();
  });
}

void main();
