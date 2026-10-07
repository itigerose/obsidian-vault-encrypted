import MeldEncrypt from "../../main.ts";
import { t, tSshKeyError } from "../../i18n";
import { IMeldEncryptPluginSettings } from "../../settings/MeldEncryptPluginSettings.ts";
import { IMeldEncryptPluginFeature } from "../IMeldEncryptPluginFeature.ts";
import { Notice, TFile } from "obsidian";
import { ENCRYPTED_FILE_EXTENSIONS, ENCRYPTED_FILE_EXTENSION_DEFAULT } from "../../services/Constants.ts";
import { FileEncryptHelper } from "../../services/FileEncryptHelper.ts";
import { SshKeyService } from "../../services/SshKeyService.ts";

export default class FeatureConvertNote implements IMeldEncryptPluginFeature {

	plugin: MeldEncrypt;

	async onload(plugin: MeldEncrypt, settings: IMeldEncryptPluginSettings) {
		this.plugin = plugin;

		this.plugin.addCommand({
			id: 'meld-encrypt-convert-to-or-from-encrypted-note',
			name: t("command.convert"),
			icon: 'file-lock-2',
			checkCallback: (checking) => this.processCommandConvertActiveNote( checking ),
		});

		this.plugin.registerEvent(
			this.plugin.app.workspace.on( 'file-menu', (menu, file) => {
				if (file instanceof TFile){
					if ( file.extension == 'md' ){
						menu.addItem( (item) => {
							item
								.setTitle(t("menu.encryptNote"))
								.setIcon('file-lock-2')
								.onClick( () => this.processCommandEncryptNote( file ) );
							}
						);
					}
					if ( ENCRYPTED_FILE_EXTENSIONS.contains( file.extension ) ){
						menu.addItem( (item) => {
							item
								.setTitle(t("menu.decryptNote"))
								.setIcon('file')
								.onClick( () => this.processCommandDecryptNote( file ) );
							}
						);
					}
				}
			})
		);

	}

	onunload(): void { }

	buildSettingsUi(containerEl: HTMLElement, saveSettingCallback: () => Promise<void>): void { }

	private checkCanEncryptFile( file:TFile | null ) : boolean {
		if ( file == null ){
			return false;
		}
		return file.extension == 'md';
	}

	private checkCanDecryptFile( file:TFile | null ) : boolean {
		if ( file == null ){
			return false;
		}
		return ENCRYPTED_FILE_EXTENSIONS.contains( file.extension );
	}

	private processCommandEncryptNote( file:TFile ){
		this.encryptFile( file ).catch( reason => {
			if (reason){
				new Notice(reason, 10000);
			}
		});
	}

	private processCommandDecryptNote( file:TFile ){
		this.decryptFile( file ).catch( reason => {
			if (reason){
				new Notice(reason, 10000);
			}
		});
	}

	private processCommandConvertActiveNote( checking: boolean ) : boolean | void {
		const file = this.plugin.app.workspace.getActiveFile();

		if (checking){
			return this.checkCanEncryptFile(file)
				|| this.checkCanDecryptFile(file)
			;
		}

		if ( file?.extension == 'md' ){
			this.encryptFile( file ).catch( reason => {
				if (reason){
					new Notice(reason, 10000);
				}
			});
		}

		if ( file && ENCRYPTED_FILE_EXTENSIONS.contains( file.extension ) ){
			this.decryptFile( file ).catch( reason => {
				if (reason){
					new Notice(reason, 10000);
				}
			});
		}
	}

	private async encryptFile( file:TFile ) {

		if ( !this.checkCanEncryptFile(file) ) {
			throw new Error( t("error.unableToEncryptFile") );
		}

		if ( !(await SshKeyService.isAvailable()) ){
			new Notice( tSshKeyError(SshKeyService.lastErrorMessage), 10000 );
			return;
		}

		try{
			const encryptedFileContent = await FileEncryptHelper.encryptFile(this.plugin, file);

			await FileEncryptHelper.closeUpdateThenReopen(
				this.plugin,
				file,
				ENCRYPTED_FILE_EXTENSION_DEFAULT,
				encryptedFileContent
			);

			new Notice( t("notice.noteEncrypted") );

		}catch( error ){
			console.error('vault-encrypt: unable to encrypt file', error);
			new Notice( t("error.encryptionFailed"), 10000 );
		}
	}

	private async decryptFile( file:TFile ) {
		if ( !this.checkCanDecryptFile(file) ) {
			throw new Error( t("error.unableToDecryptFile") );
		}

		if ( !(await SshKeyService.isAvailable()) ){
			new Notice( tSshKeyError(SshKeyService.lastErrorMessage), 10000 );
			return;
		}

		try{
			const content = await FileEncryptHelper.decryptFile( this.plugin, file );
			if ( content == null ){
				throw new Error(t("error.decryptionFailed"));
			}

			await FileEncryptHelper.closeUpdateThenReopen( this.plugin, file, 'md', content );

			new Notice( t("notice.noteDecrypted") );

		}catch(error){
			if (error instanceof Error && error.message){
				new Notice(error.message, 10000);
			}else{
				console.error('vault-encrypt: unable to decrypt file', error);
				new Notice( t("error.decryptionFailed"), 10000 );
			}
		}
	}
}
