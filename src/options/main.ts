import { send } from '../shared/messages';
import { displayValue } from '../shared/records';
import type { ExportFile, FieldRecord, Settings } from '../shared/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let data: ExportFile;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  node.append(...children);
  return node;
}

async function load() {
  const res = await send<ExportFile>({ type: 'getAll' });
  if (res) data = res;
  render();
}

function scopeOf(rec: FieldRecord): { text: string; global: boolean } {
  if (rec.key.startsWith('g:')) return { text: 'all sites', global: true };
  const origin = rec.key.slice(2).split('|')[0] ?? '';
  try {
    return { text: new URL(origin).host, global: false };
  } catch {
    return { text: origin, global: false };
  }
}

function render() {
  const q = $<HTMLInputElement>('q').value.trim().toLowerCase();
  const list = $('list');
  const recs = Object.values(data.fields)
    .filter(
      (r) =>
        !q ||
        r.label.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q) ||
        r.values.some((v) => v.value.toLowerCase().includes(q)),
    )
    .sort((a, b) => Number(b.key.startsWith('g:')) - Number(a.key.startsWith('g:')) || a.key.localeCompare(b.key));

  if (!recs.length) {
    list.replaceChildren(el('p', { class: 'muted' }, q ? 'No matches.' : 'Nothing saved yet. Submit a form and it will show up here.'));
  } else {
    list.replaceChildren(
      ...recs.map((rec) => {
        const scope = scopeOf(rec);
        const del = el('button', { class: 'danger', textContent: 'Delete field' });
        del.addEventListener('click', async () => {
          await send({ type: 'deleteField', key: rec.key });
          await load();
        });
        const chips = [...rec.values]
          .sort((a, b) => b.lastUsed - a.lastUsed)
          .map((v) => {
            const x = el('button', { textContent: '×', title: 'Remove this value' });
            x.addEventListener('click', async () => {
              await send({ type: 'deleteValue', key: rec.key, value: v.value });
              await load();
            });
            return el('div', { class: 'chip', title: `Used ${v.count}×` }, el('span', { textContent: displayValue(v.value) }), x);
          });
        return el(
          'div',
          { class: 'field' },
          el(
            'header',
            {},
            el('span', { class: 'name', textContent: rec.label || rec.key }),
            el('span', { class: 'badge' + (scope.global ? ' g' : ''), textContent: scope.text }),
            el('span', { class: 'spacer' }),
            del,
          ),
          el('div', { class: 'chips' }, ...chips),
        );
      }),
    );
  }

  const s = data.settings;
  $<HTMLInputElement>('enabled').checked = s.enabled;
  $<HTMLInputElement>('max').value = String(s.maxValuesPerField);
  $('sites').replaceChildren(
    ...(s.disabledSites.length
      ? s.disabledSites.map((site) => {
          const b = el('button', { textContent: '×', title: 'Re-enable' });
          b.addEventListener('click', () => patch({ disabledSites: s.disabledSites.filter((d) => d !== site) }));
          return el('span', { class: 's' }, site, b);
        })
      : [el('span', { class: 'muted', textContent: 'None' })]),
  );
}

async function patch(p: Partial<Settings>) {
  await send({ type: 'setSettings', patch: p });
  await load();
}

function say(text: string) {
  $('msg').textContent = text;
}

$('q').addEventListener('input', render);
$('enabled').addEventListener('change', (e) => patch({ enabled: (e.target as HTMLInputElement).checked }));
$('max').addEventListener('change', (e) => patch({ maxValuesPerField: Number((e.target as HTMLInputElement).value) }));

$('clear').addEventListener('click', async () => {
  if (!confirm('Delete ALL saved form values? This cannot be undone.')) return;
  await send({ type: 'clearAll' });
  say('Cleared.');
  await load();
});

$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `form-filler-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
});

$('importBtn').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const res = await send<{ imported: number }>({ type: 'import', data: JSON.parse(await file.text()) });
    say(res ? `Imported ${res.imported} fields.` : 'Import failed.');
  } catch {
    say('That file is not valid JSON.');
  }
  await load();
});

void load();
