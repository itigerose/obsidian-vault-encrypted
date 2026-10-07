import { MarkdownView, Notice, TFile, ViewStateResult } from "obsidian";
import { t, tSshKeyError } from "../../i18n";
import { FileData, FileDataHelper, JsonFileEncoding } from "../../services/FileDataHelper.ts";
import { ENCRYPTED_FILE_EXTENSIONS } from "../../services/Constants.ts";
import { SshKeyService } from "../../services/SshKeyService.ts";

/**
 * View for whole-note encrypted files. Content is decrypted automatically
 * with the local OpenSSH Ed25519 key — there is no password prompt.
 */
export class EncryptedMarkdownView extends MarkdownView {

	static VIEW_TYPE = 'meld-encrypted-view';

	encryptedData : FileData | null = null;
	cachedUnencryptedData : string = '';
	dataWasChangedSinceLastSave = false;

	isSavingEnabled = false;
	isLoadingFileInProgress = false;
	isSavingInProgress = false;

	override allowNoFile = false;

	override getViewType(): string {
		return EncryptedMarkdownView.VIEW_TYPE;
	}

	override canAcceptExtension(extension: string): boolean {
		return ENCRYPTED_FILE_EXTENSIONS.includes( extension );
	}

	protected override async onOpen(): Promise<void> {
		await super.onOpen();
	}

	override async onLoadFile(file: TFile): Promise<void> {
		//console.debug('onLoadFile', {file});
		this.setViewBusy( true );
		try{

			this.setUnencryptedViewData('', true);

			if (!this.app.workspace.layoutReady ){
				this.leaf.detach();
				return;
			};

			const fileContents = await this.app.vault.read( file );
			this.encryptedData = JsonFileEncoding.decode( fileContents );

			// decrypt the file content with the local SSH key — any ciphertext
			// that cannot be authenticated simply fails and surfaces an error.
			const decryptedText = await FileDataHelper.decrypt( this.encryptedData );

			if ( decryptedText == null ){
				const keyError = SshKeyService.lastErrorMessage;
				new Notice(keyError ? tSshKeyError(keyError) : t("error.decryptionFailed"), 12000);
				this.leaf.detach();
				return;
			}

			this.setUnencryptedViewData( decryptedText, false );

			this.isLoadingFileInProgress = true;
			try{
				await super.onLoadFile(file);
			}finally{
				this.isLoadingFileInProgress = false;
				this.isSavingEnabled = true; // allow saving after the file is loaded
			}

		}finally{
			//console.debug('onLoadFile done');
			this.setViewBusy( false );
		}

	}

	private setViewBusy( busy: boolean ) {
		this.contentEl.toggleClass('meld-encrypt-view-busy', busy);
	}

	public detachSafely(){
		this.save();
		this.isSavingEnabled = false;
		this.leaf.detach();
	}

	override async onUnloadFile(file: TFile): Promise<void> {

		if ( this.encryptedData == null ) {
			return;
		}

		if (this.isSavingInProgress){
			console.info( 'Saving is in progress, but forcing another save because the file is being unloaded' );
			this.isSavingInProgress = false;
			this.dataWasChangedSinceLastSave = true;
		}
		await super.onUnloadFile(file);
	}

	private getUnencryptedViewData(): string {
		return super.getViewData();
	}

	override getViewData(): string {
		// something is reading the data.. maybe to save it

		if (this.isSavingInProgress) {
			if ( this.encryptedData == null ) {
				throw new Error('encryptedData is unexpectedly null');
			}
			// return the encrypted data which should have just been updated in the save method
			return JsonFileEncoding.encode( this.encryptedData );
		}

		// not saving, so return the unencrypted view data
		return this.getUnencryptedViewData();
	}

	private setUnencryptedViewData(data: string, clear: boolean): void {
		//console.debug('setUnencryptedViewData', {data, clear});
		this.cachedUnencryptedData = data;
		super.setViewData(data, false);
	}

	override setViewData(data: string, clear: boolean): void {
		// something is setting the view data, perhaps from reading from the
		// file... or some other plugin is adding some markdown

		//console.debug('setViewData', {data, clear});

		if ( this.file == null ) {
			console.info( 'View data will not be set because file is null' )
			return;
		}

		if ( this.isLoadingFileInProgress ){
			return;
		}

		if ( !JsonFileEncoding.isEncoded(data) ){
			this.setUnencryptedViewData(data, clear);
			return;
		}

		console.info( 'View is being set with already encoded data, trying to decode', {data} );
		const newEncoded = JsonFileEncoding.decode(data);

		FileDataHelper.decrypt( newEncoded ).then( decryptedText => {
			if ( decryptedText == null ){
				console.info('View was being set with already encoded data but the decryption failed, closing view');
				this.isSavingEnabled = false; // don't overwrite the data when we detach
				this.leaf.detach();
				return;
			}
			this.setUnencryptedViewData(decryptedText, clear);
		});

	}

	override async setState(state: { mode?: string }, result: ViewStateResult): Promise<void> {
		//console.debug('setState', state, result, this.cachedUnencryptedData);
		if ( state.mode == 'preview' ){
			await this.save(); // save before preview
		}
		this.isSavingEnabled = false;
		try{
			await super.setState(state, result);
			super.setViewData(this.cachedUnencryptedData, false);
		}finally{
			this.isSavingEnabled = true;
		}
		//console.debug('setState done');
	}

	override async save(clear?: boolean | undefined): Promise<void> {
		console.debug('save', { clear });
		if ( this.isSavingInProgress ) {
			console.info('Saving was prevented because another save is in progress, Obsidian will try again later if the content changed.');
			return;
		}

		this.isSavingInProgress = true;
		this.setViewBusy( true );
		try{

			if (this.file == null){
				console.info('Saving was prevented beacuse there is no file loaded in the view yet');
				return;
			}

			if ( !ENCRYPTED_FILE_EXTENSIONS.includes( this.file.extension ) ){
				console.info('Saving was prevented because the file is not an encrypted file');
				return;
			}

			if (!this.isSavingEnabled){
				console.info('Saving was prevented because it was explicitly disabled');
				return;
			}

			if ( this.encryptedData == null ){
				console.info('Saving was prevented because the file was not yet loaded');
				return;
			}

			const unencryptedDataToSave = this.getUnencryptedViewData();

			if ( JsonFileEncoding.isEncoded( unencryptedDataToSave ) ){
				// data is already encrypted, protect it from being overwritten
				console.info('Saving was prevented beacuse the data was already encoded but it was expected to not be');
				return;
			}

			if (
				!this.dataWasChangedSinceLastSave
				&& this.cachedUnencryptedData.length == unencryptedDataToSave.length
				&& this.cachedUnencryptedData == unencryptedDataToSave
			){
				console.info('Saving was prevented because the data was not changed');
				return;
			}

			this.setUnencryptedViewData(unencryptedDataToSave, false);

			// build up-to-date encrypted data
			this.encryptedData = await FileDataHelper.encrypt( unencryptedDataToSave );

			// call the real save.. which will call getViewData... getViewData will
			// decide whether to return encrypted or unencrypted data (encrypted
			// in this case becase this.isSavingInProgress is true)
			await super.save(clear);

			this.dataWasChangedSinceLastSave = false;

		} finally{
			this.isSavingInProgress = false;
			this.setViewBusy( false );
		}

	}

}
