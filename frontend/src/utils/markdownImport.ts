import { marked } from 'marked';
import Delta from 'quill-delta';
import type Quill from 'quill';

/*
 * Markdown import.
 *
 * The app stores Quill Deltas, not Markdown, so an import has to become real
 * rich text. Instead of inventing a Delta dialect, render the Markdown to HTML
 * with marked and let Quill's own clipboard converter build the Delta: it uses
 * exactly the formats this editor registers (headers, lists, checklists, code
 * blocks, links, images, ...), so what lands in the note behaves like text
 * typed in the editor.
 *
 * Tables are the exception. quill-table-better cannot rebuild a table from a
 * Delta alone: the table has to be created through its module and the cells
 * filled afterwards. The importer therefore returns a small action list that
 * interleaves Deltas and tables; the editor applies them in order.
 */

export type MarkdownImportAction =
  | { kind: 'delta'; delta: Delta }
  | { kind: 'table'; cells: Delta[][] };

/**
 * YAML front matter is metadata for static site generators, not note content.
 * Only strip it when it sits at the very start and actually looks like YAML.
 */
export function stripFrontMatter(markdown: string): string {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return markdown;
  const looksLikeYaml = /^[A-Za-z0-9_.-]+[ \t]*:/m.test(match[1]);
  return looksLikeYaml ? markdown.slice(match[0].length) : markdown;
}

export function markdownToHtml(markdown: string): string {
  const source = stripFrontMatter(markdown.replace(/\r\n?/g, '\n'));
  return marked.parse(source, {
    gfm: true,
    breaks: false,
    async: false,
  }) as string;
}

/**
 * Quill's clipboard reads task state from `data-checked` on the list, not from
 * an <input> inside the item. marked emits GitHub-style checkbox inputs, so
 * rebuild each task list as one list per state and keep the item order.
 */
function normalizeTaskLists(root: ParentNode): void {
  root.querySelectorAll('ul').forEach((list) => {
    const items = Array.from(list.children).filter(
      (child): child is HTMLLIElement => child.tagName === 'LI',
    );
    const hasCheckbox = items.some((item) =>
      item.querySelector(':scope > input[type="checkbox"]'),
    );
    if (!hasCheckbox) return;

    const groups: Array<{
      state: 'bullet' | 'checked' | 'unchecked';
      items: HTMLLIElement[];
    }> = [];
    const groupFor = (state: 'bullet' | 'checked' | 'unchecked') => {
      let group = groups[groups.length - 1];
      if (!group || group.state !== state) {
        group = { state, items: [] };
        groups.push(group);
      }
      return group;
    };

    for (const item of items) {
      const checkbox = item.querySelector(':scope > input[type="checkbox"]');
      let state: 'bullet' | 'checked' | 'unchecked' = 'bullet';
      if (checkbox) {
        const checked =
          checkbox.hasAttribute('checked') || (checkbox as HTMLInputElement).checked;
        state = checked ? 'checked' : 'unchecked';
        checkbox.remove();
      }
      groupFor(state).items.push(item);
    }

    const parent = list.parentNode;
    if (!parent) return;
    const doc = list.ownerDocument;

    for (const group of groups) {
      const replacement = doc.createElement('ul');
      if (group.state !== 'bullet') {
        replacement.setAttribute('data-checked', group.state === 'checked' ? 'true' : 'false');
      }
      group.items.forEach((item) => replacement.appendChild(item));
      parent.insertBefore(replacement, list);
    }
    list.remove();
  });
}

/**
 * Loose Markdown lists wrap their text in <p>. Quill already turns the list
 * item into a line, so the paragraph would add a second line break and leave
 * gaps between items. Unwrap those paragraphs.
 */
function unwrapListParagraphs(root: ParentNode): void {
  root.querySelectorAll('li > p').forEach((paragraph) => {
    const parent = paragraph.parentNode;
    if (!parent) return;
    while (paragraph.firstChild) {
      parent.insertBefore(paragraph.firstChild, paragraph);
    }
    paragraph.remove();
  });
}

function normalizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // marked emits <del>, but Quill's clipboard only matches the <s>/<strike>
  // spelling of the strike format.
  doc.body.querySelectorAll('del').forEach((node) => {
    const strike = doc.createElement('s');
    while (node.firstChild) strike.appendChild(node.firstChild);
    node.replaceWith(strike);
  });

  // Quill has no horizontal-rule format; leaving <hr> in place produced a
  // stray line of whitespace.
  doc.body.querySelectorAll('hr').forEach((node) => node.remove());

  normalizeTaskLists(doc.body);
  unwrapListParagraphs(doc.body);
  return doc.body.innerHTML;
}

function withTrailingNewline(delta: Delta): Delta {
  const ops = delta.ops.slice();
  const last = ops[ops.length - 1];
  if (!last || typeof last.insert !== 'string' || !last.insert.endsWith('\n')) {
    ops.push({ insert: '\n' });
  }
  return new Delta(ops);
}

/** Inline content for one table cell, without block line breaks. */
function cellDelta(quill: Quill, html: string): Delta {
  const converted = quill.clipboard.convert({ html: html || '' });
  const ops = converted.ops.slice();
  while (ops.length > 0) {
    const last = ops[ops.length - 1];
    if (typeof last.insert !== 'string' || !last.insert.endsWith('\n')) break;
    const text = last.insert.replace(/\n+$/, '');
    if (text) {
      ops[ops.length - 1] = { ...last, insert: text };
      break;
    }
    ops.pop();
  }
  return new Delta(ops);
}

function readTable(quill: Quill, table: HTMLTableElement): Delta[][] {
  const rows = Array.from(table.rows).map((row) =>
    Array.from(row.cells).map((cell) => cellDelta(quill, cell.innerHTML)),
  );
  const columns = Math.max(1, ...rows.map((row) => row.length));
  rows.forEach((row) => {
    while (row.length < columns) row.push(new Delta());
  });
  return rows;
}

/**
 * Build the import as a sequence of Deltas and tables. Markdown tables are
 * replaced by table actions; everything between them keeps its normal rich
 * text conversion.
 */
export function markdownToActions(
  quill: Quill,
  markdown: string,
): MarkdownImportAction[] {
  const normalized = normalizeHtml(markdownToHtml(markdown));
  const doc = new DOMParser().parseFromString(normalized, 'text/html');
  const actions: MarkdownImportAction[] = [];

  let buffer = doc.createElement('div');
  const flush = () => {
    if (buffer.childNodes.length === 0) return;
    const delta = withTrailingNewline(quill.clipboard.convert({ html: buffer.innerHTML }));
    if (delta.length() > 1) actions.push({ kind: 'delta', delta });
    buffer = doc.createElement('div');
  };

  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'TABLE') {
      flush();
      actions.push({
        kind: 'table',
        cells: readTable(quill, node as HTMLTableElement),
      });
      continue;
    }
    buffer.appendChild(node.cloneNode(true));
  }
  flush();

  return actions;
}

/**
 * Tables have to be created through quill-table-better; everything else is a
 * plain Delta. Returns the index just after the table.
 */
function insertTable(
  quill: Quill,
  index: number,
  cells: Delta[][],
): number {
  const columns = cells[0]?.length ?? 0;
  if (cells.length === 0 || columns === 0) return index;

  const table = quill.getModule('table-better') as
    | { insertTable?: (rows: number, columns: number) => void }
    | undefined;
  if (!table?.insertTable) return index;

  /*
   * insertTable() asks for the *focused* selection. A silent selection is not
   * enough: without focus Quill falls back to a stale range and the table
   * lands at the end of the note. Focus first, then select for real.
   */
  quill.focus();
  quill.setSelection(index, 0, 'user');
  table.insertTable(cells.length, columns);

  const cellIndices: number[] = [];
  let position = 0;
  for (const op of quill.getContents().ops) {
    const length = typeof op.insert === 'string' ? op.insert.length : 1;
    const attributes = (op.attributes ?? {}) as Record<string, unknown>;
    if (
      position >= index &&
      (attributes['table-cell-block'] || attributes['table-th-block'])
    ) {
      cellIndices.push(position);
      if (cellIndices.length === cells.length * columns) break;
    }
    position += length;
  }

  const flat = cells.flat();
  // Backwards, so filling one cell does not move the next cell's index
  for (let i = flat.length - 1; i >= 0; i -= 1) {
    if (!flat[i] || flat[i].length() === 0) continue;
    if (cellIndices[i] == null) continue;
    /*
     * USER, not API: history only records user changes. With API the cell
     * text was never part of the undo step and stayed behind after undo.
     */
    quill.updateContents(new Delta().retain(cellIndices[i]).concat(flat[i]), 'user');
  }

  /*
   * Find the end of the table in the document itself. Counting lines by hand
   * was one position short when the table followed existing text, which put
   * the next imported block into the wrong line.
   */
  let cursor = index;
  let scanPosition = 0;
  let started = false;
  let cellLines = 0;
  const neededLines = cells.length * columns;

  for (const op of quill.getContents().ops) {
    const length = typeof op.insert === 'string' ? op.insert.length : 1;
    if (scanPosition < index) {
      scanPosition += length;
      continue;
    }

    const attributes = (op.attributes ?? {}) as Record<string, unknown>;
    const isTemporary = Boolean(attributes['table-temporary']);
    const isCell = Boolean(
      attributes['table-cell-block'] || attributes['table-th-block'],
    );

    if (!started) {
      // insertTable can put a separating line before the table itself
      if (!isTemporary && !isCell) {
        scanPosition += length;
        continue;
      }
      started = true;
    }

    /*
     * Cell text may be a separate op without attributes (its newline carries
     * the cell format), so count completed cell lines rather than ops.
     */
    if (isCell && typeof op.insert === 'string' && op.insert.includes('\n')) {
      cellLines += 1;
      if (cellLines >= neededLines) {
        cursor = scanPosition + length;
        break;
      }
    }

    scanPosition += length;
  }
  return cursor;
}

/**
 * Apply a converted Markdown document at `index`, in order, including tables.
 * The caret ends up after the imported content.
 */
export function applyMarkdownImport(
  quill: Quill,
  actions: MarkdownImportAction[],
  index: number,
): void {
  /*
   * One import must be one undo step, not one per segment and table. History
   * merges consecutive user changes within its delay window; cutting off on
   * both sides keeps earlier typing out and makes the following typing a
   * separate step.
   */
  const history = quill.history as unknown as { cutoff?: () => void };
  history.cutoff?.();

  let cursor = Math.max(0, Math.min(index, quill.getLength() - 1));

  try {
    // Clicking mid-line should not turn the text before the caret into the
    // imported heading: start the import on its own block.
    if (cursor > 0 && quill.getText(cursor - 1, 1) !== '\n') {
      quill.updateContents(new Delta().retain(cursor).insert('\n'), 'user');
      cursor += 1;
    }

    for (const action of actions) {
      if (action.kind === 'delta') {
        quill.updateContents(new Delta().retain(cursor).concat(action.delta), 'user');
        cursor += action.delta.length();
        continue;
      }
      cursor = insertTable(quill, cursor, action.cells);
    }
  } finally {
    history.cutoff?.();
  }

  quill.setSelection(Math.min(cursor, quill.getLength() - 1), 0, 'silent');
  quill.focus();
}
