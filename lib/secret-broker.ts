const encoder = new TextEncoder();

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toBase64(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function keyFromMaster(masterKey: string) {
  const raw = fromBase64(masterKey);
  if (raw.byteLength !== 32) throw new Error('invalid_credentials_master_key');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(masterKey: string, plaintext: string, context: string) {
  if (!plaintext || plaintext.length > 20_000) throw new Error('invalid_secret');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context), tagLength: 128 }, await keyFromMaster(masterKey), encoder.encode(plaintext));
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv) };
}

export async function decryptSecret(masterKey: string, ciphertext: string, iv: string, context: string) {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv), additionalData: encoder.encode(context), tagLength: 128 }, await keyFromMaster(masterKey), fromBase64(ciphertext));
  return new TextDecoder().decode(plaintext);
}
