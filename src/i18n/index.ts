import { moment } from "obsidian";

// Locale is resolved from the active Obsidian language (e.g. "en", "zh-cn").
const locale = moment.locale();

const translations: Record<string, Record<string, string>> = {
	"en": {
		// --- Commands / ribbon / context menu ---
		"command.encryptSelection": "Encrypt Selection",
		"command.decrypt": "Decrypt",
		"command.createNewEncryptedNote": "Create new encrypted note",
		"command.convert": "Convert to or from an Encrypted note",
		"command.generatePassword": "Generate Random Password",
		"ribbon.generatePassword": "Generate Random Password",
		"menu.encryptNote": "Encrypt file",
		"menu.decryptNote": "Decrypt file",
		"menu.encryptFolder": "Encrypt folder",
		"menu.decryptFolder": "Decrypt folder",
		"menu.markFolder": "Mark folder as encrypted",
		"menu.unmarkFolder": "Remove encrypted-folder mark",
		"menu.encryptFolderExisting": "Encrypt existing .md notes in this folder",
		"menu.encryptSelection": "Encrypt Selection",
		"menu.decryptSelection": "Decrypt Selection",
		"command.folderEncrypt": "Encrypt folder of current note",
		"command.folderDecrypt": "Decrypt folder of current note",
		"command.toggleMarkFolder": "Mark or unmark folder of current note",
		"command.reloadSshKey": "Reload SSH key",
		"menu.newEncryptedNote": "New encrypted note",

		// --- Notices ---
		"notice.decryptionFailed": "❌ Decryption failed!",
		"notice.encryptionFailed": "❌ Encryption failed!",
		"notice.pleaseSelectTextToEncrypt": "Please select text to encrypt.",
		"notice.pleaseSelectTextToDecrypt": "Please select text to decrypt or place cursor on encrypted text.",
		"notice.nothingToEncrypt": "Nothing to Encrypt.",
		"notice.nothingToDecrypt": "Nothing to Decrypt.",
		"notice.unableToEncryptThat": "Unable to Encrypt that.",
		"notice.unableToDecryptThat": "Unable to Decrypt that.",
		"notice.copied": "Copied!",
		"notice.noteEncrypted": "🔐 Note was encrypted",
		"notice.noteDecrypted": "🔓 Note was decrypted",
		"notice.folderNotFound": "Folder not found.",
		"notice.folderNoMatchingFiles": "No matching files found in this folder.",
		"notice.folderEncryptSummary": "Folder done — succeeded: {{succeeded}}, skipped: {{skipped}}, failed: {{failed}}",
		"notice.folderMarked": "🔖 \"{{path}}\" is now an encrypted folder — new notes are encrypted automatically",
		"notice.folderUnmarked": "🔓 Removed the encrypted-folder mark from \"{{path}}\" (existing files were left untouched)",
		"notice.autoEncrypted": "🔐 Auto-encrypted \"{{name}}\"",
		"notice.autoEncryptFailed": "❌ Unable to auto-encrypt \"{{name}}\"",
		"notice.sshKeyReloaded": "🔑 SSH key loaded from {{source}}",

		// --- Settings ---
		"settings.inPlace.heading": "Inline encryption",
		"settings.sshKey.name": "SSH key (Ed25519)",
		"settings.sshKey.loadedDesc": "Loaded from {{source}}",
		"settings.sshKey.reload": "Reload",
		"settings.inPlace.expandToWholeLine.name": "Expand selection to whole line?",
		"settings.inPlace.expandToWholeLine.desc": "Partial selections will get expanded to the whole line.",
		"settings.inPlace.searchLimit.name": "Search limit for markers",
		"settings.inPlace.searchLimit.desc": "How far to look for markers when encrypting/decrypting.",
		"settings.inPlace.showMarkerReadingView.name": "By default, show encrypted marker when reading",
		"settings.inPlace.showMarkerReadingView.desc": "When encrypting inline text, should the default be to have a visible marker in Reading view?",

		"settings.randomPassword.heading": "Generate random password",
		"settings.randomPassword.length": "Default length",
		"settings.randomPassword.lengthDesc": "Number of characters in the generated password.",
		"settings.randomPassword.includeUppercase": "Include uppercase letters (A–Z)",
		"settings.randomPassword.includeLowercase": "Include lowercase letters (a–z)",
		"settings.randomPassword.includeNumbers": "Include numbers (0–9)",
		"settings.randomPassword.includeSymbols": "Include symbols (!@#$...)",

		"settings.folderEncrypt.heading": "Folder encryption",
		"settings.folderEncrypt.recursive.name": "Recursive by default",
		"settings.folderEncrypt.recursive.desc": "When opening the folder encrypt dialog, include sub-folders by default.",

		// --- Dropdown option labels ---
		// --- Modal ---
		"modal.save": "Modify",
		"modal.copy": "Copy",
		"modal.decryptInPlace": "Decrypt inline",

		// --- Inline encrypt(显示){密文} format ---
		"inline.defaultVisible": "encrypted",
		"inline.clickToView": "Double-click to enter password and view",

		// --- Random password modal ---
		"modal.generatePassword.title": "Generate Random Password",
		"modal.generatePassword.length.name": "Length",
		"modal.generatePassword.length.desc": "Number of characters (1-256).",
		"modal.generatePassword.upper.name": "Include uppercase (A-Z)",
		"modal.generatePassword.lower.name": "Include lowercase (a-z)",
		"modal.generatePassword.number.name": "Include numbers (0-9)",
		"modal.generatePassword.symbol.name": "Include symbols (!@#$...)",
		"modal.generatePassword.regenerate": "Regenerate",
		"modal.generatePassword.copy": "Copy",
		"modal.generatePassword.done": "Done",

		"modal.folderEncrypt.titleEncrypt": "Encrypt folder",
		"modal.folderEncrypt.titleDecrypt": "Decrypt folder",
		"modal.folderEncrypt.sshKeyNote": "All notes are encrypted with your local SSH key (~/.ssh/id_ed25519). No password is required.",
		"modal.folderEncrypt.folder": "Folder path",
		"modal.folderEncrypt.folderDesc": "Path of the folder to process. Defaults to the folder of the current note.",
		"modal.folderEncrypt.folderPlaceholder": "e.g. 03-Secret/Notes",
		"modal.folderEncrypt.run": "Run",
		"modal.folderEncrypt.cancel": "Cancel",
		"modal.folderEncrypt.processing": "Processing…",
		"modal.folderEncrypt.progress": "Processed {{done}} / {{total}}",
		"modal.folderEncrypt.summary": "Succeeded: {{succeeded}}, Skipped: {{skipped}}, Failed: {{failed}}",
		"modal.folderEncrypt.failedListTitle": "Failed files",
		"modal.folderEncrypt.done": "Done",

		// --- Mark folder as encrypted ---
		"modal.markFolder.title": "Mark folder as encrypted",
		"modal.markFolder.desc": "New .md notes created or moved into this folder are encrypted automatically.",
		"modal.markFolder.folder": "Folder path",
		"modal.markFolder.folderDesc": "Path of the folder to mark.",
		"modal.markFolder.encryptExisting": "Encrypt existing notes now",
		"modal.markFolder.encryptExistingDesc": "Encrypt the .md notes that are already in this folder using the password above.",
		"modal.markFolder.confirm": "Mark folder",

		// --- Errors ---
		"error.unableToEncryptFile": "Unable to encrypt file",
		"error.unableToDecryptFile": "Unable to decrypt file",
		"error.decryptionFailed": "Decryption failed",
		"error.encryptionFailed": "Encryption failed",
		"error.sshKeyUnavailable": "❌ SSH key unavailable — expected an unencrypted Ed25519 private key at ~/.ssh/id_ed25519 (desktop only)",
		"error.sshKey.not-found": "❌ SSH key not found — expected ~/.ssh/id_ed25519",
		"error.sshKey.no-node": "❌ SSH key mode requires the Obsidian desktop app",
		"error.sshKey.read-failed": "❌ Unable to read ~/.ssh/id_ed25519",
		"error.sshKey.invalid format": "❌ ~/.ssh/id_ed25519 is not a valid unencrypted OpenSSH Ed25519 private key",
		"error.sshKey.passphrase-protected": "❌ ~/.ssh/id_ed25519 is passphrase-protected — remove the passphrase or use a key without one",
	},

	"zh-cn": {
		// --- Commands / ribbon / context menu ---
		"command.encryptSelection": "加密选中内容",
		"command.decrypt": "解密",
		"command.createNewEncryptedNote": "新建加密笔记",
		"command.convert": "转换为加密笔记或反向转换",
		"command.generatePassword": "生成随机密码",
		"ribbon.generatePassword": "生成随机密码",
		"menu.encryptNote": "加密文件",
		"menu.decryptNote": "解密文件",
		"menu.encryptFolder": "加密文件夹",
		"menu.decryptFolder": "解密文件夹",
		"menu.markFolder": "标记为加密文件夹",
		"menu.unmarkFolder": "取消加密文件夹标记",
		"menu.encryptFolderExisting": "加密此文件夹内现有的 .md 笔记",
		"menu.encryptSelection": "加密选中内容",
		"menu.decryptSelection": "解密选中内容",
		"command.folderEncrypt": "加密当前笔记所在文件夹",
		"command.folderDecrypt": "解密当前笔记所在文件夹",
		"command.toggleMarkFolder": "标记或取消标记当前笔记所在文件夹",
		"command.reloadSshKey": "重新加载 SSH 密钥",
		"menu.newEncryptedNote": "新建加密笔记",

		// --- Notices ---
		"notice.decryptionFailed": "❌ 解密失败！",
		"notice.encryptionFailed": "❌ 加密失败！",
		"notice.pleaseSelectTextToEncrypt": "请选择要加密的文本。",
		"notice.pleaseSelectTextToDecrypt": "请选择要解密的文本，或将光标置于加密文本上。",
		"notice.nothingToEncrypt": "没有可加密的内容。",
		"notice.nothingToDecrypt": "没有可解密的内容。",
		"notice.unableToEncryptThat": "无法加密该内容。",
		"notice.unableToDecryptThat": "无法解密该内容。",
		"notice.copied": "已复制！",
		"notice.noteEncrypted": "🔐 笔记已加密",
		"notice.noteDecrypted": "🔓 笔记已解密",
		"notice.folderNotFound": "未找到该文件夹。",
		"notice.folderNoMatchingFiles": "文件夹中没有匹配的文件。",
		"notice.folderEncryptSummary": "文件夹处理完成 — 成功：{{succeeded}}，跳过：{{skipped}}，失败：{{failed}}",
		"notice.folderMarked": "🔖 已将“{{path}}”标记为加密文件夹，新建笔记将自动加密",
		"notice.folderUnmarked": "🔓 已取消“{{path}}”的加密文件夹标记（不影响已有文件）",
		"notice.autoEncrypted": "🔐 已自动加密“{{name}}”",
		"notice.autoEncryptFailed": "❌ 自动加密“{{name}}”失败",
		"notice.sshKeyReloaded": "🔑 已从 {{source}} 加载 SSH 密钥",

		// --- Settings ---
		"settings.inPlace.heading": "行内加密",
		"settings.sshKey.name": "SSH 密钥（Ed25519）",
		"settings.sshKey.loadedDesc": "已从 {{source}} 加载",
		"settings.sshKey.reload": "重新加载",
		"settings.inPlace.expandToWholeLine.name": "将选区扩展到整行？",
		"settings.inPlace.expandToWholeLine.desc": "部分选区将扩展到整行。",
		"settings.inPlace.searchLimit.name": "标记搜索范围",
		"settings.inPlace.searchLimit.desc": "加密/解密时查找标记的最大范围。",
		"settings.inPlace.showMarkerReadingView.name": "默认在阅读时显示加密标记",
		"settings.inPlace.showMarkerReadingView.desc": "加密内联文本时，默认是否在阅读视图中显示可见标记？",

		"settings.randomPassword.heading": "生成随机密码",
		"settings.randomPassword.length": "默认长度",
		"settings.randomPassword.lengthDesc": "生成密码的字符数。",
		"settings.randomPassword.includeUppercase": "包含大写字母（A–Z）",
		"settings.randomPassword.includeLowercase": "包含小写字母（a–z）",
		"settings.randomPassword.includeNumbers": "包含数字（0–9）",
		"settings.randomPassword.includeSymbols": "包含符号（!@#$...）",

		"settings.folderEncrypt.heading": "文件夹加密",
		"settings.folderEncrypt.recursive.name": "默认递归处理",
		"settings.folderEncrypt.recursive.desc": "打开文件夹加密对话框时，默认包含子文件夹。",

		// --- Dropdown option labels ---
		// --- Modal ---
		"modal.save": "修改",
		"modal.copy": "复制",
		"modal.decryptInPlace": "行内解密",

		// --- Inline encrypt(显示){密文} format ---
		"inline.defaultVisible": "加密内容",
		"inline.clickToView": "双击输入密码查看原文",

		// --- Random password modal ---
		"modal.generatePassword.title": "生成随机密码",
		"modal.generatePassword.length.name": "长度",
		"modal.generatePassword.length.desc": "字符数量（1-256）。",
		"modal.generatePassword.upper.name": "包含大写字母（A-Z）",
		"modal.generatePassword.lower.name": "包含小写字母（a-z）",
		"modal.generatePassword.number.name": "包含数字（0-9）",
		"modal.generatePassword.symbol.name": "包含符号（!@#$...）",
		"modal.generatePassword.regenerate": "重新生成",
		"modal.generatePassword.copy": "复制",
		"modal.generatePassword.done": "完成",

		"modal.folderEncrypt.titleEncrypt": "加密文件夹",
		"modal.folderEncrypt.titleDecrypt": "解密文件夹",
		"modal.folderEncrypt.sshKeyNote": "所有笔记都将使用本地 SSH 密钥（~/.ssh/id_ed25519）加密，无需输入密码。",
		"modal.folderEncrypt.folder": "文件夹路径",
		"modal.folderEncrypt.folderDesc": "要处理的文件夹路径。默认当前笔记所在文件夹。",
		"modal.folderEncrypt.folderPlaceholder": "例如 03-Secret/Notes",
		"modal.folderEncrypt.run": "运行",
		"modal.folderEncrypt.cancel": "取消",
		"modal.folderEncrypt.processing": "处理中…",
		"modal.folderEncrypt.progress": "已处理 {{done}} / {{total}}",
		"modal.folderEncrypt.summary": "成功：{{succeeded}}，跳过：{{skipped}}，失败：{{failed}}",
		"modal.folderEncrypt.failedListTitle": "失败的文件",
		"modal.folderEncrypt.done": "完成",

		// --- 标记为加密文件夹 ---
		"modal.markFolder.title": "标记为加密文件夹",
		"modal.markFolder.desc": "在此文件夹内新建或移入的 .md 笔记都会自动加密。",
		"modal.markFolder.folder": "文件夹路径",
		"modal.markFolder.folderDesc": "要标记的文件夹路径。",
		"modal.markFolder.encryptExisting": "同时加密现有笔记",
		"modal.markFolder.encryptExistingDesc": "使用上方密码加密此文件夹中已有的 .md 笔记。",
		"modal.markFolder.confirm": "标记文件夹",

		// --- Errors ---
		"error.unableToEncryptFile": "无法加密文件",
		"error.unableToDecryptFile": "无法解密文件",
		"error.decryptionFailed": "解密失败",
		"error.encryptionFailed": "加密失败",
		"error.sshKeyUnavailable": "❌ SSH 密钥不可用 —— 需要 ~/.ssh/id_ed25519 下的无口令 Ed25519 私钥（仅桌面端）",
		"error.sshKey.not-found": "❌ 未找到 SSH 密钥 —— 期望 ~/.ssh/id_ed25519",
		"error.sshKey.no-node": "❌ SSH 密钥模式仅支持 Obsidian 桌面版",
		"error.sshKey.read-failed": "❌ 无法读取 ~/.ssh/id_ed25519",
		"error.sshKey.invalid format": "❌ ~/.ssh/id_ed25519 不是有效的无口令 OpenSSH Ed25519 私钥",
		"error.sshKey.passphrase-protected": "❌ ~/.ssh/id_ed25519 设置了口令保护 —— 请去掉口令或改用无口令密钥",
	},
};

const strings = translations[locale] ?? translations["en"];

export function t(key: string, params?: Record<string, string>): string {
	let text = strings[key] ?? translations["en"][key] ?? key;
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			text = text.replace(new RegExp(`{{${k}}}`, "g"), v);
		}
	}
	return text;
}

/**
 * Translate an SshKeyService error token (e.g. "not-found") into a
 * user-facing message. Empty / unknown tokens fall back to the generic
 * "SSH key unavailable" message.
 */
export function tSshKeyError(token: string): string {
	if (!token) {
		return t("error.sshKeyUnavailable");
	}
	return t(`error.sshKey.${token}`);
}
