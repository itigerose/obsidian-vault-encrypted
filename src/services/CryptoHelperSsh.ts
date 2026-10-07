import type { ICryptoHelper } from "./ICryptoHelper.ts";
import { SshKeyService } from "./SshKeyService.ts";

/**
 * AES-256-GCM with a *raw* key: the 32-byte Ed25519 seed of the user's
 * local OpenSSH private key is used directly as the cipher key.
 *
 * Compared with the password-based schemes there is no KDF and no salt —
 * the seed already carries 128+ bits of entropy. The wire format is:
 *
 *   IV (16 bytes) ‖ AES-GCM ciphertext + tag
 *
 * Cipher text produced by the password-based versions (which embed a salt
 * after the IV) will fail GCM authentication here and return null — that is
 * intentional: this build does not support the legacy password format.
 */
export class CryptoHelperSsh implements ICryptoHelper {
	public vectorSize: number;

	constructor( vectorSize: number ){
		this.vectorSize = vectorSize;
	}

	private async encryptToBytes( text: string ): Promise<Uint8Array> {
		const key = await SshKeyService.getKeyOrNull();
		if ( key == null ){
			throw new Error( SshKeyService.lastErrorMessage || 'SSH key unavailable' );
		}

		const utf8Encoder = new TextEncoder();
		const textBytesToEncrypt = utf8Encoder.encode(text);
		const vector = crypto.getRandomValues(new Uint8Array(this.vectorSize));

		const encryptedBytes = new Uint8Array(
			await crypto.subtle.encrypt(
				/*algorithm*/ {
					name: 'AES-GCM',
					iv: vector
				},
				/*key*/ key,
				/*data*/ textBytesToEncrypt
			)
		);

		const finalBytes = new Uint8Array( vector.byteLength + encryptedBytes.byteLength );
		finalBytes.set( vector, 0 );
		finalBytes.set( encryptedBytes, vector.byteLength );

		return finalBytes;
	}

	private convertToString( bytes : Uint8Array ): string {
		let result = '';
		for (let idx = 0; idx < bytes.length; idx++) {
			result += String.fromCharCode(bytes[idx]);
		}
		return result;
	}

	public async encryptToBase64(text: string): Promise<string> {
		const finalBytes = await this.encryptToBytes(text);
		return btoa( this.convertToString(finalBytes) );
	}

	private stringToArray(str: string): Uint8Array {
		const result = [];
		for (let i = 0; i < str.length; i++) {
			result.push(str.charCodeAt(i));
		}
		return new Uint8Array(result);
	}

	private async decryptFromBytes(
		encryptedBytes: Uint8Array
	): Promise<string|null> {
		try {
			let offset: number;
			let nextOffset : number|undefined;

			// extract iv
			offset = 0;
			nextOffset = offset + this.vectorSize;
			const vector = encryptedBytes.slice(offset, nextOffset);

			// extract encrypted text
			offset = nextOffset;
			nextOffset = undefined;
			const encryptedTextBytes = encryptedBytes.slice(offset);

			const key = await SshKeyService.getKeyOrNull();
			if ( key == null ){
				return null;
			}

			const decryptedBytes = await crypto.subtle.decrypt(
				/*algorithm*/ {
					name: 'AES-GCM',
					iv: vector
				},
				/*key*/ key,
				/*data*/ encryptedTextBytes
			);

			const utf8Decoder	= new TextDecoder();
			return utf8Decoder.decode(decryptedBytes);

		} catch (e) {
			return null;
		}
	}

	public async decryptFromBase64( base64Encoded: string ): Promise<string|null> {
		try {
			const bytesToDecode = this.stringToArray(atob(base64Encoded));
			return await this.decryptFromBytes( bytesToDecode );
		} catch (e) {
			return null;
		}
	}

}
