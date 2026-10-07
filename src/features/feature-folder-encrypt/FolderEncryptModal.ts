import { App, Modal, Notice, Setting, TFolder } from "obsidian";
import MeldEncrypt from "../../main.ts";
import { t, tSshKeyError } from "../../i18n";
import { FolderBulkService, IFolderBulkResult } from "./FolderBulkService.ts";
import { FolderMarkService } from "./FolderMarkService.ts";
import { EncryptedIconService } from "../../services/EncryptedIconService.ts";
import { SshKeyService } from "../../services/SshKeyService.ts";

export type FolderEncryptMode = "encrypt" | "decrypt";

/**
 * Modal that lets the user confirm a folder bulk operation, then runs it.
 * The mode (encrypt / decrypt) is decided by the menu entry that opened
 * this modal — there is no in-dialog mode switch.
 *
 * Since v3 encryption is keyed with the local OpenSSH Ed25519 key, so there
 * is no password input — only a folder summary and a run button.
 */
export class FolderEncryptModal extends Modal {

	private readonly mode: FolderEncryptMode;
	private folderPath: string;
	private recursive: boolean;
	private running = false;
	private readonly plugin: MeldEncrypt;

	constructor(app: App, plugin: MeldEncrypt, folderPath: string, mode: FolderEncryptMode) {
		super(app);
		this.plugin = plugin;
		this.folderPath = folderPath;
		this.mode = mode;
		this.recursive = plugin.pluginSettings.featureFolderEncrypt?.recursive ?? true;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		const isEncrypt = this.mode === "encrypt";

		contentEl.createEl("h2", { text: t(isEncrypt ? "modal.folderEncrypt.titleEncrypt" : "modal.folderEncrypt.titleDecrypt") });

		// Folder path (read-only plain text — no setting row, not editable)
		contentEl.createEl("p", {
			text: this.folderPath === "" ? "/" : this.folderPath,
			cls: "ve-folder-path-text"
		});

		contentEl.createEl("p", { text: t("modal.folderEncrypt.sshKeyNote"), cls: "ve-folder-path-text" });

		// Recursion is driven by the plugin setting
		// (settings.folderEncrypt.recursive) — see FeatureFolderEncrypt.

		// Run / Cancel buttons
		new Setting(contentEl)
			.addButton(button => button
				.setButtonText(t("modal.folderEncrypt.run"))
				.setCta()
				.onClick(() => void this.run())
			)
			.addButton(button => button
				.setButtonText(t("modal.folderEncrypt.cancel"))
				.onClick(() => this.close())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async run(): Promise<void> {
		if (this.running) {
			return;
		}

		const isEncrypt = this.mode === "encrypt";

		if ( !(await SshKeyService.isAvailable()) ){
			new Notice(tSshKeyError(SshKeyService.lastErrorMessage), 10000);
			return;
		}

		const abstractFile = this.app.vault.getAbstractFileByPath(this.folderPath);
		if (!(abstractFile instanceof TFolder)) {
			new Notice(t("notice.folderNotFound"), 10000);
			return;
		}

		const files = isEncrypt
			? FolderBulkService.collectPlainNotes(abstractFile, this.recursive)
			: FolderBulkService.collectEncryptedNotes(abstractFile, this.recursive);
		if (files.length === 0) {
			new Notice(t("notice.folderNoMatchingFiles"), 8000);
			return;
		}

		this.running = true;
		this.contentEl.empty();
		this.contentEl.createEl("h2", { text: t("modal.folderEncrypt.processing") });

		const summaryEl = this.contentEl.createEl("pre", {
			text: t("modal.folderEncrypt.progress", { done: "0", total: files.length.toString() }),
			cls: "meld-encrypt-pre-wrap"
		});

		let result: IFolderBulkResult = { succeeded: 0, skipped: 0, failed: 0, failedFiles: [] };

		const onProgress = (res: IFolderBulkResult, done: number, total: number) => {
			result = res;
			summaryEl.setText(
				t("modal.folderEncrypt.progress", { done: done.toString(), total: total.toString() })
				+ "\n" + t("modal.folderEncrypt.summary", {
					succeeded: res.succeeded.toString(),
					skipped: res.skipped.toString(),
					failed: res.failed.toString()
				})
			);
		};

		result = isEncrypt
			? await FolderBulkService.encrypt(this.plugin, abstractFile, this.recursive, onProgress)
			: await FolderBulkService.decrypt(this.plugin, abstractFile, this.recursive, onProgress);

		this.running = false;

		// A folder that now contains encrypted files carries the "encrypted"
		// mark: new notes are auto-encrypted and the file explorer shows the
		// lock icon. Without this the folder icon would stay unchanged after
		// a bulk encrypt (the decrypt branch below removes the mark again).
		if (isEncrypt && result.succeeded > 0) {
			const normalizedPath = FolderMarkService.normalizeFolderPath(this.folderPath);
			const wasMarked = FolderMarkService.isMarked(normalizedPath);
			FolderMarkService.addMark({
				path: normalizedPath,
				recursive: this.recursive
			});
			await this.plugin.saveSettings();
			EncryptedIconService.refresh();
			if (!wasMarked) {
				new Notice(t("notice.folderMarked", { path: normalizedPath }));
			}
		}

		// A fully decrypted folder becomes a normal folder again: drop its
		// encrypted-folder mark (if any) so new notes are no longer
		// auto-encrypted and the lock icon disappears. Partial failures keep
		// the mark — the folder still contains encrypted files.
		if (!isEncrypt && result.succeeded > 0 && result.failed === 0) {
			if (FolderMarkService.removeMark(this.folderPath)) {
				await this.plugin.saveSettings();
				EncryptedIconService.refresh();
				new Notice(t("notice.folderUnmarked", {
					path: FolderMarkService.normalizeFolderPath(this.folderPath)
				}));
			}
		}

		// Final summary notice
		new Notice(t("notice.folderEncryptSummary", {
			succeeded: result.succeeded.toString(),
			skipped: result.skipped.toString(),
			failed: result.failed.toString()
		}), 15000);

		if (result.failed > 0) {
			this.contentEl.createEl("h3", { text: t("modal.folderEncrypt.failedListTitle") });
			this.contentEl.createEl("pre", {
				text: result.failedFiles.join("\n"),
				cls: "meld-encrypt-pre-wrap"
			});
		}

		new Setting(this.contentEl)
			.addButton(button => button
				.setButtonText(t("modal.folderEncrypt.done"))
				.setCta()
				.onClick(() => this.close())
			);
	}

}
