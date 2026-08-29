type FenixBridgeMessage = {
  type: 'fenix:visual-select';
  selector: string;
  sourcePath?: string;
  sourceLine?: number;
  box: { x: number; y: number; width: number; height: number };
};

function selectorFor(element: Element) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement && parts.length < 6) {
    const parent: Element | null = current.parentElement;
    const siblings = parent ? Array.from(parent.children).filter((item) => item.tagName === current!.tagName) : [];
    const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
    parts.unshift(`${current.tagName.toLowerCase()}${suffix}`);
    current = parent;
  }
  return parts.join(' > ');
}

function sourceFor(element: HTMLElement) {
  const owner = element.closest<HTMLElement>('[data-fenix-source]');
  const raw = owner?.dataset.fenixSource ?? '';
  const match = raw.match(/^(.+):(\d+)$/);
  return match ? { sourcePath: match[1], sourceLine: Number(match[2]) } : {};
}

export function installFenixPreviewBridge() {
  if (window.parent === window) return () => undefined;
  let enabled = false;
  let hovered: HTMLElement | null = null;
  const clear = () => { if (hovered) hovered.style.removeProperty('outline'); hovered = null; };
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || event.data?.type !== 'fenix:visual-mode') return;
    enabled = event.data.enabled === true;
    document.documentElement.dataset.fenixVisualEdit = String(enabled);
    if (!enabled) clear();
  };
  const onPointerOver = (event: PointerEvent) => {
    if (!enabled || !(event.target instanceof HTMLElement)) return;
    clear(); hovered = event.target; hovered.style.outline = '2px solid #E36F2F'; hovered.style.outlineOffset = '2px';
  };
  const onClick = (event: MouseEvent) => {
    if (!enabled || !(event.target instanceof HTMLElement)) return;
    event.preventDefault(); event.stopPropagation();
    const rect = event.target.getBoundingClientRect();
    const message: FenixBridgeMessage = { type: 'fenix:visual-select', selector: selectorFor(event.target), ...sourceFor(event.target), box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    window.parent.postMessage(message, '*');
  };
  window.addEventListener('message', onMessage);
  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('click', onClick, true);
  window.parent.postMessage({ type: 'fenix:preview-ready', bridgeVersion: 1 }, '*');
  return () => { clear(); window.removeEventListener('message', onMessage); document.removeEventListener('pointerover', onPointerOver, true); document.removeEventListener('click', onClick, true); };
}
