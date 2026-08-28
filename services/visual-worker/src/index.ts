import puppeteer from '@cloudflare/puppeteer';

type Env = { BROWSER: Fetcher; CONTROL_PLANE_TOKEN: string };
type Input = { organizationId: string; projectId: string; requestId: string; url: string; selector: string; width?: number; height?: number; baselineSha256?: string };
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
      const sha256 = hex(await crypto.subtle.digest('SHA-256', encoder.encode(screenshot)));
      const accessibility = await page.accessibility.snapshot({ root: element });
      return Response.json({ url: target, selector: input.selector, viewport: { width, height }, metadata, screenshot: { mediaType: 'image/png', base64: screenshot, sha256 }, visualDiff: input.baselineSha256 ? { exactMatch: input.baselineSha256 === sha256, baselineSha256: input.baselineSha256, currentSha256: sha256 } : null, accessibility });
    } finally { await browser.close(); }
  },
} satisfies ExportedHandler<Env>;
