# Form Filler — Remember & Suggest

A Chrome (Manifest V3) extension that remembers, **locally**, what you type into form fields and
offers those values as clickable suggestions the next time you focus the same field.

- No network access, no accounts, nothing leaves your browser (`chrome.storage.local`).
- Never stores passwords, card numbers/CVV/expiry, OTPs, PINs, SSN-like or hidden/file fields,
  and refuses any value that looks like a card number (Luhn check).
- Works across sites for common fields (email, name, phone, address, …) and per-site for the rest.

## Use

```bash
npm install
npm run build        # outputs dist/
```

Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick `dist/`.
Open `tests/fixtures/form.html` (serve it or open as a file; enable "Allow access to file URLs"
for the extension), fill and submit the form, reload, focus a field: suggestions appear.
↑/↓ + Enter or click to fill, Esc to dismiss.

### Keyboard

While a suggestion dropdown is open:

| Keys | Action |
| --- | --- |
| `↑` / `↓` | move (text-like fields) |
| `Alt+↑` / `Alt+↓` (`⌥` on Mac) | move, on **every** field type (radios, checkboxes, dates use bare arrows natively) |
| `Enter` | pick the highlighted suggestion |
| `Alt+1` … `Alt+9` | pick that suggestion directly |
| `Esc` | close |

`Alt+↓` on a field whose dropdown is closed reopens it with the first suggestion highlighted.

### Supported inputs

Text, email, tel, url, number, textarea, select (saved, filled via the native picker), date / time /
datetime-local / month / week, **radio groups** and **checkbox groups**. A radio/checkbox group is
one field named after its question (fieldset legend, `aria-labelledby`, or the heading above it) and
its value is the chosen option label(s). Suggestions appear while the group is unanswered and are
applied by clicking the matching option(s), so page handlers and frameworks see a real interaction.
A lone "I agree" checkbox is remembered as "Checked". Custom widgets built from `div role=radio`
(no real `<input>`) are not supported yet.

The toolbar popup toggles the extension globally or for the current site. The options page lists
everything stored, with search, per-value delete, export/import (JSON) and clear-all.

## Develop

```bash
npm run dev          # esbuild watch (reload the extension in chrome://extensions after changes)
npm run typecheck
npm test             # vitest + jsdom, includes a capture -> suggest -> fill integration test
```

## How it works

| Piece | File |
| --- | --- |
| Field identity (autocomplete / name / label → keys) | `src/content/fieldKey.ts` |
| Sensitive-field rules | `src/content/sensitive.ts` |
| Capture on blur / change / tab close, plus `submit`, button click, Enter | `src/content/capture.ts`, `src/content/index.ts` |
| Suggestion dropdown (closed Shadow DOM) | `src/content/suggest.ts` |
| Framework-safe fill (native setter + `input`/`change`) | `src/content/fill.ts` |
| Storage (single writer, serialized) | `src/shared/store.ts`, `src/background/index.ts` |
| Dedupe / LRU / ranking | `src/shared/records.ts` |

Fields are saved as soon as you finish typing in them (blur / select change / tab close), with submit and button clicks as a fallback; unchanged values are never double-counted.

Each field gets up to two keys: `s:<origin>|<name>` (that site only) and `g:<token>` (shared across
sites, only when the field is recognisable, e.g. `autocomplete="email"`, `type=email`, "First name").
Suggestions merge both; values used on the current site rank first.

## Known limitations (v1)

- No `contenteditable`, range/color inputs, or ARIA-only radio/checkbox widgets.
- A click on any button-like element outside a `<form>` counts as a submission attempt.
- Chrome only; Firefox would need a manifest tweak (`background.scripts`) and a build target.
- Extension is off in Incognito unless you enable it there in `chrome://extensions`.
