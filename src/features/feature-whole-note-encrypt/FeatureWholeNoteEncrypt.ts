import MeldEncrypt from "../../main.ts";
import { t, tSshKeyError } from "../../i18n";
import { IMeldEncryptPluginFeature } from "../IMeldEncryptPluginFeature.ts";
import { EncryptedMarkdownView } from "./EncryptedMarkdownView.ts";
import { MarkdownView, Notice, TFolder, normalizePath, moment, TFile } from "obsidian";
import { FileDataHelper, JsonFileEncoding } from "../../services/FileDataHelper.ts";
import { ENCRYPTED_FILE_EXTENSIONS, ENCRYPTED_FILE_EXTENSION_DEFAULT } from "../../services/Constants.ts";
import { SshKeyService } from "../../services/SshKeyService.ts";

export default class FeatureWholeNoteEncryptV2 implements IMeldEncryptPluginFeature {

	plugin: MeldEncrypt;

	private statusIndicator: HTMLElement;

	async onload( plugin: MeldEncrypt ) {
		this.plugin = plugin;

		this.plugin.addCommand({
			id: 'meld-encrypt-create-new-note',
			name: t("command.createNewEncryptedNote"),
			icon: 'file-lock-2',
			callback: async () => await this.processCreateNewEncryptedNoteCommand( this.getDefaultFileFolder() ),
		});

		// configure status indicator
		this.statusIndicator = this.plugin.addStatusBarItem();
		this.statusIndicator.hide();
		this.statusIndicator.setText('🔐');

		// register view
		this.plugin.registerView( EncryptedMarkdownView.VIEW_TYPE, (leaf) => new EncryptedMarkdownView(leaf) );
		this.plugin.registerExtensions( ENCRYPTED_FILE_EXTENSIONS, EncryptedMarkdownView.VIEW_TYPE );

		// show status indicator for encrypted files, hide for others
		this.plugin.registerEvent( this.plugin.app.workspace.on('active-leaf-change', () => {
			const view = this.plugin.app.workspace.getActiveViewOfType(EncryptedMarkdownView);
			if (view == null){
				this.statusIndicator.hide();
				return;
			}
			this.statusIndicator.show();
		}));

		// make sure the view is the right type
		this.plugin.registerEvent(

            this.plugin.app.workspace.on('active-leaf-change', async (leaf) => {
				if ( leaf == null ){
					return;
				}

				if ( leaf.view instanceof EncryptedMarkdownView ){
					// correct view already active
					return;
				}

				if ( leaf.view instanceof MarkdownView ){

					const file = leaf.view.file;
					if ( file == null ){
						return;
					}

					if ( ENCRYPTED_FILE_EXTENSIONS.includes( file.extension ) ){
						// file is encrypted but has the wrong view type
						const viewState = leaf.getViewState();
						viewState.type = EncryptedMarkdownView.VIEW_TYPE;

						await leaf.setViewState( viewState );

						return;
					}

				}

			} )
		);

	}

	private getDefaultFileFolder() : TFolder {
		const activeFile = this.plugin.app.workspace.getActiveFile();

		if (activeFile != null){
			return this.plugin.app.fileManager.getNewFileParent(activeFile.path);
		}else{
			return this.plugin.app.fileManager.getNewFileParent('');
		}
	}

	private async processCreateNewEncryptedNoteCommand( parentFolder: TFolder ) : Promise<void> {

		if ( !(await SshKeyService.isAvailable()) ){
			new Notice( tSshKeyError(SshKeyService.lastErrorMessage), 10000 );
			return;
		}

		const newFilename = moment().format( `[Untitled] YYYYMMDD hhmmss[.${ENCRYPTED_FILE_EXTENSION_DEFAULT}]`);
		const newFilepath = normalizePath( parentFolder.path + "/" + newFilename );

		// create the new file
		const fileData = await FileDataHelper.encrypt( '' )
		const fileContents = JsonFileEncoding.encode( fileData );
		const file = await this.plugin.app.vault.create( newFilepath, fileContents );

		// open the file
		const leaf = this.plugin.app.workspace.getLeaf( true );
		await leaf.openFile( file );

	}

	onunload() {
		// Intentionally not detaching leaves here: doing so resets leaf positions
		// when the plugin reloads, even if the user has moved them elsewhere.
		// EncryptedMarkdownView leaves will naturally close/unregister when Obsidian
		// cleans up the registered view type.
	}

	buildSettingsUi(containerEl: HTMLElement, saveSettingCallback: () => Promise<void>): void {
		//throw new Error("Method not implemented.");
	}

}
