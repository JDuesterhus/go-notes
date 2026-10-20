import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { notifyError } from '../store/dialogStore';
import { hasUnbalancedInlineCode } from '../utils/markdownImport';

const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;

interface MarkdownImportModalProps {
  onCancel: () => void;
  onImport: (markdown: string, label: string) => void;
}

export default function MarkdownImportModal({
  onCancel,
  onImport,
}: MarkdownImportModalProps) {
  const [text, setText] = useState('');
  const [showBacktickWarning, setShowBacktickWarning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // The dialog is mounted fresh for every open, so state starts empty
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const canInsert = text.trim().length > 0;

  function submit(markdown: string, label: string) {
    if (!markdown.trim()) return;

    /*
     * A single lost backtick silently moves every code span one boundary over.
     * Ask once before importing; the second press goes ahead.
     */
    if (hasUnbalancedInlineCode(markdown) && !showBacktickWarning) {
      setShowBacktickWarning(true);
      return;
    }

    onImport(markdown, label);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (file.size > MAX_MARKDOWN_BYTES) {
      notifyError('Markdown files are limited to 5 MB');
      return;
    }

    try {
      const markdown = await file.text();
      if (!markdown.trim()) {
        notifyError('That file contains no text to import');
        return;
      }
      submit(markdown, file.name);
    } catch (error) {
      console.error('[MarkdownImport] Could not read file:', error);
      notifyError('Could not read that Markdown file');
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submit(text, 'Markdown');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-panel markdown-import-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="markdown-import-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2 id="markdown-import-title">Import Markdown</h2>
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={onCancel}
            title="Close"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="modal-body">
          <textarea
            ref={textareaRef}
            className="markdown-import-textarea"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setShowBacktickWarning(false);
            }}
            placeholder={'# Title\n\nPaste Markdown here…'}
            spellCheck={false}
            aria-label="Markdown to import"
          />
          <p className="markdown-import-hint">
            Paste Markdown text or choose a file. An empty note takes it directly;
            in a note that already has text, you click where it should be inserted.
          </p>
          {showBacktickWarning && (
            <p className="markdown-import-warning" role="alert">
              This Markdown has an unmatched backtick (<code>`</code>). A missing
              backtick moves the inline-code formatting to the wrong words. Check
              the text, or press “Insert anyway” to import it literally.
            </p>
          )}
        </div>

        <div className="markdown-import-footer">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="material-symbols-outlined">folder_open</span>
            Choose file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain"
            onChange={handleFile}
            hidden
          />
          <span className="markdown-import-footer-spacer" />
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => submit(text, 'Markdown')}
            disabled={!canInsert}
          >
            {showBacktickWarning ? 'Insert anyway' : 'Insert'}
          </button>
        </div>
      </div>
    </div>
  );
}
