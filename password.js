const crypto = require('crypto');

// Stored as scrypt$<salt hex>$<key hex>. Bare 64-character SHA-256 hex hashes from
// older installs are still accepted so existing logins keep working.
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return 'scrypt$' + salt.toString('hex') + '$' + crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  let expected, actual;
  const parts = stored.split('$');
  if (parts.length === 3 && parts[0] === 'scrypt' && /^[a-f0-9]+$/i.test(parts[1] + parts[2])) {
    expected = Buffer.from(parts[2], 'hex');
    actual = crypto.scryptSync(password, Buffer.from(parts[1], 'hex'), expected.length);
  } else if (/^[a-f0-9]{64}$/i.test(stored)) {
    expected = Buffer.from(stored.toLowerCase(), 'hex');
    actual = crypto.createHash('sha256').update(password).digest();
  } else return false;
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { hashPassword, verifyPassword };

// `node password.js` reads a password from stdin and prints a hash for HOME_DISPLAY_ADMIN_PASSWORD_HASH.
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8').on('data', chunk => input += chunk).on('end', () => {
    const password = input.replace(/\r?\n$/, '');
    if (password.length < 12) { console.error('Password must contain at least 12 characters.'); process.exit(1); }
    console.log(hashPassword(password));
  });
}
