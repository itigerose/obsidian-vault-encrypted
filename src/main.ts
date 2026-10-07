import { Notice, Plugin } from 'obsidian';
import { t, tSshKeyError } from './i18n';
import MeldEncryptSettingsTab from './settings/MeldEncryptSettingsTab.ts';
import { IMeldEncryptPluginSettings } from './settings/MeldEncryptPluginSettings.ts';
import { IMeldEncryptPluginFeature } from './features/IMeldEncryptPluginFeature.ts';
import { SshKeyService } from './services/SshKeyService.ts';
import FeatureInplaceEncrypt from './features/feature-inplace-encrypt/FeatureInplaceEncrypt.ts';
import FeatureConvertNote from './features/feature-convert-note/FeatureConvertNote.ts';
import FeatureWholeNoteEncryptV2 from './features/feature-whole-note-encrypt/FeatureWholeNoteEncrypt.ts';
import FeatureRandomPassword from './features/feature-random-password/FeatureRandomPassword.ts';
import FeatureFolderEncrypt from './features/feature-folder-encrypt/FeatureFolderEncrypt.ts';

export default class MeldEncrypt extends Plugin {

	private settings: IMeldEncryptPluginSettings;

	/** Public read access to settings (used by feature modules). */
	get pluginSettings(): IMeldEncryptPluginSettings {
		return this.settings;
	}

	private enabledFeatures : IMeldEncryptPluginFeature[] = [];

	async onload() {

		// Settings
		await this.loadSettings();

		this.enabledFeatures.push(
			new FeatureWholeNoteEncryptV2(),
			new FeatureConvertNote(),
			new FeatureInplaceEncrypt(),
			new FeatureFolderEncrypt(),
			new FeatureRandomPassword(),
		);

		this.addSettingTab(
			new MeldEncryptSettingsTab(
				this.app,
				this,
				this.settings,
				this.enabledFeatures
			)
		);
		// End Settings

		this.addCommand({
			id: 'meld-encrypt-reload-ssh-key',
			name: t("command.reloadSshKey"),
			icon: 'key-round',
			callback: async () => {
				await SshKeyService.reload();
				const status = SshKeyService.getStatus();
				if (status.loaded) {
					new Notice(t("notice.sshKeyReloaded", { source: status.source }));
				} else {
					new Notice(tSshKeyError(SshKeyService.lastErrorMessage), 10000);
				}
			},
		});

		// Try to load the SSH key once at startup so problems surface early
		// (console only — the UI shows a notice on first actual use).
		void SshKeyService.isAvailable().then(loaded => {
			if (!loaded) {
				console.info('vault-encrypt: SSH key not available at startup:', SshKeyService.lastErrorMessage);
			}
		});

		// load features
		this.enabledFeatures.forEach(async f => {
			await f.onload( this, this.settings );
		});

	}

	override onunload() {
		this.enabledFeatures.forEach(async f => {
			f.onunload();
		});
		super.onunload();
	}

	async loadSettings() {

		const DEFAULT_SETTINGS: IMeldEncryptPluginSettings = {
			featureWholeNoteEncrypt: {
			},

			featureInplaceEncrypt:{
				expandToWholeLines: false,
				markerSearchLimit: 10000,
				showMarkerWhenReadingDefault: true
			},

			featureRandomPassword: {
				length: 16,
				upper: true,
				lower: true,
				number: true,
				symbol: true
			},

			featureFolderEncrypt: {
				recursive: true,
				markedFolders: []
			}
		}

		this.settings = Object.assign(
			DEFAULT_SETTINGS,
			await this.loadData()
		);

		// migrate settings written by versions that had no folder marks
		if (this.settings.featureFolderEncrypt == null) {
			this.settings.featureFolderEncrypt = { recursive: true, markedFolders: [] };
		}
		if (!Array.isArray(this.settings.featureFolderEncrypt.markedFolders)) {
			this.settings.featureFolderEncrypt.markedFolders = [];
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

}
