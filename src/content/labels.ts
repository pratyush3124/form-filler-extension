import { splitTokens } from './sensitive';

/**
 * Descriptions of the control's *type* or an instruction, not of the question: form builders (e.g.
 * Microsoft Forms) put these on every text box, so using them would merge unrelated questions.
 */
const GENERIC_LABELS = new Set([
  'singlelinetext', 'singlelineoftext', 'multiplelinesoftext', 'multilinetext', 'multilineoftext',
  'enteryouranswer', 'typeyouranswer', 'youranswer', 'shortanswer', 'longanswer', 'answer', 'enteranswer',
  'text', 'textbox', 'textfield', 'textinput', 'input', 'inputfield', 'entertext', 'typehere', 'entervalue',
  'enter', 'select', 'selectone', 'selectanoption', 'choose', 'chooseone', 'chooseanoption',
  'dropdown', 'number', 'date', 'required', 'optional',
]);

export function clean(t: string | null | undefined): string {
  return (t ?? '').replace(/\s+/g, ' ').replace(/[\s*:]+$/, '').trim().slice(0, 80);
}

/** Cleaned text, or '' when it is only a generic type description. */
export function usable(t: string | null | undefined): string {
  const c = clean(t);
  return c && !GENERIC_LABELS.has(splitTokens(c).join('')) ? c : '';
}

const TITLE_SELECTOR =
  'legend, h1, h2, h3, h4, h5, h6, [role="heading"], [data-automation-id*="title" i], [data-automation-id*="question" i], [class*="title" i]';

const CONTROLS = 'input:not([type=hidden]), textarea, select';

function commonAncestor(members: Element[]): Element | null {
  const first = members[0];
  if (!first) return null;
  let node: Element | null = first.parentElement;
  while (node && !members.every((m) => node!.contains(m))) node = node.parentElement;
  return node;
}

/**
 * Question text near a control (or a group of controls) that has no proper label: the heading above
 * it inside its own block. Never borrows a heading from a block that also holds other fields.
 */
export function nearbyQuestionText(el: Element, members: Element[] = [el]): string {
  const ownLabels = members.flatMap((m) => (m instanceof HTMLInputElement ? [...(m.labels ?? [])] : []));
  let node = commonAncestor(members);
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    const others = [...node.querySelectorAll(CONTROLS)].filter((c) => !members.includes(c));
    if (others.length) break;
    for (const t of node.querySelectorAll(TITLE_SELECTOR)) {
      if (members.some((m) => t.contains(m)) || !(t.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (ownLabels.some((l) => l.contains(t) || t.contains(l))) continue; // an option's own text, not the question
      const text = usable(t.textContent);
      if (text && text.length <= 120) return text;
    }
  }
  return '';
}
