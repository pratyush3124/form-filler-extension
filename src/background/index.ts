import type { Request } from '../shared/messages';
import * as store from '../shared/store';

async function handle(req: Request): Promise<unknown> {
  switch (req.type) {
    case 'status':
      return { active: await store.isActiveOn(req.host) };
    case 'save':
      if (await store.isActiveOn(req.host)) await store.saveEntries(req.host, req.entries);
      return { ok: true };
    case 'query':
      if (!(await store.isActiveOn(req.host))) return { suggestions: [] };
      return { suggestions: await store.querySuggestions(req.keys, req.query, req.host) };
    case 'getAll':
      return store.exportData();
    case 'deleteValue':
      await store.deleteValue(req.key, req.value);
      return { ok: true };
    case 'deleteField':
      await store.deleteField(req.key);
      return { ok: true };
    case 'clearAll':
      await store.clearAll();
      return { ok: true };
    case 'import':
      return { imported: await store.importData(req.data) };
    case 'setSettings':
      return { settings: await store.setSettings(req.patch) };
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
  handle(req).then(sendResponse, (err) => sendResponse({ error: String(err) }));
  return true; // async response
});
