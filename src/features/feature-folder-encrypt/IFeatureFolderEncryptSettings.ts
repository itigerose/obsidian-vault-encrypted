/**
 * A folder that has been flagged as "encrypted": every .md note created or
 * moved into it is encrypted automatically.
 *
 * Encryption is keyed with the local OpenSSH Ed25519 key, so no password is
 * stored anywhere. The legacy `hint` field may still be present in old
 * settings JSON and is ignored.
 */
export interface IMarkedFolder {
	/** Vault-relative folder path. "/" means the vault root. */
	path: string;
	/** When true, sub-folders are covered by this mark too. */
	recursive: boolean;
}

export interface IFeatureFolderEncryptSettings {
	recursive: boolean;
	/** Folders flagged as encrypted. Persisted with the plugin settings. */
	markedFolders: IMarkedFolder[];
}
