/**
 * Crypto utilities for VibeSDK
 * Uses Web Crypto API (available in Cloudflare Workers)
 * Encrypts/decrypts the OpenRouter API key using AES-GCM
 * Master key is derived from JWT_SECRET via PBKDF2
 */

const SALT = 'vibesdk-or-key-v1'; // Static salt — fine for single-user
const ITERATIONS = 100_000;

async function deriveKey(secret: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: enc.encode(SALT),
            iterations: ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptApiKey(plaintext: string, jwtSecret: string): Promise<string> {
    const key = await deriveKey(jwtSecret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(plaintext)
    );

    // Combine iv + encrypted, encode as base64
    const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.byteLength);

    return btoa(String.fromCharCode(...combined));
}

export async function decryptApiKey(ciphertext: string, jwtSecret: string): Promise<string> {
    const key = await deriveKey(jwtSecret);
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
    );

    return new TextDecoder().decode(decrypted);
}

export function maskApiKey(key: string): string {
    // 'sk-or-v1-abcdefgh...xyz' → 'sk-or-v1-...xyz'
    if (key.length <= 8) return '••••••••';
    return key.substring(0, 12) + '...' + key.substring(key.length - 4);
}
