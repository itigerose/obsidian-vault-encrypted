export class Decryptable{
	/** Ciphertext format marker (metadata only — decryption does not branch on it). */
	version: string = '2.12.3.1';
	base64CipherText:string;
	/** Legacy password hint; always empty now, kept for old in-memory data. */
	hint?: string;
	showInReadingView: boolean;
	/** Visible plaintext shown to the user in reading/LP view (new encrypt(...) format only). */
	visibleText?: string;
}