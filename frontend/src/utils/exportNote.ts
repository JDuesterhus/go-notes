import { notify, notifyError } from '../store/dialogStore';

export type ExportFormat = 'rtf' | 'docm' | 'pdf';

export interface ExportNoteOptions {
  title: string;
  html: string;
}

const A4_WIDTH_TWIPS = 11906;
const A4_HEIGHT_TWIPS = 16838;

const EXPORT_STYLESHEET = `
  body, .go-notes-export { font-family: Calibri, Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; }
  h1 { font-size: 20pt; margin: 0 0 12pt; }
  h2 { font-size: 16pt; margin: 14pt 0 7pt; }
  h3 { font-size: 13pt; margin: 12pt 0 6pt; }
  h4, h5, h6 { font-size: 11pt; margin: 10pt 0 5pt; }
  p { margin: 0 0 6pt; }
  blockquote { margin: 6pt 0 8pt 18pt; padding-left: 8pt; border-left: 2pt solid #bbb; color: #444; }
  pre { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; white-space: pre-wrap; background: #f4f4f4; padding: 7pt; margin: 0 0 8pt; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; background: #f4f4f4; }
  ul, ol { margin: 0 0 6pt; padding-left: 22pt; }
  li { margin: 0 0 2pt; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 8pt; }
  th, td { border: 0.75pt solid #999; padding: 3pt 5pt; vertical-align: top; }
  th { background: #eee; }
  img { max-width: 100%; height: auto; }
  a { color: #1155cc; text-decoration: underline; }
  hr { border: 0; border-top: 0.75pt solid #999; margin: 10pt 0; }
  .ql-code-block-container { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; white-space: pre-wrap; background: #f4f4f4; padding: 7pt; margin: 0 0 8pt; }
  .ql-code-block { white-space: pre-wrap; }
  li[data-list="bullet"] { list-style-type: disc; }
  li[data-list="ordered"] { list-style-type: decimal; }
  li[data-list="checked"], li[data-list="unchecked"] { list-style: none; }
  .ql-align-center { text-align: center; }
  .ql-align-right { text-align: right; }
  .ql-align-justify { text-align: justify; }
  .ql-indent-1 { margin-left: 2em; }
  .ql-indent-2 { margin-left: 4em; }
  .ql-indent-3 { margin-left: 6em; }
  .ql-indent-4 { margin-left: 8em; }
  .ql-indent-5 { margin-left: 10em; }
  .ql-indent-6 { margin-left: 12em; }
  .ql-indent-7 { margin-left: 14em; }
  .ql-indent-8 { margin-left: 16em; }
  .ql-size-small { font-size: 0.75em; }
  .ql-size-large { font-size: 1.5em; }
  .ql-size-huge { font-size: 2.5em; }
`;

function sanitizeFileName(title: string): string {
  const cleaned = Array.from(title)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 32 || /[<>:"/\\|?*]/.test(char) ? '_' : char;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'note';
}

/** Returns a detached content root with editor-only artefacts removed. */
function parseContent(html: string): HTMLElement {
  const parsed = new DOMParser().parseFromString(
    `<div id="go-notes-export-root">${html}</div>`,
    'text/html',
  );
  const root = parsed.getElementById('go-notes-export-root');
  if (!root) return document.createElement('div');

  root.querySelectorAll(
    '.ql-ui, .ql-cursor, .ql-cursor-caret, .ql-cursor-selection, script, style, noscript, iframe, object, embed, link, meta',
  ).forEach((node) => node.remove());

  // The editor content is user-authored. Do not carry event handlers or
  // script URLs into a detached export document.
  root.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
      } else if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  // Checkboxes in Quill checklists are represented by a hidden span. Keep a
  // readable marker in exports instead of silently dropping the state.
  root.querySelectorAll('li[data-list]').forEach((item) => {
    const state = item.getAttribute('data-list');
    if (state === 'checked' || state === 'unchecked') {
      item.insertBefore(
        document.createTextNode(state === 'checked' ? '☑ ' : '☐ '),
        item.firstChild,
      );
    }
  });

  return root;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRtf(text: string): string {
  let out = '';
  for (const char of text) {
    if (char === '\\') out += '\\\\';
    else if (char === '{') out += '\\{';
    else if (char === '}') out += '\\}';
    else if (char === '\n') out += '\\line ';
    else if (char === '\r') continue;
    else if (char === '\t') out += '\\tab ';
    else {
      const code = char.codePointAt(0) ?? 0;
      if (code >= 32 && code <= 126) {
        out += char;
      } else if (code > 0xffff) {
        // RTF's Unicode escape works on UTF-16 code units.
        for (let i = 0; i < char.length; i += 1) {
          let unit = char.charCodeAt(i);
          if (unit > 32767) unit -= 65536;
          out += `\\u${unit}?`;
        }
      } else {
        let unit = code;
        if (unit > 32767) unit -= 65536;
        out += `\\u${unit}?`;
      }
    }
  }
  return out;
}

function alignmentRtf(element: HTMLElement): string {
  const style = element.style.textAlign;
  const cls = element.className;
  if (style === 'center' || cls.includes('ql-align-center')) return '\\qc';
  if (style === 'right' || cls.includes('ql-align-right')) return '\\qr';
  if (style === 'justify' || cls.includes('ql-align-justify')) return '\\qj';
  return '';
}

function inlineRtf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeRtf(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).map(inlineRtf).join('');

  switch (tag) {
    case 'br':
      return '\\line ';
    case 'strong':
    case 'b':
      return `{\\b ${children}}`;
    case 'em':
    case 'i':
      return `{\\i ${children}}`;
    case 'u':
      return `{\\ul ${children}}`;
    case 's':
    case 'strike':
    case 'del':
      return `{\\strike ${children}}`;
    case 'code':
      return `{\\f1 ${children}}`;
    case 'sup':
      return `{\\super ${children}}`;
    case 'sub':
      return `{\\sub ${children}}`;
    case 'a': {
      const href = element.getAttribute('href') ?? '';
      if (!href) return children;
      return `{\\field{\\*\\fldinst{HYPERLINK "${escapeRtf(href)}"}}{\\fldrslt ${children}}}`;
    }
    case 'img': {
      const alt = element.getAttribute('alt') ?? '';
      return alt ? `[Image: ${escapeRtf(alt)}]` : '[Image]';
    }
    default:
      return children;
  }
}

function paragraphRtf(children: string, options: {
  align?: string;
  prefix?: string;
  indent?: number;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  spacingAfter?: number;
} = {}): string {
  const parts = ['\\pard', '\\plain'];
  if (options.align) parts.push(options.align);
  if (options.indent) parts.push(`\\li${options.indent}`);
  if (options.mono) parts.push('\\f1');
  else parts.push('\\f0');
  if (options.bold) parts.push('\\b');
  if (options.italic) parts.push('\\i');
  parts.push(`\\fs${options.size ?? 22}`);
  parts.push(`\\sa${options.spacingAfter ?? 120}`);
  if (options.prefix) parts.push(options.prefix);
  parts.push(children);
  parts.push('\\par');
  return parts.join('');
}

function listRtf(list: HTMLElement, level: number): string[] {
  const result: string[] = [];
  let number = 1;

  Array.from(list.children).forEach((child) => {
    if (!(child instanceof HTMLElement) || child.tagName.toLowerCase() !== 'li') return;

    const inlineNodes: Node[] = [];
    Array.from(child.childNodes).forEach((node) => {
      if (node instanceof HTMLElement && ['ul', 'ol'].includes(node.tagName.toLowerCase())) {
        return;
      }
      inlineNodes.push(node);
    });

    // Quill writes both ordered and bullet lists as <ol> and marks each item
    // with data-list, so the tag alone is not enough.
    const dataList = child.getAttribute('data-list');
    const ordered = dataList ? dataList === 'ordered' : list.tagName.toLowerCase() === 'ol';
    const prefix = ordered ? `${number}.\\tab ` : '\\bullet\\tab ';
    if (ordered) number += 1;
    result.push(paragraphRtf(inlineNodes.map(inlineRtf).join(''), {
      indent: 720 * (level + 1),
      size: 22,
      prefix,
    }));

    Array.from(child.children).forEach((nested) => {
      if (nested instanceof HTMLElement && ['ul', 'ol'].includes(nested.tagName.toLowerCase())) {
        result.push(...listRtf(nested, level + 1));
      }
    });
  });

  return result;
}

function blocksRtf(nodes: NodeListOf<ChildNode> | ChildNode[], level = 0): string[] {
  const result: string[] = [];

  Array.from(nodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').trim();
      if (text) result.push(paragraphRtf(escapeRtf(text)));
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    const tag = node.tagName.toLowerCase();
    const align = alignmentRtf(node);

    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const sizes: Record<string, number> = {
          h1: 40, h2: 36, h3: 32, h4: 28, h5: 24, h6: 22,
        };
        result.push(paragraphRtf(
          Array.from(node.childNodes).map(inlineRtf).join(''),
          { align, size: sizes[tag], bold: true, spacingAfter: 180 },
        ));
        return;
      }
      case 'p':
      case 'div': {
        if (node.classList.contains('ql-code-block-container')) {
          const lines = Array.from(node.querySelectorAll('.ql-code-block'))
            .map((line) => line.textContent ?? '');
          result.push(paragraphRtf(
            lines.map(escapeRtf).join('\\line '),
            { mono: true, size: 19 },
          ));
          return;
        }
        if (node.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, table')) {
          result.push(...blocksRtf(node.childNodes, level));
        } else {
          result.push(paragraphRtf(
            Array.from(node.childNodes).map(inlineRtf).join(''),
            { align },
          ));
        }
        return;
      }
      case 'ul':
      case 'ol':
        result.push(...listRtf(node, level));
        return;
      case 'blockquote':
        result.push(paragraphRtf(
          Array.from(node.childNodes).map(inlineRtf).join(''),
          { indent: 720, italic: true },
        ));
        return;
      case 'pre': {
        const lines = (node.textContent ?? '').replace(/\r/g, '').split('\n');
        result.push(paragraphRtf(
          lines.map(escapeRtf).join('\\line '),
          { mono: true, size: 19 },
        ));
        return;
      }
      case 'hr':
        result.push('\\pard\\brdrb\\brdrs\\brdrw10\\par');
        return;
      case 'img': {
        const alt = node.getAttribute('alt') ?? '';
        result.push(paragraphRtf(alt ? `[Image: ${escapeRtf(alt)}]` : '[Image]'));
        return;
      }
      case 'table': {
        Array.from(node.querySelectorAll('tr')).forEach((row) => {
          const cells = Array.from(row.querySelectorAll('th, td'))
            .map((cell) => (cell.textContent ?? '').trim());
          if (cells.length) {
            result.push(paragraphRtf(escapeRtf(cells.join(' | ')), { size: 20 }));
          }
        });
        return;
      }
      default: {
        const inline = Array.from(node.childNodes).map(inlineRtf).join('');
        if (inline.trim()) result.push(paragraphRtf(inline, { align }));
      }
    }
  });

  return result;
}

function buildRtf(title: string, root: HTMLElement): string {
  const titleParagraph = paragraphRtf(escapeRtf(title), {
    align: '\\qc',
    bold: true,
    size: 36,
    spacingAfter: 240,
  });
  const body = blocksRtf(root.childNodes).join('\n');

  return [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0',
    '{\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}{\\f1\\fmodern\\fcharset0 Consolas;}}',
    `\\paperw${A4_WIDTH_TWIPS}\\paperh${A4_HEIGHT_TWIPS}\\margl1440\\margr1440\\margt1440\\margb1440`,
    '\\viewkind4\\uc1',
    titleParagraph,
    body,
    '}',
  ].join('\n');
}

async function buildDocm(title: string, html: string): Promise<Blob> {
  const [{ Document, Packer, Paragraph, TextRun }, { htmlToContent }, { createMacros }] =
    await Promise.all([
      import('docx'),
      import('docx/html'),
      import('docx/macros'),
    ]);

  const content = htmlToContent(html, {
    stylesheet: EXPORT_STYLESHEET,
    maxImageWidth: 600,
  });

  const document = new Document({
    macros: createMacros({}),
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
          paragraph: { spacing: { after: 120 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: A4_WIDTH_TWIPS, height: A4_HEIGHT_TWIPS },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        new Paragraph({
          children: [new TextRun({ text: title, bold: true, size: 40 })],
          spacing: { after: 260 },
        }),
        ...content,
      ],
    }],
  });

  return Packer.toBlob(document);
}

function buildPdfContainer(title: string, html: string): { container: HTMLElement; wrapper: HTMLElement } {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.left = '-10000px';
  wrapper.style.top = '0';

  const container = document.createElement('div');
  container.className = 'go-notes-export';
  container.style.width = '180mm';
  container.style.maxWidth = '180mm';
  container.style.boxSizing = 'border-box';
  container.style.background = '#ffffff';
  container.style.color = '#111111';
  container.innerHTML = `
    <style>${EXPORT_STYLESHEET}</style>
    <h1>${escapeHtml(title)}</h1>
    <div class="go-notes-export-body">${html}</div>
  `;
  wrapper.appendChild(container);
  document.body.appendChild(wrapper);
  return { container, wrapper };
}

async function buildPdf(title: string, html: string): Promise<Blob> {
  const { container, wrapper } = buildPdfContainer(title, html);
  try {
    await document.fonts?.ready;
    const module = await import('html2pdf.js');
    const html2pdf = (module as { default?: unknown }).default ?? module;
    const worker = (html2pdf as () => {
      set: (options: Record<string, unknown>) => unknown;
      from: (element: HTMLElement) => unknown;
      outputPdf: (type: string) => Promise<Blob>;
    })();

    const configured = worker.set({
      margin: [15, 15, 15, 15],
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }) as {
      from: (element: HTMLElement) => { outputPdf: (type: string) => Promise<Blob> };
    };

    return await configured.from(container).outputPdf('blob');
  } finally {
    wrapper.remove();
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read export'));
    reader.readAsDataURL(blob);
  });
}

async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  const native = (window as unknown as {
    GoNotesNative?: { saveFile?: (base64: string, fileName: string, mime: string) => void };
  }).GoNotesNative;

  if (native?.saveFile) {
    native.saveFile(await blobToBase64(blob), fileName, blob.type || 'application/octet-stream');
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportNote(format: ExportFormat, options: ExportNoteOptions): Promise<void> {
  const title = options.title.trim() || 'Untitled';
  const root = parseContent(options.html);
  const fileName = sanitizeFileName(title);

  try {
    if (format === 'rtf') {
      const rtf = buildRtf(title, root);
      await saveBlob(new Blob([rtf], { type: 'application/rtf' }), `${fileName}.rtf`);
    } else if (format === 'docm') {
      const blob = await buildDocm(title, root.innerHTML);
      await saveBlob(
        new Blob([blob], {
          type: 'application/vnd.ms-word.document.macroEnabled.12',
        }),
        `${fileName}.docm`,
      );
    } else {
      const blob = await buildPdf(title, root.innerHTML);
      await saveBlob(blob, `${fileName}.pdf`);
    }

    notify(`Exported ${format.toUpperCase()}`);
  } catch (error) {
    console.error(`[Export] ${format} export failed:`, error);
    notifyError(`Could not export ${format.toUpperCase()}`);
  }
}
