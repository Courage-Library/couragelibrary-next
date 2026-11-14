/**
 * AUTH-HARDEN-1: a minimal RFC 6238 TOTP generator for the CI QA admin / staff identities (no dependency: Node crypto).
 * Supabase Auth MFA TOTP = HMAC-SHA1, 6 digits, 30 s step, base32 secret (the key the /admin/mfa page shows).
 * Never logs or returns the secret; callers must never print the code either (a code is valid for ~30 s).
 *
 *   totp(secretBase32, { time = Date.now(), step = 30, digits = 6, algorithm = 'sha1' }) → '123456'
 *   secondsLeft(time = Date.now(), step = 30) → seconds until the next code
 */
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 → Buffer (case-insensitive; spaces, dashes and '=' padding ignored). Throws on any other character. */
function base32Decode(input) {
  const clean = String(input || '').toUpperCase().replace(/[\s=-]/g, '');
  if (!clean.length) throw new Error('TOTP: empty secret');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('TOTP: secret is not base32'); // never echo the secret
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP over a raw key Buffer. */
function hotp(key, counter, digits = 6, algorithm = 'sha1') {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac(algorithm, key).update(msg).digest();
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

function totp(secretBase32, { time = Date.now(), step = 30, digits = 6, algorithm = 'sha1' } = {}) {
  return hotp(base32Decode(secretBase32), Math.floor(time / 1000 / step), digits, algorithm);
}

function secondsLeft(time = Date.now(), step = 30) {
  return step - (Math.floor(time / 1000) % step);
}

module.exports = { totp, hotp, base32Decode, secondsLeft };
