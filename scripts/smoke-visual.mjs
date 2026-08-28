import { createHash, createHmac } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const endpoint = process.argv[2] ?? 'https://fenix-visual-worker.krelunaid.workers.dev';
const reader = createInterface({ input: process.stdin, output: process.stderr, terminal: Boolean(process.stdin.isTTY) });
const secret = await reader.question('Control token: ');
reader.close();
if (secret.length < 32) throw new Error('invalid_control_token');

async function inspect(extra = {}) {
  const payload = { organizationId: 'smoke-org', projectId: 'smoke-project', requestId: `smoke-${Date.now()}`, url: 'https://example.com/', selector: 'h1', width: 390, height: 844, ...extra };
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const canonical = `POST\n/v1/inspect\n${timestamp}\n${bodyHash}`;
  const signature = createHmac('sha256', secret).update(canonical).digest('hex');
  const response = await fetch(new URL('/v1/inspect', endpoint), { method: 'POST', headers: { 'content-type': 'application/json', 'x-fenix-timestamp': timestamp, 'x-fenix-signature': `v1=${signature}` }, body });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}:${result.error ?? 'visual_smoke_failed'}`);
  return result;
}

const baseline = await inspect();
const compared = await inspect({ baselineSha256: baseline.screenshot.sha256, baselineBase64: baseline.screenshot.base64 });
console.log(JSON.stringify({ status: 'passed', selector: compared.selector, exactMatch: compared.visualDiff?.exactMatch, mismatchRatio: compared.visualDiff?.perceptual?.mismatchRatio, sampledPixels: compared.visualDiff?.perceptual?.sampledPixels, screenshotSha256: compared.screenshot.sha256 }));
