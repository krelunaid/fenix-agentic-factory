import puppeteer from '@cloudflare/puppeteer';

type Env = { BROWSER: Fetcher; CONTROL_PLANE_TOKEN: string };
type Input = { organizationId: string; projectId: string; requestId: string; url: string; selector: string; width?: number; height?: number; baselineSha256?: string; baselineBase64?: string };
const encoder = new TextEncoder();
const idPattern = /^[a-zA-Z0-9_-]{1,96}$/;

function hex(value: ArrayBuffer) { return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
async function authorized(request: Request, body: string, secret: string) {
  const timestamp = request.headers.get('x-fenix-timestamp');
  const provided = request.headers.get('x-fenix-signature');
  if (!timestamp || !provided || !/^v1=[a-f0-9]{64}$/.test(provided) || Math.abs(Date.now() - Number(timestamp)) > 60_000) return false;
  const bodyHash = hex(await crypto.subtle.digest('SHA-256', encoder.encode(body)));
  const canonical = `${request.method}\n${new URL(request.url).pathname}\n${timestamp}\n${bodyHash}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(provided.slice(3).match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(canonical));
}
function isBlockedAddress(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host.includes(':')) {
    return host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || /^fe[89ab]/.test(host) || host.startsWith('::ffff:');
  }
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const octets = host.split('.').map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) || a >= 224;
}
function safeTarget(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || isBlockedAddress(url.hostname)) throw new Error('unsafe_target');
  return url.toString();
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return Response.json({ ok: true, service: 'fenix-visual-worker' });
    if (request.method !== 'POST' || url.pathname !== '/v1/inspect') return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await request.text();
    if (!env.CONTROL_PLANE_TOKEN || !await authorized(request, body, env.CONTROL_PLANE_TOKEN)) return Response.json({ error: 'unauthorized' }, { status: 401 });
    let input: Input;
    try { input = JSON.parse(body) as Input; } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
    if (![input.organizationId, input.projectId, input.requestId].every((value) => typeof value === 'string' && idPattern.test(value)) || typeof input.selector !== 'string' || input.selector.length < 1 || input.selector.length > 500) return Response.json({ error: 'invalid_request' }, { status: 400 });
    if (input.baselineBase64 && (input.baselineBase64.length > 1_100_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.baselineBase64))) return Response.json({ error: 'invalid_baseline' }, { status: 400 });
    let target: string;
    try { target = safeTarget(input.url); } catch { return Response.json({ error: 'unsafe_target' }, { status: 400 }); }
    const width = Math.min(Math.max(Math.round(input.width ?? 1440), 320), 1920);
    const height = Math.min(Math.max(Math.round(input.height ?? 900), 480), 1440);
    const browser = await puppeteer.launch(env.BROWSER);
    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(target, { waitUntil: 'networkidle0', timeout: 30_000 });
      const element = await page.$(input.selector);
      if (!element) return Response.json({ error: 'selector_not_found' }, { status: 404 });
      const metadata = await element.evaluate((node) => {
        const element = node as HTMLElement;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const path: string[] = [];
        let cursor: Element | null = element;
        while (cursor && path.length < 12) {
          const siblingIndex = cursor.parentElement ? [...cursor.parentElement.children].indexOf(cursor) + 1 : 1;
          path.unshift(`${cursor.tagName.toLowerCase()}:nth-child(${siblingIndex})`);
          cursor = cursor.parentElement;
        }
        return { box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, domPath: path.join(' > '), text: (element.innerText || '').slice(0, 2_000), html: element.outerHTML.slice(0, 10_000), source: { path: element.dataset.sourcePath ?? null, line: Number(element.dataset.sourceLine) || null }, styles: { color: style.color, backgroundColor: style.backgroundColor, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, borderRadius: style.borderRadius } };
      });
      const screenshot = await element.screenshot({ encoding: 'base64', type: 'png' }) as string;
      const screenshotBytes = Uint8Array.from(atob(screenshot), (character) => character.charCodeAt(0));
      const sha256 = hex(await crypto.subtle.digest('SHA-256', screenshotBytes));
      const accessibility = await page.accessibility.snapshot({ root: element });
      const perceptual = input.baselineBase64 ? await page.evaluate(async ({ baseline, current }) => {
        const load = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = `data:image/png;base64,${source}`; });
        const [before, after] = await Promise.all([load(baseline), load(current)]);
        if (before.width > 4000 || before.height > 4000 || after.width > 4000 || after.height > 4000) throw new Error('baseline_dimensions_exceeded');
        const width = Math.max(before.width, after.width); const height = Math.max(before.height, after.height);
        const render = (image: HTMLImageElement) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('canvas_unavailable'); context.drawImage(image, 0, 0); return context.getImageData(0, 0, width, height).data; };
        const a = render(before); const b = render(after); const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / 250_000)));
        let sampled = 0; let mismatched = 0; let deltaTotal = 0;
        for (let y = 0; y < height; y += stride) for (let x = 0; x < width; x += stride) { const offset = (y * width + x) * 4; const delta = Math.abs(a[offset] - b[offset]) + Math.abs(a[offset + 1] - b[offset + 1]) + Math.abs(a[offset + 2] - b[offset + 2]) + Math.abs(a[offset + 3] - b[offset + 3]); sampled++; deltaTotal += delta; if (delta > 48) mismatched++; }
        return { mismatchRatio: sampled ? mismatched / sampled : 0, meanChannelDelta: sampled ? deltaTotal / (sampled * 4 * 255) : 0, sampledPixels: sampled, baselineSize: { width: before.width, height: before.height }, currentSize: { width: after.width, height: after.height } };
      }, { baseline: input.baselineBase64, current: screenshot }) : null;
      return Response.json({ url: target, selector: input.selector, viewport: { width, height }, metadata, screenshot: { mediaType: 'image/png', base64: screenshot, sha256 }, visualDiff: input.baselineSha256 ? { exactMatch: input.baselineSha256 === sha256, baselineSha256: input.baselineSha256, currentSha256: sha256, perceptual } : null, accessibility });
    } finally { await browser.close(); }
  },
} satisfies ExportedHandler<Env>;
