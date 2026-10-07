import { App, PluginSettingTab, Setting } from "obsidian";
import { t, tSshKeyError } from "../i18n";
import { IMeldEncryptPluginFeature } from "../features/IMeldEncryptPluginFeature.ts";
import { SshKeyService } from "../services/SshKeyService.ts";
import MeldEncrypt from "../main.ts";
import { IMeldEncryptPluginSettings } from "./MeldEncryptPluginSettings.ts";

export default class MeldEncryptSettingsTab extends PluginSettingTab {
	plugin: MeldEncrypt;
	settings: IMeldEncryptPluginSettings;

	features:IMeldEncryptPluginFeature[];

	constructor(
		app: App,
		plugin: MeldEncrypt,
		settings:IMeldEncryptPluginSettings,
		features: IMeldEncryptPluginFeature[]
	) {
		super(app, plugin);
		this.plugin = plugin;
		this.settings = settings;
		this.features = features;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// SSH key status
		const status = SshKeyService.getStatus();
		new Setting(containerEl)
			.setName(t("settings.sshKey.name"))
			.setDesc(
				status.loaded
					? t("settings.sshKey.loadedDesc", { source: status.source })
					: tSshKeyError(status.error)
			)
			.addButton(button => button
				.setButtonText(t("settings.sshKey.reload"))
				.onClick(async () => {
					await SshKeyService.reload();
					this.display();
				})
			)
		;

		// build feature settings
		this.features.forEach(f => {
			f.buildSettingsUi( containerEl, async () => await this.plugin.saveSettings() );
		});

	}

}
