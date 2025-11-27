/**
 * CryptoUtils
 * Uses Web Crypto API for secure, standards-compliant encryption.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ITERATIONS = 100000;

// Convert string to Uint8Array
export const strToBuf = (str: string): Uint8Array => new TextEncoder().encode(str);

// Convert Uint8Array to string
export const bufToStr = (buf: Uint8Array): string => new TextDecoder().decode(buf);

// Convert buffer to Base64 string for storage
export const bufToBase64 = (buf: Uint8Array): string => {
  let binary = '';
  const len = buf.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return window.btoa(binary);
};

// Convert Base64 string to Uint8Array
export const base64ToBuf = (str: string): Uint8Array => {
  const binary = window.atob(str);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// Generate a random salt
export const generateSalt = (): Uint8Array => window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

// Derive a key from a password and salt using PBKDF2
export const deriveKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    strToBuf(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // We don't need to export the derived key
    ['encrypt', 'decrypt']
  );
};

// Encrypt text
export const encryptMessage = async (text: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> => {
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = strToBuf(text);

  const encryptedBuf = await window.crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv },
    key,
    encoded
  );

  return {
    ciphertext: bufToBase64(new Uint8Array(encryptedBuf)),
    iv: bufToBase64(iv)
  };
};

// Decrypt text
export const decryptMessage = async (ciphertextBase64: string, ivBase64: string, key: CryptoKey): Promise<string> => {
  try {
    const ciphertext = base64ToBuf(ciphertextBase64);
    const iv = base64ToBuf(ivBase64);

    const decryptedBuf = await window.crypto.subtle.decrypt(
      { name: ALGORITHM, iv: iv },
      key,
      ciphertext
    );

    return bufToStr(new Uint8Array(decryptedBuf));
  } catch (e) {
    console.error("Decryption failed", e);
    return "[Encrypted Message - Key Mismatch or Corrupted]";
  }
};