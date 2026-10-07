import { FileData } from "./FileDataHelper.ts";
import { Decryptable } from "../features/feature-inplace-encrypt/Decryptable.ts";
import { ICryptoHelper } from "./ICryptoHelper.ts";
import { CryptoHelperSsh } from "./CryptoHelperSsh.ts";

/**
 * Single crypto implementation: AES-256-GCM keyed directly with the local
 * OpenSSH Ed25519 seed (see SshKeyService / CryptoHelperSsh).
 *
 * Decryption never branches on a stored version number — the SSH-key helper is
 * always used, and any ciphertext that cannot be authenticated (wrong key,
 * tampered data, or a payload produced by a different scheme) simply fails and
 * surfaces an error to the user.
 */
export class CryptoHelperFactory{

	private static sshHelper = new CryptoHelperSsh( 16 );

	public static BuildDefault(): ICryptoHelper{
		return this.sshHelper;
	}

	public static BuildFromFileDataOrThrow( data: FileData ) : ICryptoHelper {
		return this.sshHelper;
	}

	public static BuildFromFileDataOrNull( data: FileData ) : ICryptoHelper | null {
		return this.sshHelper;
	}

	public static BuildFromDecryptableOrThrow( decryptable: Decryptable ) : ICryptoHelper {
		return this.sshHelper;
	}

	public static BuildFromDecryptableOrNull( decryptable: Decryptable ) : ICryptoHelper | null {
		return this.sshHelper;
	}

}
