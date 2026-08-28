function toHex(buffer: ArrayBuffer) { return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }

export async function inspectVisualTarget(baseUrl: string, secret: string, input: { organizationId: string; projectId: string; requestId: string; url: string; selector: string; width?: number; height?: number; baselineSha256?: string }) {
  if (!/^https:\/\//.test(baseUrl) || secret.length < 32) throw new Error('invalid_visual_provider_configuration');
  const path = '/v1/inspect';
  const body = JSON.stringify(input);
  const timestamp = String(Date.now());
  const encoder = new TextEncoder();
  const bodyHash = toHex(await crypto.subtle.digest('SHA-256', encoder.encode(body)));
  const canonical = `POST\n${path}\n${timestamp}\n${bodyHash}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(canonical)));
  const response = await fetch(new URL(path, baseUrl), { method: 'POST', headers: { 'content-type': 'application/json', 'x-fenix-timestamp': timestamp, 'x-fenix-signature': `v1=${signature}` }, body });
  const result = await response.json().catch(() => ({ error: 'invalid_provider_response' })) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `visual_provider_${response.status}`);
  return result;
}
