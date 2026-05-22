// =============================================================================
// Fluence Lead Scanner — Authentication (JWT + Password hashing)
// =============================================================================
// Uses Web Crypto API (available natively in Cloudflare Workers).
// No external dependencies needed.
// =============================================================================

const ALG = { name: 'HMAC', hash: 'SHA-256' };

// ---- JWT ----

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

function encode(obj) {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), ALG, false, ['sign']);
  const sig = await crypto.subtle.sign(ALG, key, new TextEncoder().encode(payload));
  return base64url(sig);
}

/**
 * Create a JWT token (valid for 7 days)
 */
export async function createToken(user, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    ...user,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  };
  const b64h = encode(header);
  const b64p = encode(payload);
  const sig = await sign(`${b64h}.${b64p}`, secret);
  return `${b64h}.${b64p}.${sig}`;
}

/**
 * Verify and decode a JWT token. Returns the payload or null.
 */
export async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [b64h, b64p, b64sig] = parts;

    // Verify signature
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), ALG, false, ['verify']);
    const valid = await crypto.subtle.verify(ALG, key, base64urlDecode(b64sig), new TextEncoder().encode(`${b64h}.${b64p}`));
    if (!valid) return null;

    // Decode payload
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(b64p)));

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ---- Password Hashing (PBKDF2) ----

async function pbkdf2(password, salt, iterations = 100000) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations, hash: 'SHA-256' },
    key, 256
  );
  return base64url(bits);
}

function randomSalt() {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return base64url(salt);
}

/**
 * Hash a password with PBKDF2 (format: pbkdf2:iterations:salt:hash)
 */
export async function hashPassword(password) {
  const salt = randomSalt();
  const hash = await pbkdf2(password, salt);
  return `pbkdf2:100000:${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash
 */
export async function verifyPassword(password, stored) {
  try {
    const parts = stored.split(':');
    if (parts[0] !== 'pbkdf2') return false;
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const expectedHash = parts[3];
    const hash = await pbkdf2(password, salt, iterations);
    return hash === expectedHash;
  } catch {
    return false;
  }
}
