import { App, Modal, Notice, Setting, TFolder } from "obsidian";
import MeldEncrypt from "../../main.ts";
import { t, tSshKeyError } from "../../i18n";
import { FolderBulkService } from "./FolderBulkService.ts";
import { FolderMarkService } from "./FolderMarkService.ts";
import { SshKeyService } from "../../services/SshKeyService.ts";

/**
 * Dialog shown when a folder is flagged as "encrypted".
 *
 * Asks only whether the notes already living in the folder should be
 * encrypted right away — there is no password, since encryption is keyed
 * with the local OpenSSH Ed25519 key.
 */
export class MarkFolderModal extends Modal {

	private readonly plugin: MeldEncrypt;
	private folderPath: string;
	private recursive: boolean;
	private encryptExisting = true;

	constructor(app: App, plugin: MeldEncrypt, folderPath: string) {
		super(app);
		this.plugin = plugin;
		this.folderPath = FolderMarkService.normalizeFolderPath(folderPath);
		this.recursive = plugin.pluginSettings.featureFolderEncrypt?.recursive ?? true;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: t("modal.markFolder.title") });
		contentEl.createEl("p", { text: t("modal.markFolder.desc") });

		// Folder path (read-only plain text — no setting row, not editable)
		contentEl.createEl("p", {
			text: this.folderPath === "" ? "/" : this.folderPath,
			cls: "ve-folder-path-text"
		});

		// Recursion is driven by the plugin setting
		// (settings.folderEncrypt.recursive) — see FeatureFolderEncrypt.

		// Encrypt notes that are already in the folder
		new Setting(contentEl)
			.setName(t("modal.markFolder.encryptExisting"))
			.setDesc(t("modal.markFolder.encryptExistingDesc"))
			.addToggle(toggle => toggle
				.setValue(this.encryptExisting)
				.onChange(value => {
					this.encryptExisting = value;
				})
			);

		// Buttons
		new Setting(contentEl)
			.addButton(button => button
				.setButtonText(t("modal.markFolder.confirm"))
				.setCta()
				.onClick(() => this.confirm())
			)
			.addButton(button => button
				.setButtonText(t("modal.folderEncrypt.cancel"))
				.onClick(() => this.close())
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private confirm(): void {
		const folderPath = this.folderPath;

		this.close();

		void this.commit(folderPath, this.recursive, this.encryptExisting);
	}

	private async commit(
		folderPath: string,
		recursive: boolean,
		encryptExisting: boolean
	): Promise<void> {
		FolderMarkService.addMark({ path: folderPath, recursive });
		await this.plugin.saveSettings();

		new Notice(t("notice.folderMarked", { path: folderPath }));

		if (!encryptExisting) {
			return;
		}

		if ( !(await SshKeyService.isAvailable()) ){
			new Notice(tSshKeyError(SshKeyService.lastErrorMessage), 10000);
			return;
		}

		const abstractFile = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(abstractFile instanceof TFolder)) {
			return;
		}

		const result = await FolderBulkService.encrypt(this.plugin, abstractFile, recursive);

		new Notice(t("notice.folderEncryptSummary", {
			succeeded: result.succeeded.toString(),
			skipped: result.skipped.toString(),
			failed: result.failed.toString()
		}), 15000);

		if (result.failed > 0) {
			console.error("vault-encrypt: unable to encrypt some notes", result.failedFiles);
		}
	}
}
