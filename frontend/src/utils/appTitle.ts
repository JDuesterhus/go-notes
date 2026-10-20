/**
 * Keeps the browser tab, the Electron window and the Android toolbar in sync.
 * The Electron wrapper embeds the web app in an iframe, so the title is also
 * posted to the parent page; the parent forwards it to the native window.
 */
export function setAppTitle(noteTitle?: string | null): void {
  const trimmed = noteTitle?.trim();
  const title = trimmed ? `${trimmed} - go-notes` : 'go-notes';

  if (document.title !== title) {
    document.title = title;
  }

  if (window.parent !== window) {
    window.parent.postMessage({ type: 'go-notes-title', title }, '*');
  }
}
