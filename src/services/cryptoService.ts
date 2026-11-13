import { EncryptedVaultRecord, LumaDataSnapshot } from '@/src/types/luma';

const PBKDF2_ITERATIONS = 310_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isWebCryptoSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.crypto !== 'undefined' &&
    typeof window.crypto.subtle !== 'undefined'
  );
}

export async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  if (!isWebCryptoSupported()) {
    throw new Error('Web Crypto API is not available in this browser.');
  }
  const encoder = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSnapshotWithPassphrase(
  snapshot: LumaDataSnapshot,
  passphrase: string
): Promise<{ record: EncryptedVaultRecord; key: CryptoKey; salt: Uint8Array<ArrayBuffer> }> {
  if (!isWebCryptoSupported()) {
    throw new Error('Web Crypto API is not available in this browser.');
  }
  const saltBuffer = new ArrayBuffer(16);
  const salt = new Uint8Array(saltBuffer);
  window.crypto.getRandomValues(salt);

  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);
  const record = await encryptSnapshotWithKey(snapshot, key, salt, PBKDF2_ITERATIONS);
  return { record, key, salt };
}

export async function encryptSnapshotWithKey(
  snapshot: LumaDataSnapshot,
  key: CryptoKey,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS
): Promise<EncryptedVaultRecord> {
  const ivBuffer = new ArrayBuffer(12);
  const iv = new Uint8Array(ivBuffer);
  window.crypto.getRandomValues(iv);

  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(snapshot));

  const ciphertextBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  return {
    id: 'vault',
    encrypted: true,
    version: 1,
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertextBuf)),
    updatedAt: new Date().toISOString(),
  };
}

export async function decryptVaultRecord(
  record: EncryptedVaultRecord,
  passphrase: string
): Promise<{ snapshot: LumaDataSnapshot; key: CryptoKey; salt: Uint8Array<ArrayBuffer> }> {
  if (!isWebCryptoSupported()) {
    throw new Error('Web Crypto API is not available in this browser.');
  }
  const salt = fromBase64(record.salt);
  const iv = fromBase64(record.iv);
  const ciphertext = fromBase64(record.ciphertext);

  const key = await deriveAesKey(passphrase, salt, record.iterations || PBKDF2_ITERATIONS);

  try {
    const plaintextBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    const decoded = new TextDecoder().decode(plaintextBuf);
    const parsed = JSON.parse(decoded) as LumaDataSnapshot;
    return { snapshot: parsed, key, salt };
  } catch {
    throw new Error('Incorrect passphrase or corrupted encrypted vault.');
  }
}
