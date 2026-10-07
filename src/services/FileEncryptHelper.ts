import MeldEncrypt from "../main.ts";
import { TFile, TextFileView } from "obsidian";
import { FileDataHelper, JsonFileEncoding } from "./FileDataHelper.ts";
import { Utils } from "./Utils.ts";
import { ENCRYPTED_FILE_EXTENSION_DEFAULT } from "./Constants.ts";
import { EncryptedMarkdownView } from "../features/feature-whole-note-encrypt/EncryptedMarkdownView.ts";

/**
 * Shared single-file encrypt/decrypt primitives reused by both the
 * single-note convert feature and the folder-bulk feature.
 *
 * All cryptography is keyed with the local OpenSSH Ed25519 seed — there are
 * no passwords anywhere in this pipeline.
 */
export class FileEncryptHelper {

	/**
	 * Encrypt a plain .md file, returning the encoded encrypted file content.
	 */
	static async encryptFile(
		plugin: MeldEncrypt,
		file: TFile,
		content?: string
	): Promise<string> {
		// content may be passed in when the note is still only in an editor buffer
		const plainText = content ?? await plugin.app.vault.read(file);
		const encryptedData = await FileDataHelper.encrypt(plainText);
		return JsonFileEncoding.encode(encryptedData);
	}

	/**
	 * Decrypt an encrypted file. Returns null when the SSH key is unavailable
	 * or the file cannot be decrypted.
	 */
	static async decryptFile(plugin: MeldEncrypt, file: TFile): Promise<string | null> {
		const encryptedFileContent = await plugin.app.vault.read(file);
		const encryptedData = JsonFileEncoding.decode(encryptedFileContent);
		return await FileDataHelper.decrypt(encryptedData);
	}

	/**
	 * Rename the file to the target extension and write the new content.
	 * Reopens the file if it was open.
	 */
	static async closeUpdateThenReopen(
		plugin: MeldEncrypt,
		file: TFile,
		newFileExtension: string,
		content: string
	): Promise<void> {
		let didDetach = false;

		plugin.app.workspace.iterateAllLeaves(l => {
			if (l.view instanceof TextFileView && l.view.file == file) {
				if (l.view instanceof EncryptedMarkdownView) {
					l.view.detachSafely();
				} else {
					l.detach();
				}
				didDetach = true;
			}
		});

		try {
			const newFilepath = Utils.getFilePathWithNewExtension(file, newFileExtension);
			await plugin.app.fileManager.renameFile(file, newFilepath);
			await plugin.app.vault.modify(file, content);
		} finally {
			if (didDetach) {
				await plugin.app.workspace.getLeaf(true).openFile(file);
			}
		}
	}

	/**
	 * Determine the effective encrypted extension for a freshly encrypted file.
	 */
	static get defaultEncryptedExtension(): string {
		return ENCRYPTED_FILE_EXTENSION_DEFAULT;
	}
}
