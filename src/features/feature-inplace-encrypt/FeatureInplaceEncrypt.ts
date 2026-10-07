import { Editor, EditorPosition, Menu, Notice, Setting, MarkdownPostProcessorContext, TFile } from "obsidian";
import { t, tSshKeyError } from "../../i18n";
import DecryptModal from "./DecryptModal.ts";
import { IMeldEncryptPluginFeature } from "../IMeldEncryptPluginFeature.ts";
import MeldEncrypt from "../../main.ts";
import { IMeldEncryptPluginSettings } from "../../settings/MeldEncryptPluginSettings.ts";
import { IFeatureInplaceEncryptSettings } from "./IFeatureInplaceEncryptSettings.ts";
import { UiHelper } from "../../services/UiHelper.ts";
import { CryptoHelperFactory } from "../../services/CryptoHelperFactory.ts";
import { ICryptoHelper } from "../../services/ICryptoHelper.ts";
import { SshKeyService } from "../../services/SshKeyService.ts";
import { Decryptable } from "./Decryptable.ts";
import { FeatureInplaceTextAnalysis, parseInlineEncryptFormat } from "./featureInplaceTextAnalysis.ts";
import { InlineEncryptLivePreview } from "./InlineEncryptLivePreview.ts";
import { ENCRYPTED_ICON, _PREFIXES, _SUFFIXES, _PREFIX_INLINE_OPEN, _INLINE_DEFAULT_VISIBLE } from "./FeatureInplaceConstants.ts";

enum EncryptOrDecryptMode{
	Encrypt = 'encrypt',
	Decrypt = 'decrypt'
}

interface DomDecryptContext{
	fullMarker: string;
	decryptable: Decryptable;
}

export default class FeatureInplaceEncrypt implements IMeldEncryptPluginFeature{
	plugin:MeldEncrypt;
	pluginSettings: IMeldEncryptPluginSettings;
	featureSettings:IFeatureInplaceEncryptSettings;

	/**
	 * Stores the encrypted marker string of the most recent right-clicked cipher
	 * element.  We store the marker *string* rather than the DOM node because
	 * Live Preview widgets may be re-rendered between the contextmenu event and
	 * the editor-menu event, making the original DOM reference stale.
	 */
	private lastContextMenuCipherMarker: string | null = null;

	async onload(plugin:MeldEncrypt, settings:IMeldEncryptPluginSettings) {
		this.plugin = plugin;
		this.pluginSettings = settings;
		this.featureSettings = settings.featureInplaceEncrypt;

		this.plugin.registerMarkdownPostProcessor(
			(el,ctx) => this.processEncryptedCodeBlockProcessor(el, ctx)
		);

		// Live Preview (source mode) rendering for the new encrypt(显示){密文} format.
		// The reading view uses the post-processor above; LP needs a CodeMirror
		// extension because post-processors don't run in LP.
		this.plugin.registerEditorExtension(
			InlineEncryptLivePreview.build(
				(sourcePath, decryptable, fullMarker) =>
					this.handleReadingIndicatorClick(sourcePath, decryptable, fullMarker),
				(fullMarker) => {
					this.lastContextMenuCipherMarker = fullMarker;
				}
			)
		);

		// Fallback: capture right-clicks anywhere in the document.  The Live
		// Preview widget registers its own handler via ViewPlugin.eventHandlers,
		// but this document listener covers reading-view elements and any edge
		// cases where the widget handler doesn't run.  We store the marker string
		// (not the DOM node) because CM may re-render the widget before
		// editor-menu fires.
		this.plugin.registerDomEvent(
			document,
			'contextmenu',
			(evt: MouseEvent) => {
				const target = evt.target as HTMLElement | null;
				if (target == null) {
					this.lastContextMenuCipherMarker = null;
					return;
				}
				const cipherEl = target.closest('.meld-encrypt-inline-cipher') as HTMLElement | null;
				this.lastContextMenuCipherMarker = cipherEl?.dataset['meldEncryptEncrypted'] ?? null;
			}
		);

		plugin.addCommand({
			id: 'meld-encrypt-in-place-encrypt',
			name: t("command.encryptSelection"),
			icon: 'lock-keyhole',
			editorCheckCallback: (checking, editor, view) => this.processEncryptCommand( checking, editor )
		});

		plugin.addCommand({
			id: 'meld-encrypt-in-place-decrypt',
			name: t("command.decrypt"),
			icon: 'lock-keyhole-open',
			editorCheckCallback: (checking, editor, view) => this.processDecryptCommand( checking, editor )
		});

		// Register editor context-menu items: "Encrypt Selection" + "Decrypt Selection"
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
				menu.addItem( (item) => {
					item
						.setTitle(t("menu.encryptSelection"))
						.setIcon('lock-keyhole')
						.setDisabled(!editor.somethingSelected())
						.onClick(() => this.processEncryptCommand(false, editor));
				} );

			menu.addItem( (item) => {
				// Use the command's own check logic so the item is only
				// enabled when the selection (or cursor) is on an encrypted block.
				const canDecrypt = this.processDecryptCommand(true, editor);
				item
					.setTitle(t("menu.decryptSelection"))
					.setIcon('lock-keyhole-open')
					.setDisabled(!canDecrypt)
					.onClick(() => this.processDecryptCommand(false, editor));
			} );
		})
		);

	}

	onunload(){

	}

	private replaceMarkersRecursive( node: Node, rlevel: number = 0 ) : Node[] {

		if ( node instanceof HTMLElement ){
			for( const n of Array.from(node.childNodes) ){
				var childNodes = this.replaceMarkersRecursive( n, rlevel+1 );
				n.replaceWith( ...childNodes );
			}
			return [node];
		}

if ( node instanceof Text ){

			const text = node.textContent;

			if ( text == null ){
				return [node];
			}

			if ( !text.contains( '🔐' ) && !text.contains( _PREFIX_INLINE_OPEN ) ){
				return [node];
			}

			// Walk through the text and slice out full marker runs so we can store the exact
			// substring that lives in the file. This is critical for later string-based
			// replacement when the user asks us to decrypt in place.
			const nodes : Node[] = [];
			const prefixList = [
				'%%🔐β ', '🔐β ',
				'%%🔐α ', '🔐α ',
				'%%🔐 ', '🔐 '
			];
			const suffixList = [ ' 🔐%%', ' 🔐' ];

			let cursor = 0;
			while ( cursor < text.length ){
				const remaining = text.substring(cursor);

				// ---- New format: encrypt(显示){密文} ----
				const inlineIdx = remaining.indexOf(_PREFIX_INLINE_OPEN);
				// ---- Old format: prefix + base64 + suffix ----
				let nextPrefixIdx = -1;
				let nextPrefix: string | null = null;
				for ( const p of prefixList ){
					const i = remaining.indexOf(p);
					if ( i >= 0 && ( nextPrefixIdx < 0 || i < nextPrefixIdx ) ){
						nextPrefixIdx = i;
						nextPrefix = p;
					}
				}

				// Decide which format appears first.
				let useInline = false;
				if ( inlineIdx >= 0 && ( nextPrefixIdx < 0 || inlineIdx < nextPrefixIdx ) ){
					useInline = true;
				}

				if ( useInline ){
					// Try to parse a complete inline marker starting at inlineIdx.
					const probe = remaining.substring(inlineIdx);
					const parsed = parseInlineEncryptFormat(probe);
					if ( parsed == null ){
						// Malformed — emit "encrypt(" literally and move past it.
						nodes.push( new Text( remaining.substring(0, inlineIdx + _PREFIX_INLINE_OPEN.length) ) );
						cursor += inlineIdx + _PREFIX_INLINE_OPEN.length;
						continue;
					}
					const visible = parsed.visibleText && parsed.visibleText.length > 0
						? parsed.visibleText
						: t("inline.defaultVisible");
					const suffix = (parsed as any)._inlineSuffix as string;
					const fullMarker = _PREFIX_INLINE_OPEN + (parsed.visibleText ?? '') + suffix;

					if ( inlineIdx > 0 ){
						nodes.push( new Text( remaining.substring(0, inlineIdx) ) );
					}
					nodes.push( this.buildCipherSpan( visible, fullMarker, parsed ) );
					cursor += inlineIdx + fullMarker.length;
					continue;
				}

				if ( nextPrefix == null || nextPrefixIdx < 0 ){
					// no more prefixes — push the remainder as plain text
					nodes.push( new Text( remaining ) );
					break;
				}

				// emit any plain text before the prefix
				if ( nextPrefixIdx > 0 ){
					nodes.push( new Text( remaining.substring(0, nextPrefixIdx) ) );
				}

				// find a matching suffix after the prefix
				const afterPrefix = remaining.substring( nextPrefixIdx + nextPrefix.length );
				let suffixIdx = -1;
				let matchedSuffix: string | null = null;
				for ( const s of suffixList ){
					const i = afterPrefix.indexOf(s);
					if ( i >= 0 && ( suffixIdx < 0 || i < suffixIdx ) ){
						suffixIdx = i;
						matchedSuffix = s;
					}
				}
				if ( matchedSuffix == null ){
					// unmatched prefix — keep it as plain text and move past it
					nodes.push( new Text( remaining.substring(0, nextPrefix.length) ) );
					cursor += nextPrefixIdx + nextPrefix.length;
					continue;
				}

				const fullMarker = remaining.substring( nextPrefixIdx, nextPrefixIdx + nextPrefix.length + suffixIdx + matchedSuffix.length );

				const cipherNode = createSpan({
					cls: 'meld-encrypt-inline-cipher',
					text: '🔐' + t("inline.clickToView") + '🔐',
					attr: {
						'data-meld-encrypt-encrypted' : fullMarker
					}
				});
				nodes.push( cipherNode );

				cursor += nextPrefixIdx + nextPrefix.length + suffixIdx + matchedSuffix.length;
			}

			return nodes;

		}

		return [node];
	}

	/**
	 * Build the clickable cipher span used in reading view. Stores the exact
	 * on-disk marker substring in a data attribute so decrypt-in-place can
	 * do a precise string replacement.
	 */
	private buildCipherSpan( visible: string, fullMarker: string, decryptable: Decryptable ): HTMLElement {
		const label = '🔒 ' + visible;
		return createSpan({
			cls: 'meld-encrypt-inline-cipher',
			text: label,
			attr: {
				'data-meld-encrypt-encrypted': fullMarker,
				'data-meld-encrypt-visible': visible
			}
		});
	}

	private async processEncryptedCodeBlockProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext){
		const replacementNodes = this.replaceMarkersRecursive(el);
		el.replaceWith( ...replacementNodes );
		// bind events
		const elIndicators = el.querySelectorAll('.meld-encrypt-inline-cipher');
		this.bindReadingIndicatorEventHandlers( ctx.sourcePath, elIndicators );
	}

	private bindReadingIndicatorEventHandlers( sourcePath: string, elements: NodeListOf<Element> ){
		elements.forEach( el => {
			const htmlEl = el as HTMLElement;
			if ( htmlEl == null ){
				return;
			}

			// Single-click: peek at the decrypted content (view only, no inline replace)
			htmlEl.addEventListener('click', async (ev: MouseEvent) => {
				const targetEl = ev.target as HTMLElement;
				if ( targetEl == null ){
					return;
				}
				const cipherEl = targetEl.closest('.meld-encrypt-inline-cipher') as HTMLElement | null;
				if ( cipherEl == null ){
					return;
				}
				ev.preventDefault();
				const encryptedText = cipherEl.dataset['meldEncryptEncrypted'] as string;
				if ( encryptedText == null ){
					return;
				}
				const decryptable = this.resolveDecryptable( encryptedText );
				if ( decryptable == null ){
					new Notice(t("notice.decryptionFailed"));
					return;
				}
				await this.handleReadingIndicatorClick( sourcePath, decryptable, encryptedText );
			});

			// Right-click: show a context menu with the "Decrypt" action
			htmlEl.addEventListener('contextmenu', async (ev: MouseEvent) => {
				const targetEl = ev.target as HTMLElement;
				if ( targetEl == null ){
					return;
				}
				const cipherEl = targetEl.closest('.meld-encrypt-inline-cipher') as HTMLElement | null;
				if ( cipherEl == null ){
					return;
				}
				const encryptedText = cipherEl.dataset['meldEncryptEncrypted'] as string;
				if ( encryptedText == null ){
					return;
				}
				const decryptable = this.resolveDecryptable( encryptedText );
				if ( decryptable == null ){
					return;
				}
				ev.preventDefault();
				const menu = new Menu();
				menu.addItem( (item) => {
					item
						.setTitle(t("menu.decryptSelection"))
						.setIcon('lock-keyhole-open')
						.onClick( async () => {
							// decrypt in place: replace the cipher block in the note
							await this.handleReadingIndicatorDecryptInPlace( sourcePath, decryptable, encryptedText );
						} );
				} );
				menu.showAtMouseEvent(ev);
			});
		} );
	}

	/**
	 * Resolve a stored on-disk marker substring into a Decryptable. Supports both
	 * the legacy `🔐β ...` format and the new `encrypt(显示){密文}` format.
	 */
	private resolveDecryptable( encryptedText: string ): Decryptable | null {
		// New format detection
		if ( encryptedText.startsWith(_PREFIX_INLINE_OPEN) ){
			const parsed = parseInlineEncryptFormat(encryptedText);
			return parsed;
		}
		// Legacy format
		const analysis = new FeatureInplaceTextAnalysis( encryptedText );
		return analysis.decryptable ?? null;
	}

	/**
	 * The crypto helper for a decryptable. Returns null only when the SSH key is
	 * unavailable — there is no per-version branching, so any ciphertext is
	 * attempted with the SSH-key helper and a failure surfaces as a decrypt error.
	 */
	private async resolveCrypto( decryptable: Decryptable ) {
		if ( !(await SshKeyService.isAvailable()) ){
			new Notice(tSshKeyError(SshKeyService.lastErrorMessage), 10000);
			return null;
		}
		return CryptoHelperFactory.BuildDefault();
	}

	/**
	 * Reading-view right-click "Decrypt" — removes the encryption: the cipher
	 * block is replaced in the note with the decrypted plaintext. The user must
	 * manually re-encrypt afterwards if they want it protected again.
	 */
	private async handleReadingIndicatorDecryptInPlace( path: string, decryptable?:Decryptable, fullMarker?:string ){
		if (decryptable == null || fullMarker == null){
			new Notice(t("notice.decryptionFailed"));
			return;
		}

		const crypto = await this.resolveCrypto(decryptable);
		if ( crypto == null ){
			return;
		}

		const activeFile = this.plugin.app.workspace.getActiveFile();
		if ( activeFile == null ){
			return;
		}

		const decryptedText = await crypto.decryptFromBase64( decryptable.base64CipherText );
		if ( decryptedText === null ){
			new Notice(t("notice.decryptionFailed"));
			return;
		}

		// Replace the cipher block with plaintext (cancel encryption).
		await this.plugin.app.vault.process( activeFile, (content) => {
			return content.split(fullMarker).join(decryptedText);
		} );

		new Notice(t("notice.noteDecrypted"));
	}

	private async handleReadingIndicatorClick( path: string, decryptable?:Decryptable, fullMarker?:string ){
		// indicator click handler
		if (decryptable == null){
			new Notice(t("notice.decryptionFailed"));
			return;
		}

		const crypto = await this.resolveCrypto(decryptable);
		if ( crypto == null ){
			return;
		}

		if ( !await this.showDecryptedResult( path, crypto, decryptable, fullMarker ) ){
			new Notice(t("notice.decryptionFailed"));
		}
	}

	private async showDecryptedResult(
		sourcePath: string,
		crypto: ICryptoHelper,
		decryptable: Decryptable,
		fullMarker?:string
	): Promise<boolean> {
		const decryptedText = await crypto.decryptFromBase64( decryptable.base64CipherText );

		// show result
		if (decryptedText === null) {
			return false;
		}

		return new Promise<boolean>( (resolve) => {
			const decryptModal = new DecryptModal(this.plugin.app, '🔓', decryptedText );
			decryptModal.canDecryptInPlace = false;
			decryptModal.onClose = async () =>{
				// "修改" button: re-encrypt the (possibly edited) plaintext and
				// write it back over the cipher block.
				if ( decryptModal.save && fullMarker != null && fullMarker.length > 0 ){
					try {
						const crypto2 = CryptoHelperFactory.BuildDefault();
						const reEncoded = this.encodeEncryption(
							await crypto2.encryptToBase64(decryptModal.text),
							decryptable.showInReadingView,
							decryptable.visibleText
						);
						const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
						if ( file != null ){
							await this.plugin.app.vault.process( file as any, (content) => {
								return content.split(fullMarker!).join(reEncoded);
							} );
							new Notice(t("notice.noteEncrypted"));
						}
					} catch (e) {
						new Notice(t("notice.encryptionFailed"));
					}
				}
				resolve(true);
			}
			decryptModal.open();
		} )
	}

	public buildSettingsUi(
		containerEl: HTMLElement,
		saveSettingCallback : () => Promise<void>
	): void {
		new Setting(containerEl)
			.setHeading()
			.setName(t("settings.inPlace.heading"))
		;

		// Selection encrypt feature settings below
		new Setting(containerEl)
			.setName(t("settings.inPlace.expandToWholeLine.name"))
			.setDesc(t("settings.inPlace.expandToWholeLine.desc"))
			.addToggle( toggle =>{
				toggle
					.setValue(this.featureSettings.expandToWholeLines)
					.onChange( async value =>{
						this.featureSettings.expandToWholeLines = value;
						await saveSettingCallback();
					})
			})
		;

		new Setting(containerEl)
			.setName(t("settings.inPlace.searchLimit.name"))
			.setDesc(t("settings.inPlace.searchLimit.desc"))
			.addText( text => {
				text
					.setValue(this.featureSettings.markerSearchLimit?.toString() ?? '10000' )
					.onChange( async value => {
						const num = parseInt(value);
						if ( !isNaN(num) ){
							this.featureSettings.markerSearchLimit = num;
							await saveSettingCallback();
						}
					})
				;
				text.inputEl.type = 'number';
				text.inputEl.min = '1000';
				text.inputEl.max = '9999999';
			})

		new Setting(containerEl)
			.setName(t("settings.inPlace.showMarkerReadingView.name"))
			.setDesc(t("settings.inPlace.showMarkerReadingView.desc"))
			.addToggle( toggle =>{
				toggle
					.setValue(this.featureSettings.showMarkerWhenReadingDefault)
					.onChange( async value =>{
						this.featureSettings.showMarkerWhenReadingDefault = value;
						await saveSettingCallback();
					})
			})
		;
	}

	private processEncryptCommand(
		checking: boolean,
		editor: Editor
	): boolean {
		if ( checking && UiHelper.isSettingsModalOpen() ){
			// Settings is open, ensures this command can show up in other
			// plugins which list commands e.g. customizable-sidebar
			return true;
		}

		let startPos = editor.getCursor('from');
		let endPos = editor.getCursor('to');

		const nothingSelected = !editor.somethingSelected();
		if ( nothingSelected){
			if ( this.featureSettings.expandToWholeLines ){
				const startLine = startPos.line;
				startPos = { line: startLine, ch: 0 }; // want the start of the first line

				const endLine = endPos.line;
				const endLineText = editor.getLine(endLine);
				endPos = { line: endLine, ch: endLineText.length }; // want the end of last line
			}else{
				if (!checking){
					new Notice(t("notice.pleaseSelectTextToEncrypt"));
				}
				return false;
			}
		}

		// check we are not within encrypted text or have selected encrypted text

		const foundStartMarkerPos = this.getClosestPrefixCursorPos( editor, startPos );
		const foundEndMarkerPos = this.getClosestSuffixCursorPos( editor, startPos );

		if ( foundStartMarkerPos != null && foundEndMarkerPos != null && foundStartMarkerPos.line === foundEndMarkerPos.line ){

			// start pos checks
			// check if the start position is within the encrypted text
			if ( startPos.line === foundStartMarkerPos.line && startPos.ch >= foundStartMarkerPos.ch && startPos.ch < foundEndMarkerPos.ch ){
				// the start position is within the encrypted text, so we do not encrypt
				return false;
			}

			// end pos checks
			// check if the end position is within the encrypted text
			if ( endPos.line === foundEndMarkerPos.line && endPos.ch >= foundStartMarkerPos.ch && endPos.ch < foundEndMarkerPos.ch ){
				// the end position is within the encrypted text, so we do not encrypt
				return false;
			}

		}

		// get selection to encrypt
		const selectionText = editor.getRange(startPos, endPos);

		// check have not selected encrypted text or part of it
		if ( selectionText.includes( ENCRYPTED_ICON ) || selectionText.includes( _PREFIX_INLINE_OPEN ) ){
			return false; // do not encrypt within encrypted text
		}

		if ( selectionText.length === 0 ){
			if (!checking){
				new Notice(t("notice.pleaseSelectTextToEncrypt"));
			}
			return false;
		}

		return this.processSelection(
			checking,
			editor,
			selectionText,
			startPos,
			endPos,
			EncryptOrDecryptMode.Encrypt
		);
	}

	private processDecryptCommand(
		checking: boolean,
		editor: Editor
	): boolean {

		if ( checking && UiHelper.isSettingsModalOpen() ){
			// Settings is open, ensures this command can show up in other
			// plugins which list commands e.g. customizable-sidebar
			return true;
		}

		// 1. Live Preview / reading-view rendered cipher element.  The editor
		//    cursor is unreliable here because right-clicking a widget does not
		//    move the cursor, so derive the encrypted text from the DOM instead.
		const domCtx = this.getDomDecryptContext();
		if ( domCtx != null ){
			if ( checking ){
				return true;
			}
			// Consume the marker so a later command-palette invocation doesn't
			// accidentally re-use this right-click context.
			this.lastContextMenuCipherMarker = null;
			this.decryptFromDomContext(domCtx);
			return true;
		}

		let startPos = editor.getCursor('from');
		let endPos = editor.getCursor('to');

		const nothingSelected = !editor.somethingSelected();

		if ( nothingSelected ){
			// nothing selected, first assume user wants to decrypt, expand to start and end markers...
			const foundStartPos = this.getClosestPrefixCursorPos( editor, startPos );
			const foundEndPos = this.getClosestSuffixCursorPos( editor, startPos );

			if (
				foundStartPos != null
				&& foundEndPos != null
				&& startPos.line >= foundStartPos.line
				&& endPos.line <= foundEndPos.line
			){
				startPos = foundStartPos;
				endPos = foundEndPos;
			} else {
				// Fall back to the new inline `encrypt(显示){密文}` format.
				const inlineBounds = this.getClosestInlineEncryptBlockBounds(editor, startPos);
				if ( inlineBounds == null ){
					if( !checking ){
						new Notice(t("notice.pleaseSelectTextToDecrypt"));
					}
					return false;
				}
				startPos = inlineBounds.start;
				endPos = inlineBounds.end;
			}
		}

		// Encrypt or Decrypt selected text
		const selectionText = editor.getRange(startPos, endPos);

		return this.processSelection(
			checking,
			editor,
			selectionText,
			startPos,
			endPos,
			EncryptOrDecryptMode.Decrypt
		);
	}

	/**
	 * Resolves the encrypted block that was right-clicked, if the last
	 * contextmenu event targeted a rendered cipher element.
	 */
	private getDomDecryptContext(): DomDecryptContext | null {
		const fullMarker = this.lastContextMenuCipherMarker;
		if ( fullMarker == null ){
			return null;
		}

		const decryptable = this.resolveDecryptable(fullMarker);
		if ( decryptable == null ){
			return null;
		}

		return { fullMarker, decryptable };
	}

	/**
	 * Find the bounds of the new inline `encrypt(visible){cipher}` block that
	 * contains the given editor position, if any.
	 */
	private getClosestInlineEncryptBlockBounds(
		editor: Editor,
		fromEditorPosition: EditorPosition
	): { start: EditorPosition; end: EditorPosition } | null {
		const offset = editor.posToOffset(fromEditorPosition);
		const text = editor.getValue();
		const prefix = _PREFIX_INLINE_OPEN;

		let searchPos = offset;
		while ( searchPos >= 0 ){
			const startIdx = text.lastIndexOf(prefix, searchPos);
			if ( startIdx < 0 ){
				return null;
			}

			const remainder = text.substring(startIdx);
			const parsed = parseInlineEncryptFormat(remainder);
			if ( parsed == null ){
				searchPos = startIdx - 1;
				continue;
			}

			const suffix = (parsed as any)._inlineSuffix as string;
			const fullMarker = prefix + (parsed.visibleText ?? '') + suffix;
			const endIdx = startIdx + fullMarker.length;

			if ( offset >= startIdx && offset <= endIdx ){
				return {
					start: editor.offsetToPos(startIdx),
					end: editor.offsetToPos(endIdx)
				};
			}

			searchPos = startIdx - 1;
		}

		return null;
	}

	private async decryptFromDomContext( ctx: DomDecryptContext ) {
		const crypto = await this.resolveCrypto(ctx.decryptable);
		if ( crypto == null ){
			return;
		}

		const activeFile = this.plugin.app.workspace.getActiveFile();
		if ( activeFile == null ){
			return;
		}

		const decryptedText = await crypto.decryptFromBase64( ctx.decryptable.base64CipherText );
		if ( decryptedText === null ){
			new Notice(t("notice.decryptionFailed"));
			return;
		}

		await this.plugin.app.vault.process(activeFile, (content) => {
			return content.split(ctx.fullMarker).join(decryptedText);
		});

		new Notice(t("notice.noteDecrypted"));
	}

	private getClosestPrefixCursorPos( editor: Editor, fromEditorPosition: EditorPosition ): EditorPosition | null{

		const maxLookback = this.featureSettings.markerSearchLimit;

		const maxLengthPrefix = _PREFIXES.reduce((prev,cur, i) => {
			if (i== 0) return cur;
			if ( cur.length > prev.length ) return cur;
			return prev;
		} );
		const initOffset = editor.posToOffset( fromEditorPosition ) + maxLengthPrefix.length;

		const minOffset = Math.max(initOffset - maxLookback, 0);

		for (let offset = initOffset; offset >= minOffset; offset--) {
			const offsetPos = editor.offsetToPos(offset);
			for (const prefix of _PREFIXES) {
				const prefixStartOffset = offset - prefix.length;
				const prefixStartPos = editor.offsetToPos(prefixStartOffset);

				const testText = editor.getRange( prefixStartPos, offsetPos );

				if (testText == prefix){
					return editor.offsetToPos(prefixStartOffset);
				}
			}
		}

		return null;

	}

	private getClosestSuffixCursorPos( editor: Editor, fromEditorPosition:EditorPosition ): EditorPosition | null{
		const maxLookForward = this.featureSettings.markerSearchLimit;

		const maxLengthPrefix = _PREFIXES.reduce((prev,cur, i) => {
			if (i== 0) return cur;
			if ( cur.length > prev.length ) return cur;
			return prev;
		} );

		const initOffset = editor.posToOffset( fromEditorPosition ) - maxLengthPrefix.length + 1;
		const lastLineNum = editor.lastLine();

		const maxOffset = Math.min( initOffset + maxLookForward, editor.posToOffset( {line:lastLineNum, ch:editor.getLine(lastLineNum).length} ) );

		for (let offset = initOffset; offset <= maxOffset; offset++) {
			const offsetPos = editor.offsetToPos(offset);
			for (const suffix of _SUFFIXES) {
				const textEndOffset = offset + suffix.length;
				const textEndPos = editor.offsetToPos(textEndOffset);

				const testText = editor.getRange( offsetPos, textEndPos );

				if (testText == suffix){
					return textEndPos;
				}
			}
		}

		return null;
	}

	private processSelection(
		checking: boolean,
		editor: Editor,
		selectionText: string,
		finalSelectionStart: CodeMirror.Position,
		finalSelectionEnd: CodeMirror.Position,
		mode:EncryptOrDecryptMode
	) : boolean {
		const selectionAnalysis = new FeatureInplaceTextAnalysis( selectionText );

		if (selectionAnalysis.isEmpty) {
			if (!checking){
				new Notice(mode == EncryptOrDecryptMode.Encrypt ? t("notice.nothingToEncrypt") : t("notice.nothingToDecrypt"));
			}
			return false;
		}

		if ( mode == EncryptOrDecryptMode.Encrypt && !selectionAnalysis.canEncrypt ) {
			if (!checking){
				new Notice(t("notice.unableToEncryptThat"));
			}
			return false;
		}

		if ( mode == EncryptOrDecryptMode.Decrypt && !selectionAnalysis.canDecrypt ) {
			if (!checking){
				new Notice(t("notice.unableToDecryptThat"));
			}
			return false;
		}

		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (activeFile == null){
			return false;
		}

		if (checking) {
			return true;
		}

		if (selectionAnalysis.canEncrypt) {
			void this.encryptSelection(
				editor,
				selectionText,
				finalSelectionStart,
				finalSelectionEnd,
				this.featureSettings.showMarkerWhenReadingDefault
			);
		} else if ( selectionAnalysis.decryptable ) {
			void this.decryptSelection(
				editor,
				activeFile,
				selectionAnalysis.decryptable,
				finalSelectionStart,
				finalSelectionEnd,
			);
		}

		return true;
	}

	private async encryptSelection(
		editor: Editor,
		textToEncrypt: string,
		finalSelectionStart: CodeMirror.Position,
		finalSelectionEnd: CodeMirror.Position,
		showInReadingView: boolean
	) {
		const crypto = CryptoHelperFactory.BuildDefault();
		if ( !(await SshKeyService.isAvailable()) ){
			new Notice(tSshKeyError(SshKeyService.lastErrorMessage), 10000);
			return;
		}

		const encodedText = this.encodeEncryption(
			await crypto.encryptToBase64(textToEncrypt),
			showInReadingView
		);
		editor.setSelection(finalSelectionStart, finalSelectionEnd);
		editor.replaceSelection(encodedText);
	}

	private async decryptSelection(
		editor: Editor,
		activeFile: TFile,
		decryptable: Decryptable,
		selectionStart: CodeMirror.Position,
		selectionEnd: CodeMirror.Position
	) : Promise<boolean> {

		const crypto = await this.resolveCrypto(decryptable);
		if ( crypto == null ){
			return false;
		}

		const decryptedText = await crypto.decryptFromBase64(decryptable.base64CipherText);
		if (decryptedText === null) {
			new Notice(t("notice.decryptionFailed"));
			return false;
		}

		const decryptModal = new DecryptModal(this.plugin.app, '🔓', decryptedText );
		decryptModal.onClose = async () => {
			editor.focus();
			if (decryptModal.decryptInPlace) {
				editor.setSelection(selectionStart, selectionEnd);
				editor.replaceSelection(decryptModal.text);
			} else if (decryptModal.save) {
				const crypto2 = CryptoHelperFactory.BuildDefault();
				const encodedText = this.encodeEncryption(
					await crypto2.encryptToBase64(decryptModal.text),
					decryptable.showInReadingView,
					decryptable.visibleText
				);
				editor.setSelection(selectionStart, selectionEnd);
				editor.replaceSelection(encodedText);
			}
		};
		decryptModal.open();
		return true;
	}

	private encodeEncryption( encryptedText: string, showInReadingView: boolean, visibleText?: string ): string {
		// New inline format: encrypt(显示内容){加密内容}
		const visible = (visibleText && visibleText.length > 0) ? visibleText : _INLINE_DEFAULT_VISIBLE;
		return _PREFIX_INLINE_OPEN
			+ visible
			+ ')'
			+ '{'
			+ encryptedText
			+ '}';
	}
}
