import { Decryptable } from "../features/feature-inplace-encrypt/Decryptable.ts";
import { FeatureInplaceTextAnalysis } from "../features/feature-inplace-encrypt/featureInplaceTextAnalysis.ts";
import { CryptoHelperFactory } from "../services/CryptoHelperFactory.ts";
import { JsonFileEncoding } from "../services/FileDataHelper.ts";
import { SshKeyService } from "../services/SshKeyService.ts";

/**
 * Offline (browser) decrypt helper.
 *
 * Since v3 there are no passwords: the user must supply their OpenSSH
 * Ed25519 *private key file* (the unencrypted `id_ed25519`) via
 * `setKeyFile`, then `decrypt` handles whole-note JSON envelopes, inline
 * markers and raw base64 payloads.
 */
export class OfflineDecrypt {

	/**
	 * Load an OpenSSH private key file (PEM text). Returns true on success.
	 */
	public async setKeyFile( content: string ) : Promise<boolean> {
		const begin = '-----BEGIN OPENSSH PRIVATE KEY-----';
		const end = '-----END OPENSSH PRIVATE KEY-----';
		const startIdx = content.indexOf(begin);
		const endIdx = content.indexOf(end);
		if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
			return false;
		}
		const base64 = content.substring(startIdx + begin.length, endIdx).replace(/\s+/g, '');

		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}

		SshKeyService.setKeyBytes(bytes);
		return await SshKeyService.isAvailable();
	}

	public get lastError(): string {
		return SshKeyService.lastErrorMessage;
	}

	public async decrypt( content:string ) : Promise<string | null> {

		if ( !(await SshKeyService.isAvailable()) ){
			return null;
		}

		// Trying whole note feature decryption
		console.info( 'Trying whole note feature decryption' );
		try{
			const fileData = JsonFileEncoding.decode( content );
			const chFd = CryptoHelperFactory.BuildFromFileDataOrNull( fileData );
			if (chFd != null){
				const resultFd = await chFd.decryptFromBase64( fileData.encodedData );
				if ( resultFd != null ){
					return resultFd;
				}
			}
		} catch (e){
			console.info(e);
		}

		// Trying marked inplace feature decryption
		console.info( 'Trying marked inplace feature decryption' );
		const ta = new FeatureInplaceTextAnalysis( content );
		if ( ta.decryptable != null ){
			const ch = CryptoHelperFactory.BuildFromDecryptableOrNull(ta.decryptable);
			if (ch != null){
				const result = await ch.decryptFromBase64( ta.decryptable.base64CipherText );
				if ( result != null ){
					return result;
				}
			}
		}

		// Trying non-marked inplace feature decryption (current version only)
		console.info( 'Trying non-marked inplace feature decryption' );
		const decryptable : Decryptable = { version: '2.12.3.1', base64CipherText: content, showInReadingView: false };
		const ch = CryptoHelperFactory.BuildFromDecryptableOrNull(decryptable)
		const result = await ch?.decryptFromBase64( decryptable.base64CipherText );
		if ( result != null ){
			return result;
		}

		return null;
	}
}
declare global {
    interface Window { $: OfflineDecrypt; }
}

window.$ = new OfflineDecrypt();
