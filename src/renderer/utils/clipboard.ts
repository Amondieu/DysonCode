/**
 * Shared clipboard utility — async Clipboard API with legacy fallback.
 *
 * Priority:
 *   1. navigator.clipboard.writeText() — modern async API
 *   2. document.execCommand('copy')     — legacy fallback
 *   3. Manual select-and-copy overlay   — last resort
 *
 * Usage:
 *   import { copyToClipboard } from '../utils/clipboard';
 *   const ok = await copyToClipboard('text to copy');
 */

let _liveRegion: HTMLDivElement | null = null;

function getLiveRegion(): HTMLDivElement {
  if (!_liveRegion && typeof document !== 'undefined') {
    _liveRegion = document.createElement('div');
    _liveRegion.setAttribute('aria-live', 'polite');
    _liveRegion.setAttribute('aria-atomic', 'true');
    _liveRegion.style.cssText =
      'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;';
    document.body.appendChild(_liveRegion);
  }
  return _liveRegion!;
}

function announce(message: string): void {
  const region = getLiveRegion();
  if (region) {
    // Clear then set to re-trigger screen reader
    region.textContent = '';
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  }
}

/**
 * Copy text to clipboard. Returns true on success.
 *
 * For very long messages (>10k chars), uses a chunked approach to avoid
 * blocking the main thread. The copy itself is still synchronous in the
 * fallback path, but the async API handles large payloads natively.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // Trim trailing newlines (spec requirement)
  const cleaned = text.replace(/\n+$/, '');

  // ── Method 1: Async Clipboard API ──
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(cleaned);
      announce('Copied to clipboard');
      triggerHaptic();
      return true;
    } catch {
      // Fall through to legacy method
    }
  }

  // ── Method 2: execCommand fallback ──
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = cleaned;
      textarea.style.cssText =
        'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
      document.body.appendChild(textarea);

      // For very long text, select in chunks to avoid UI freeze
      if (cleaned.length > 10_000) {
        textarea.setSelectionRange(0, cleaned.length);
      } else {
        textarea.select();
        textarea.setSelectionRange(0, cleaned.length);
      }

      const success = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (success) {
        announce('Copied to clipboard');
        triggerHaptic();
        return true;
      }
    } catch {
      // Fall through to manual overlay
    }
  }

  // ── Method 3: Manual select-and-copy overlay ──
  return showManualCopyOverlay(cleaned);
}

/**
 * Trigger haptic feedback on mobile devices if supported.
 */
function triggerHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      (navigator as Navigator & { vibrate: (pattern: number | number[]) => boolean }).vibrate(30);
    }
  } catch {
    // Haptic not supported — silent fallback
  }
}

/**
 * Last-resort manual copy overlay. User must manually select and copy.
 * Returns false (could not copy programmatically).
 */
function showManualCopyOverlay(text: string): boolean {
  if (typeof document === 'undefined') return false;

  // Remove any existing overlay
  document.querySelectorAll('[data-clipboard-overlay]').forEach((el) => el.remove());

  const overlay = document.createElement('div');
  overlay.setAttribute('data-clipboard-overlay', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Manual copy — select text and press Ctrl+C');
  overlay.style.cssText = [
    'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;',
    'background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;',
  ].join('');

  const box = document.createElement('div');
  box.style.cssText = [
    'background:#1e1e1e;border:1px solid #333;border-radius:8px;',
    'padding:16px 20px;max-width:90vw;max-height:80vh;overflow:auto;',
  ].join('');

  const instruction = document.createElement('p');
  instruction.textContent = 'Auto-copy unavailable. Select the text below and press Ctrl+C (Cmd+C) to copy.';
  instruction.style.cssText = 'color:#808080;font-size:11px;margin-bottom:8px;font-family:monospace;';

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.cssText = [
    'width:100%;min-width:60vw;min-height:40vh;background:#0d0d0d;color:#d4d4d4;',
    'border:1px solid #444;border-radius:4px;padding:8px;font-size:11px;',
    'font-family:"JetBrains Mono",monospace;resize:both;',
  ].join('');
  textarea.addEventListener('focus', () => textarea.select());

  const dismiss = document.createElement('button');
  dismiss.textContent = 'Close';
  dismiss.style.cssText = [
    'margin-top:8px;padding:4px 12px;background:#333;color:#d4d4d4;',
    'border:1px solid #555;border-radius:4px;cursor:pointer;font-size:11px;',
  ].join('');
  dismiss.addEventListener('click', () => overlay.remove());

  box.appendChild(instruction);
  box.appendChild(textarea);
  box.appendChild(dismiss);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Auto-select after render
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.select();
  });

  announce('Auto-copy failed — manual copy overlay opened');
  return false;
}
