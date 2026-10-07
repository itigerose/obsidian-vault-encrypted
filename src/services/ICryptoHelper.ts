export interface ICryptoHelper{
	encryptToBase64(text: string): Promise<string>;
	decryptFromBase64(base64Encoded: string): Promise<string|null>;
}
