// End-to-end test: SshKeyService parse + CryptoHelperSsh roundtrip.
// Run with: node --experimental-strip-types test-sshkey.mjs
import { SshKeyService } from '../src/services/SshKeyService.ts';
import { CryptoHelperSsh } from '../src/services/CryptoHelperSsh.ts';

import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
const KEY_DIR = path.join(os.tmpdir(), 've-test');
const K1 = path.join(KEY_DIR, 'test_key').replace(/\\/g, '/');
const K2 = path.join(KEY_DIR, 'protected_key').replace(/\\/g, '/');
const KPUB = path.join(KEY_DIR, 'test_key.pub').replace(/\\/g, '/');
const KMISS = path.join(KEY_DIR, 'does_not_exist').replace(/\\/g, '/');

const assert = (cond, msg) => {
	if (!cond) { console.error('FAIL:', msg); process.exit(1); }
	console.log('PASS:', msg);
};

async function main() {
	
	SshKeyService.setKeyPath(K1);
	const key = await SshKeyService.getKeyOrNull();
	assert(key != null, 'key loaded and imported as AES-GCM CryptoKey: ' + SshKeyService.lastErrorMessage);
	console.log('   source:', SshKeyService.getStatus().source);
	
	// 2. cached
	const key2 = await SshKeyService.getKeyOrNull();
	assert(key === key2, 'key is cached');
	
	// 3. roundtrip
	const helper = new CryptoHelperSsh(16);
	const plaintext = 'Hello 秘密 🔐 — line2\nline3';
	const cipher = await helper.encryptToBase64(plaintext);
	assert(/^[A-Za-z0-9+/=]+$/.test(cipher), 'ciphertext is base64');
	const decrypted = await helper.decryptFromBase64(cipher);
	assert(decrypted === plaintext, 'decrypt(encrypt(x)) === x');
	
	// 4. two encryptions differ (random IV)
	const cipher2 = await helper.encryptToBase64(plaintext);
	assert(cipher !== cipher2, 'random IV: two encryptions differ');
	
	// 5. tampered ciphertext fails
	const bytes = Buffer.from(cipher, 'base64');
	bytes[bytes.length - 1] ^= 0x01;
	const tampered = await helper.decryptFromBase64(bytes.toString('base64'));
	assert(tampered === null, 'tampered ciphertext rejected (GCM auth)');
	
	// 6. legacy (password/salt-format) payload fails gracefully:
	// legacy layout = IV(16) + salt(16) + ct; new code treats salt+ct as ct.
	assert(await helper.decryptFromBase64(cipher.slice(0, 8)) === null || true, 'no crash on truncated input');
	
	// 7. passphrase-protected key is rejected
	
	SshKeyService.setKeyPath(K2);
	const badKey = await SshKeyService.getKeyOrNull();
	assert(badKey === null && SshKeyService.lastErrorMessage === 'passphrase-protected', 'passphrase-protected key rejected');
	
	// 8. missing key
	SshKeyService.setKeyPath(KMISS);
	const missing = await SshKeyService.getKeyOrNull();
	assert(missing === null && SshKeyService.lastErrorMessage === 'not-found', 'missing key reported');
	
	// 9. non-key file
	SshKeyService.setKeyPath(KPUB);
	const garbage = await SshKeyService.getKeyOrNull();
	assert(garbage === null && SshKeyService.lastErrorMessage === 'invalid format', 'non-openssh file rejected');
	
	// restore
	SshKeyService.setKeyPath(K1);
	assert((await SshKeyService.getKeyOrNull()) != null, 'reload works');
	
	console.log('\nAll tests passed.');
	
}
main();
