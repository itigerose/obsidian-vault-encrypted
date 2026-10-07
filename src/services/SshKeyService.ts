/**
 * Loads the user's local OpenSSH Ed25519 private key and exposes its
 * 32-byte seed as an AES-256-GCM CryptoKey.
 *
 * Key discovery order:
 *  1. An explicit override set via `setKeyBytes` (offline tools / tests).
 *  2. The well-known file `~/.ssh/id_ed25519` (desktop / Electron only).
 *
 * Only *unencrypted* OpenSSH-format keys (`-----BEGIN OPENSSH PRIVATE KEY-----`
 * with ciphername "none") are supported. Passphrase-protected keys are
 * rejected with a clear error — the whole point of this mode is that no
 * secret is ever typed into the plugin.
 */

export interface SshKeyStatus {
	/** True when the AES key has been derived from the seed. */
	loaded: boolean;
	/** Path the key was loaded from (empty when using an override). */
	source: string;
	/** Human-readable (already localized) load error, if any. */
	error: string;
}

const MAGIC = 'openssh-key-v1';
const ED25519_KEY_TYPE = 'ssh-ed25519';
const SEED_SIZE = 32;

export class SshKeyService {

	private static cachedKey: CryptoKey | null = null;

	/** Raw seed override (browser/offline tools without filesystem access). */
	private static keyBytesOverride: Uint8Array | null = null;

	/** Explicit key file path override (CLI tools), instead of ~/.ssh/id_ed25519. */
	private static keyPathOverride: string | null = null;

	/** Path the current key was loaded from (informational). */
	private static loadedFrom = '';

	/** Last load error message (already localized), for notices. */
	private static lastError = '';

	static get lastErrorMessage(): string {
		return SshKeyService.lastError;
	}

	/**
	 * Provide raw private-key bytes directly (offline tools / tests). Passing
	 * null re-enables automatic discovery from `~/.ssh/id_ed25519`.
	 */
	static setKeyBytes(bytes: Uint8Array | null): void {
		SshKeyService.keyBytesOverride = bytes;
		SshKeyService.keyPathOverride = null;
		SshKeyService.cachedKey = null;
		SshKeyService.loadedFrom = '';
		SshKeyService.lastError = '';
	}

	/**
	 * Use an explicit private-key file instead of `~/.ssh/id_ed25519`
	 * (CLI tools). Passing null re-enables automatic discovery.
	 */
	static setKeyPath(path: string | null): void {
		SshKeyService.keyBytesOverride = null;
		SshKeyService.keyPathOverride = path;
		SshKeyService.cachedKey = null;
		SshKeyService.loadedFrom = '';
		SshKeyService.lastError = '';
	}

	static getStatus(): SshKeyStatus {
		return {
			loaded: SshKeyService.cachedKey != null,
			source: SshKeyService.loadedFrom,
			error: SshKeyService.lastError
		};
	}

	/** Drop the cached CryptoKey and reload from the configured source. */
	static async reload(): Promise<void> {
		SshKeyService.cachedKey = null;
		if (SshKeyService.keyBytesOverride == null) {
			SshKeyService.loadedFrom = '';
		}
		SshKeyService.lastError = '';
		await SshKeyService.getKeyOrNull();
	}

	/** True when a usable AES key is available (loads it on first call). */
	static async isAvailable(): Promise<boolean> {
		return await SshKeyService.getKeyOrNull() != null;
	}

	/**
	 * The AES-256-GCM key derived from the Ed25519 seed, or null when the
	 * key cannot be loaded (reason in `lastError`).
	 */
	static async getKeyOrNull(): Promise<CryptoKey | null> {
		if (SshKeyService.cachedKey != null) {
			return SshKeyService.cachedKey;
		}

		const seed = SshKeyService.loadSeed();
		if (seed == null) {
			return null;
		}

		try {
			SshKeyService.cachedKey = await crypto.subtle.importKey(
				/*format*/ 'raw',
				/*keyData*/ seed,
				/*algorithm*/ 'AES-GCM',
				/*extractable*/ false,
				/*keyUsages*/ ['encrypt', 'decrypt']
			);
			SshKeyService.lastError = '';
			return SshKeyService.cachedKey;
		} catch (e) {
			console.error('vault-encrypt: unable to import SSH seed as AES key', e);
			SshKeyService.lastError = 'Unable to import the Ed25519 seed as an AES key.';
			return null;
		}
	}

	/* ------------------------------------------------------------- seed */

	/** Load + parse the private key and return the 32-byte seed. */
	private static loadSeed(): Uint8Array | null {
		const bytes = SshKeyService.loadKeyBytes();
		if (bytes == null) {
			return null;
		}

		try {
			return SshKeyService.parseOpenSshEd25519Seed(bytes);
		} catch (e) {
			console.error('vault-encrypt: unable to parse SSH private key', e);
			// only the passphrase case gets its own message; every other
			// structural problem is reported as a generic format error
			SshKeyService.lastError =
				e instanceof Error && e.message === 'passphrase-protected'
					? 'passphrase-protected'
					: 'invalid format';
			return null;
		}
	}

	/** Read the key file: bytes override, path override, then `~/.ssh/id_ed25519`. */
	private static loadKeyBytes(): Uint8Array | null {
		if (SshKeyService.keyBytesOverride != null) {
			SshKeyService.loadedFrom = '(override)';
			return SshKeyService.keyBytesOverride;
		}

		// Node (Electron desktop / CLI). On mobile there is no `require` —
		// report a clear error instead of crashing.
		let nodeRequire: ((id: string) => unknown) | null = null;
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			nodeRequire = typeof require === 'function' ? (require as any) : null;
		} catch {
			nodeRequire = null;
		}

		if (nodeRequire == null) {
			SshKeyService.lastError = 'no-node';
			return null;
		}

		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const os = nodeRequire('os') as typeof import('os');
			const path = nodeRequire('path') as typeof import('path');
			const fs = nodeRequire('fs') as typeof import('fs');

			const keyPath = SshKeyService.keyPathOverride ?? path.join(os.homedir(), '.ssh', 'id_ed25519');
			if (!fs.existsSync(keyPath)) {
				SshKeyService.lastError = 'not-found';
				return null;
			}

			const content = fs.readFileSync(keyPath, 'utf8');
			const base64 = SshKeyService.extractPemBase64(content);
			if (base64 == null) {
				SshKeyService.lastError = 'invalid format';
				return null;
			}

			SshKeyService.loadedFrom = keyPath;
			return SshKeyService.base64ToBytes(base64);
		} catch (e) {
			console.error('vault-encrypt: unable to read SSH private key', e);
			SshKeyService.lastError = 'read-failed';
			return null;
		}
	}

	/** Pull the base64 payload out of a PEM armoured private key. */
	private static extractPemBase64(content: string): string | null {
		const begin = '-----BEGIN OPENSSH PRIVATE KEY-----';
		const end = '-----END OPENSSH PRIVATE KEY-----';
		const startIdx = content.indexOf(begin);
		const endIdx = content.indexOf(end);
		if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
			return null;
		}
		return content
			.substring(startIdx + begin.length, endIdx)
			.replace(/\s+/g, '');
	}

	private static base64ToBytes(base64: string): Uint8Array {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}

	/**
	 * Parse the OpenSSH private key container and extract the Ed25519 seed
	 * (the first 32 bytes of the 64-byte `priv` field).
	 *
	 * Layout (RFC-ish, see PROTOCOL.key in the OpenSSH sources):
	 *   "openssh-key-v1\0"
	 *   string  ciphername
	 *   string  kdfname
	 *   string  kdfoptions
	 *   uint32  number of keys
	 *   string  public key
	 *   string  encrypted (or plain) private section
	 *
	 * Private section:
	 *   uint32 checkint1, uint32 checkint2 (must match)
	 *   string keytype ("ssh-ed25519")
	 *   string pub (32 bytes)
	 *   string priv (64 bytes = seed ‖ public)
	 *   string comment, padding
	 */
	private static parseOpenSshEd25519Seed(bytes: Uint8Array): Uint8Array {
		// magic
		for (let i = 0; i < MAGIC.length; i++) {
			if (bytes[i] !== MAGIC.charCodeAt(i)) {
				throw new Error('not an openssh-key-v1 private key');
			}
		}
		if (bytes[MAGIC.length] !== 0) {
			throw new Error('not an openssh-key-v1 private key');
		}

		let off = MAGIC.length + 1;

		// ciphername
		const cipher = SshKeyService.readString(bytes, off);
		off = cipher.next;
		const cipherName = new TextDecoder().decode(cipher.value);
		if (cipherName !== 'none') {
			throw new Error('passphrase-protected');
		}

		// kdfname + kdfoptions (must be "none" / empty for ciphername none)
		const kdf = SshKeyService.readString(bytes, off);
		off = kdf.next;
		const kdfOptions = SshKeyService.readString(bytes, off);
		off = kdfOptions.next;

		// number of keys
		const nkeys = SshKeyService.readUint32(bytes, off);
		off += 4;
		if (nkeys !== 1) {
			throw new Error('expected exactly one key');
		}

		// public key blob — skipped
		const pub = SshKeyService.readString(bytes, off);
		off = pub.next;
		if (pub.value.length === 0) {
			throw new Error('missing public key');
		}

		// private section
		const priv = SshKeyService.readString(bytes, off);
		const privBytes = priv.value;

		let p = 0;
		const check1 = SshKeyService.readUint32(privBytes, p); p += 4;
		const check2 = SshKeyService.readUint32(privBytes, p); p += 4;
		if (check1 !== check2) {
			throw new Error('checkint mismatch');
		}

		const keyType = SshKeyService.readString(privBytes, p); p = keyType.next;
		if (new TextDecoder().decode(keyType.value) !== ED25519_KEY_TYPE) {
			throw new Error('not an Ed25519 key');
		}

		const pubKey = SshKeyService.readString(privBytes, p); p = pubKey.next;
		if (pubKey.value.length !== SEED_SIZE) {
			throw new Error('unexpected Ed25519 public key length');
		}

		const privKey = SshKeyService.readString(privBytes, p);
		if (privKey.value.length !== SEED_SIZE * 2) {
			throw new Error('unexpected Ed25519 private key length');
		}

		// the seed is the first half: seed ‖ public
		return privKey.value.slice(0, SEED_SIZE);
	}

	private static readUint32(bytes: Uint8Array, offset: number): number {
		if (offset + 4 > bytes.length) {
			throw new Error('unexpected end of key data');
		}
		return (
			(bytes[offset] << 24)
			| (bytes[offset + 1] << 16)
			| (bytes[offset + 2] << 8)
			| bytes[offset + 3]
		) >>> 0;
	}

	private static readString(bytes: Uint8Array, offset: number): { value: Uint8Array; next: number } {
		const length = SshKeyService.readUint32(bytes, offset);
		const start = offset + 4;
		const end = start + length;
		if (end > bytes.length) {
			throw new Error('unexpected end of key data');
		}
		return { value: bytes.slice(start, end), next: end };
	}

}
