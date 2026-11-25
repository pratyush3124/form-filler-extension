import { displayValue } from '../shared/records';
import type { Suggestion } from '../shared/types';
import type { FormControl } from './sensitive';

const CSS = `
:host { all: initial; }
.box {
  position: fixed; z-index: 2147483647; box-sizing: border-box;
  background: #fff; color: #1f2328; border: 1px solid #d0d7de; border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.18); padding: 4px; overflow-y: auto; max-height: 280px;
  font: 13px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.hdr { padding: 2px 8px 4px; font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase; color: #6e7781; }
.item { display: flex; gap: 10px; align-items: baseline; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.item .v { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item .n { font-size: 10.5px; color: #6e7781; font-variant-numeric: tabular-nums; }
.item.active, .item:hover { background: #ddf4ff; }
.ftr { padding: 5px 8px 2px; margin-top: 3px; border-top: 1px solid #d0d7de; font-size: 10.5px; color: #6e7781; }
@media (prefers-color-scheme: dark) {
  .box { background: #1c2128; color: #e6edf3; border-color: #444c56; }
  .hdr, .item .n, .ftr { color: #8b949e; }
  .ftr { border-color: #444c56; }
  .item.active, .item:hover { background: #264466; }
}
`;

const IS_MAC = /mac/i.test(navigator.platform);
const ALT = IS_MAC ? '⌥' : 'Alt+';

/**
 * Shadow-DOM dropdown anchored under a field. Keeps focus in the field (mousedown is prevented).
 *
 * Keyboard (while the dropdown is open):
 *   ↑ / ↓          move                       (text-like fields only: radios/dates use arrows natively)
 *   Alt+↑ / Alt+↓  move                       (every field type)
 *   Enter          pick the highlighted item
 *   Alt+1 … Alt+9  pick that item directly
 *   Esc            close
 */
export class SuggestBox {
  private host: HTMLElement | null = null;
  private box!: HTMLDivElement;
  private target: FormControl | null = null;
  private items: Suggestion[] = [];
  private index = -1;
  private label = '';
  private plainArrows = true;
  private onPick: (value: string, el: FormControl) => void;

  constructor(onPick: (value: string, el: FormControl) => void) {
    this.onPick = onPick;
    const reposition = () => this.position();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
  }

  get visible(): boolean {
    return !!this.host && this.items.length > 0;
  }

  get current(): FormControl | null {
    return this.visible ? this.target : null;
  }

  /**
   * @param plainArrows whether bare ↑/↓ should navigate. False for radios/checkboxes/dates, where
   *   the arrow keys already mean something; Alt+↑/↓ always works.
   * @param highlightFirst start with the first item highlighted (used when the user asked for it by shortcut)
   */
  show(el: FormControl, items: Suggestion[], label = '', plainArrows = true, highlightFirst = false): void {
    if (!items.length) return this.hide();
    this.target = el;
    this.items = items;
    this.label = label;
    this.plainArrows = plainArrows;
    this.index = highlightFirst ? 0 : -1;
    this.ensureHost();
    this.render();
    this.position();
  }

  hide(): void {
    this.items = [];
    this.target = null;
    this.index = -1;
    this.host?.remove();
    this.host = null;
  }

  /** Returns true if the key was consumed. */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.visible) return false;
    const alt = e.altKey && !e.ctrlKey && !e.metaKey;

    if (alt) {
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) {
        const i = Number(digit[1]) - 1;
        if (i < this.items.length) this.pick(i);
        return true;
      }
    }
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (!alt && (!this.plainArrows || e.shiftKey || e.ctrlKey || e.metaKey)) return false;
        this.move(e.key === 'ArrowDown' ? 1 : -1);
        return true;
      case 'Enter':
        if (this.index < 0) return false;
        this.pick(this.index);
        return true;
      case 'Escape':
        this.hide();
        return true;
      case 'Tab':
        this.hide();
        return false;
      default:
        return false;
    }
  }

  private move(delta: number): void {
    const n = this.items.length;
    this.index = this.index < 0 ? (delta > 0 ? 0 : n - 1) : (this.index + delta + n) % n;
    this.render();
    this.box.querySelector('.item.active')?.scrollIntoView({ block: 'nearest' });
  }

  private pick(i: number): void {
    const item = this.items[i];
    const el = this.target;
    if (!item || !el) return;
    this.hide();
    this.onPick(item.value, el);
  }

  private ensureHost(): void {
    if (this.host) return;
    this.host = document.createElement('div');
    this.host.setAttribute('data-form-filler', '');
    const root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.box = document.createElement('div');
    this.box.className = 'box';
    // Keep the field focused while clicking suggestions.
    this.box.addEventListener('mousedown', (e) => e.preventDefault());
    root.append(style, this.box);
    document.documentElement.append(this.host);
  }

  private render(): void {
    const hdr = document.createElement('div');
    hdr.className = 'hdr';
    hdr.textContent = this.label ? `Previously used for “${this.label}”` : 'Previously used';

    const rows = this.items.map((item, i) => {
      const row = document.createElement('div');
      row.className = 'item' + (i === this.index ? ' active' : '');
      const text = displayValue(item.value);
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = text; // textContent: stored values are untrusted page input
      row.title = text;
      row.append(v);
      if (i < 9) {
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = `${ALT}${i + 1}`;
        row.append(n);
      }
      row.addEventListener('click', () => this.pick(i));
      return row;
    });

    const ftr = document.createElement('div');
    ftr.className = 'ftr';
    ftr.textContent = this.plainArrows
      ? `↑↓ move · Enter pick · Esc close · ${ALT}1-9 quick pick`
      : `${ALT}↑↓ move · Enter pick · Esc close · ${ALT}1-9 quick pick`;

    this.box.replaceChildren(hdr, ...rows, ftr);
  }

  private position(): void {
    if (!this.host || !this.target) return;
    if (!this.target.isConnected) return this.hide();
    const r = this.target.getBoundingClientRect();
    const h = this.box.offsetHeight;
    const below = r.bottom + 2;
    const top = below + h > window.innerHeight && r.top > h ? r.top - h - 2 : below;
    this.box.style.left = `${Math.max(0, Math.min(r.left, window.innerWidth - 200))}px`;
    this.box.style.top = `${top}px`;
    this.box.style.minWidth = `${Math.min(Math.max(r.width, 220), 420)}px`;
    this.box.style.maxWidth = '420px';
  }
}
