import { Notice, Setting, TAbstractFile, TFile, TFolder, TextFileView } from "obsidian";
import MeldEncrypt from "../../main.ts";
import { t, tSshKeyError } from "../../i18n";
import { IMeldEncryptPluginSettings } from "../../settings/MeldEncryptPluginSettings.ts";
import { IMeldEncryptPluginFeature } from "../IMeldEncryptPluginFeature.ts";
import { FolderEncryptModal } from "./FolderEncryptModal.ts";
import { FolderMarkService } from "./FolderMarkService.ts";
import { IMarkedFolder } from "./IFeatureFolderEncryptSettings.ts";
import { FolderBulkService } from "./FolderBulkService.ts";
import { MarkFolderModal } from "./MarkFolderModal.ts";
import { EncryptedIconService } from "../../services/EncryptedIconService.ts";
import { ENCRYPTED_FILE_EXTENSION_DEFAULT } from "../../services/Constants.ts";
import { FileEncryptHelper } from "../../services/FileEncryptHelper.ts";
import { SshKeyService } from "../../services/SshKeyService.ts";

/** Give templates and "new note" flows a moment to write their content. */
const AUTO_ENCRYPT_DELAY_MS = 250;

export default class FeatureFolderEncrypt implements IMeldEncryptPluginFeature {

	plugin!: MeldEncrypt;
	featureSettings!: IMeldEncryptPluginSettings["featureFolderEncrypt"];

	/** Paths currently being encrypted, to avoid handling our own file renames. */
	private readonly inFlight = new Set<string>();

	async onload(plugin: MeldEncrypt, settings: IMeldEncryptPluginSettings) {
		this.plugin = plugin;
		this.featureSettings = settings.featureFolderEncrypt;
		FolderMarkService.bind(this.featureSettings.markedFolders);

		// a folder row gets the lock icon when it is marked itself OR lives
		// inside a recursively marked folder (its notes get encrypted too)
		EncryptedIconService.start(plugin, folderPath => FolderMarkService.findMarkForParentPath(folderPath) != null);

		this.registerFolderMenu();
		this.registerCommands();
		this.registerVaultEvents();
	}

	onunload(): void {
		EncryptedIconService.stop();
		this.inFlight.clear();
	}

	/* ------------------------------------------------------------------ menu */

	private registerFolderMenu(): void {
		// Right-click a folder in the file explorer.
		//
		// We hook BOTH `folder-menu` and `file-menu` because Obsidian's file
		// explorer right-click on a folder only fires `file-menu` with a
		// TFolder payload — `folder-menu` is documented but does not actually
		// trigger in the file explorer. Registering only `folder-menu` results
		// in a missing menu item, even though the code "looks right".
		const addFolderMenuItems = (menu: any, folder: TFolder) => {
			const path = FolderMarkService.normalizeFolderPath(folder.path);
			const isEncrypted = FolderMarkService.isMarked(path);

			if (isEncrypted) {
				menu.addItem((item: any) => {
					item
						.setTitle(t("menu.decryptFolder"))
						.setIcon("key")
						.onClick(() => {
							new FolderEncryptModal(this.plugin.app, this.plugin, path, "decrypt").open();
						});
				});
			} else {
				menu.addItem((item: any) => {
					item
						.setTitle(t("menu.encryptFolder"))
						.setIcon("lock")
						.onClick(() => {
							new FolderEncryptModal(this.plugin.app, this.plugin, path, "encrypt").open();
						});
				});
			}
		};

		// folder-menu (kept for completeness; few versions actually fire this).
		this.plugin.registerEvent(
			this.plugin.app.workspace.on(
				"folder-menu" as any,
				(menu: any, folder: TFolder) => addFolderMenuItems(menu, folder)
			)
		);

		// file-menu fires for both files and folders in the file explorer;
		// only contribute menu items when the target is a folder.
		this.plugin.registerEvent(
			this.plugin.app.workspace.on(
				"file-menu",
				(menu: any, file: any) => {
					if (file instanceof TFolder) {
						addFolderMenuItems(menu, file);
					}
				}
			)
		);
	}

	/* -------------------------------------------------------------- commands */

	private registerCommands(): void {
		const currentFolderPath = (): string => {
			const file = this.plugin.app.workspace.getActiveFile();
			const parent = file?.parent;
			return parent ? parent.path : FolderMarkService.rootPath;
		};

		// Command: bulk encrypt the folder of the currently active note.
		this.plugin.addCommand({
			id: "meld-encrypt-folder-encrypt",
			name: t("command.folderEncrypt"),
			callback: () => {
				new FolderEncryptModal(this.plugin.app, this.plugin, currentFolderPath(), "encrypt").open();
			},
		});

		this.plugin.addCommand({
			id: "meld-encrypt-folder-decrypt",
			name: t("command.folderDecrypt"),
			callback: () => {
				new FolderEncryptModal(this.plugin.app, this.plugin, currentFolderPath(), "decrypt").open();
			},
		});

		// Command: flag / un-flag the folder of the currently active note.
		this.plugin.addCommand({
			id: "meld-encrypt-toggle-mark-folder",
			name: t("command.toggleMarkFolder"),
			callback: () => {
				const path = FolderMarkService.normalizeFolderPath(currentFolderPath());
				if (FolderMarkService.isMarked(path)) {
					void this.unmarkFolder(path);
				} else {
					new MarkFolderModal(this.plugin.app, this.plugin, path).open();
				}
			},
		});
	}

	/* --------------------------------------------------------- vault events */

	private registerVaultEvents(): void {
		this.plugin.registerEvent(
			this.plugin.app.vault.on("create", (file: TAbstractFile) => {
				void this.onFileCreated(file);
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				void this.onFileRenamed(file, oldPath);
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("delete", (file: TAbstractFile) => {
				this.onFileDeleted(file);
			})
		);
	}

	private async onFileCreated(file: TAbstractFile): Promise<void> {
		if (FolderBulkService.isRunning || !(file instanceof TFile) || file.extension !== "md") {
			return;
		}

		const mark = FolderMarkService.findMarkForParentPath(FolderMarkService.getParentPath(file.path));
		if (mark == null) {
			return;
		}

		await this.encryptNote(file, mark, AUTO_ENCRYPT_DELAY_MS);
	}

	private async onFileRenamed(file: TAbstractFile, oldPath: string): Promise<void> {
		// folders: keep the marks in sync with the new path
		if (file instanceof TFolder) {
			if (FolderMarkService.renameFolder(oldPath, file.path)) {
				await this.plugin.saveSettings();
				EncryptedIconService.refresh();
			}
			return;
		}

		if (FolderBulkService.isRunning || !(file instanceof TFile) || file.extension !== "md") {
			return;
		}

		// only notes moved INTO a folder are encrypted; renaming a note that
		// already lives in the folder must not encrypt it
		const oldParent = FolderMarkService.getParentPath(oldPath);
		const newParent = FolderMarkService.getParentPath(file.path);
		if (oldParent === newParent) {
			return;
		}

		// a note moved into an encrypted folder gets encrypted too
		const mark = FolderMarkService.findMarkForParentPath(newParent);
		if (mark == null) {
			return;
		}

		await this.encryptNote(file, mark, 0);
	}

	private onFileDeleted(file: TAbstractFile): void {
		if (!(file instanceof TFolder)) {
			return;
		}
		if (FolderMarkService.removeFolder(file.path)) {
			void this.plugin.saveSettings();
			EncryptedIconService.refresh();
		}
	}

	/* -------------------------------------------------------- encrypt a note */

	private async encryptNote(file: TFile, mark: IMarkedFolder, delayMs: number): Promise<void> {
		const originalPath = file.path;
		// the TFile is renamed in place, so remember the original name for notices
		const displayName = file.name;

		if (this.inFlight.has(originalPath)) {
			return;
		}
		this.inFlight.add(originalPath);

		try {
			// let "new note" / template flows write their content first
			if (delayMs > 0) {
				await this.delay(delayMs);
			}

			if (this.plugin.app.vault.getAbstractFileByPath(file.path) == null) {
				return;
			}

			if ( !(await SshKeyService.isAvailable()) ){
				new Notice(tSshKeyError(SshKeyService.lastErrorMessage), 10000);
				return;
			}

			const content = await this.readNoteContent(file);
			const encryptedContent = await FileEncryptHelper.encryptFile(
				this.plugin,
				file,
				content
			);

			await FileEncryptHelper.closeUpdateThenReopen(
				this.plugin,
				file,
				ENCRYPTED_FILE_EXTENSION_DEFAULT,
				encryptedContent
			);

			EncryptedIconService.refresh();
			new Notice(t("notice.autoEncrypted", { name: displayName }));
		} catch (error) {
			console.error("vault-encrypt: unable to auto encrypt note", { path: originalPath, error });
			new Notice(t("notice.autoEncryptFailed", { name: displayName }), 10000);
		} finally {
			this.inFlight.delete(originalPath);
		}
	}

	/**
	 * Content of a note, preferring the in-memory editor buffer so text that
	 * has not been flushed to disk yet is encrypted as well.
	 */
	private async readNoteContent(file: TFile): Promise<string> {
		let buffer: string | null = null;
		this.plugin.app.workspace.iterateAllLeaves(leaf => {
			const view = leaf.view;
			if (view instanceof TextFileView && view.file === file) {
				buffer = view.data;
			}
		});
		return buffer ?? await this.plugin.app.vault.read(file);
	}

	/* ------------------------------------------------------- marking actions */

	private async unmarkFolder(folderPath: string): Promise<void> {
		if (!FolderMarkService.removeMark(folderPath)) {
			return;
		}
		await this.plugin.saveSettings();
		EncryptedIconService.refresh();
		new Notice(t("notice.folderUnmarked", { path: folderPath }));
	}

	private delay(ms: number): Promise<void> {
		return new Promise<void>(resolve => setTimeout(resolve, ms));
	}

	/* -------------------------------------------------------------- settings */

	buildSettingsUi(containerEl: HTMLElement, saveSettingCallback: () => Promise<void>): void {
		const sectionEl = containerEl.createDiv({ cls: "ve-folder-encrypt-settings" });

		sectionEl.createEl("h3", { text: t("settings.folderEncrypt.heading") });

		new Setting(sectionEl)
			.setName(t("settings.folderEncrypt.recursive.name"))
			.setDesc(t("settings.folderEncrypt.recursive.desc"))
			.addToggle(toggle => toggle
				.setValue(this.featureSettings.recursive)
				.onChange(async value => {
					this.featureSettings.recursive = value;
					await saveSettingCallback();
				})
			);

	}
}
