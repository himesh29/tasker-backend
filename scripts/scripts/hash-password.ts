// One-off utility: run this to generate the value for SUPER_ADMIN_PASSWORD_HASH.
// Usage: npx ts-node scripts/hash-password.ts "your-chosen-password"
import * as bcrypt from 'bcrypt';

const plaintext = process.argv[2];
if (!plaintext) {
  console.error('Usage: npx ts-node scripts/hash-password.ts "your-password"');
  process.exit(1);
}

bcrypt.hash(plaintext, 12).then((hash) => {
  console.log('Add this to your .env as SUPER_ADMIN_PASSWORD_HASH:');
  console.log(hash);
});
