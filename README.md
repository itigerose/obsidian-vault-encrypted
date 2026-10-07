# [Vault Encrypted](https://github.com/hellokunzai/obsidian-vault-encrypted) Plugin for Obsidian

**Hide secrets inside your [Obsidian.md](https://obsidian.md/) vault.**

[Vault Encrypted](https://github.com/hellokunzai/obsidian-vault-encrypted) is a community plugin that lets you encrypt and decrypt content in [Obsidian](https://obsidian.md/). You can encrypt an [entire note](https://github.com/hellokunzai/obsidian-vault-encrypted) or just [selected text within a note](https://github.com/hellokunzai/obsidian-vault-encrypted), and bulk-encrypt a whole folder.

Encrypted content is never written to disk in plaintext, giving you peace of mind that the decrypted text is never synced or backed up to external systems.

> This plugin was forked from [Meld Encrypt](https://github.com/meld-cp/obsidian-encrypt) and renamed to **Vault Encrypted**. It is maintained at <https://github.com/hellokunzai/obsidian-vault-encrypted>.

---

> [!WARNING]
> ⚠️ Use at Your Own Risk ⚠️
> - Encryption is keyed with your **local OpenSSH Ed25519 private key** (`~/.ssh/id_ed25519`). Anything encrypted by this plugin can only be decrypted on a machine that holds the same private key. Keep a backup of the key.
> - If a ciphertext cannot be authenticated (wrong or missing key, tampered data, or a payload from a different scheme) decryption simply fails and reports an error.
> - Encryption methods have not been independently audited. You are solely responsible for maintaining backups of your notes.

---

## Key mode: local SSH key (Ed25519)

Since v2.12.3.1 there are **no passwords and no prompts**. All cryptography is keyed directly with the 32-byte seed of your local OpenSSH Ed25519 private key:

- The plugin looks for an **unencrypted** private key at `~/.ssh/id_ed25519` (desktop only; Node/Electron required).
- The 32-byte Ed25519 seed is used directly as an AES-256-GCM key — no KDF, no salt, no password ever typed.
- The key is parsed locally and imported as a non-extractable `CryptoKey`; the seed never leaves memory and is never written anywhere.
- Passphrase-protected keys are rejected — remove the passphrase (`ssh-keygen -p`) or use a key without one.
- Command *Reload SSH key* re-reads the key; the settings tab shows the current key status.
- Mobile is not supported by this mode (the plugin shows a clear error instead).

---

## Features

### 1. Whole Note Encryption
Encrypt an entire note so its contents are unreadable without your SSH key.

- **New encrypted note** — `Ctrl/Cmd+P` → *Create new encrypted note*, or right-click a folder in the File Explorer → *New encrypted note*.
- **Convert existing note** — `Ctrl/Cmd+P` → *Convert to or from an Encrypted note*, or right-click a `.md` file → *Encrypt note* / right-click an encrypted file → *Decrypt note*.
- Encrypted notes open in a dedicated view and are decrypted automatically — no prompt.

### 2. Inline Encryption (行内加密)
Encrypt only a portion of a note, keeping the rest readable.

- **Encrypt Selection** — select text, then `Ctrl/Cmd+P` → *Encrypt Selection* (or right-click → *Encrypt Selection*).
- **Decrypt Selection** — click a rendered cipher block to peek, right-click → *Decrypt Selection* to replace it in place.
- Encrypted text is stored in the `encrypt(visible text){cipher}` format. The *visible text* is shown in Reading view as a clickable marker; the *cipher* is the encrypted payload.
- Legacy `🔐β …` / `🔐α …` markers are still *detected*, but their password-based cipher text can no longer be decrypted.

### 3. Folder Encryption

#### 3.1 Mark a folder as encrypted (auto-encrypt)
Flag a folder as *encrypted* and every **new** `.md` note created inside it is converted to an encrypted `.mdenc` file automatically; notes moved into the folder are encrypted too.

- Right-click a folder in the File Explorer → *Mark folder as encrypted*, and choose whether to **also encrypt the notes already inside** (on by default). No password needed.
- Marked folders and encrypted files show a 🔒 lock icon in the File Explorer.
- Right-click a marked folder to *Unmark* (removes the flag only — no bulk decrypt).
- Command *Mark / unmark folder of current note* targets the active note's folder.
- Renaming / moving / deleting a marked folder keeps the marks in sync automatically.

#### 3.2 One-shot bulk encrypt / decrypt
- Right-click a folder → *Decrypt folder*, or use commands *Encrypt folder of current note* / *Decrypt folder of current note* for a one-shot bulk operation (recursive by default).
- A summary reports succeeded / skipped / failed counts.

### 4. Random Password Generator
- Ribbon icon or `Ctrl/Cmd+P` → *Generate Random Password* opens a modal where you set length (1–256) and toggle character classes (uppercase, lowercase, numbers, symbols). Regenerate and copy with one click.

---

## Encryption

All cryptography is performed locally with the Web Crypto API (`crypto.subtle`). Since v2.12.3.1 there is a single scheme:

| Version | Marker | Key | Cipher | Notes |
| --- | --- | --- | --- | --- |
| **2.12.3.1 (current)** | file envelope `"2.12.3.1"` / inline version `"2.12.3.1"` | Ed25519 seed (32 bytes) of `~/.ssh/id_ed25519`, used directly | AES-256-GCM, random 16-byte IV | No KDF, no salt — the seed already carries high entropy. |
| 2 (β) / 1 (α) / 0 | `🔐β` / `🔐α` / `🔐` | PBKDF2(password) | AES-256-GCM | Older password-based markers. They are not produced by this build; attempting to decrypt such a payload fails with a decrypt error. |

### Data format

- **Whole-note / file encryption** writes a JSON envelope: `{ "version": "2.12.3.1", "encodedData": "<Base64>" }`. The Base64 payload is laid out as `IV(16 bytes) ‖ AES-GCM ciphertext + authentication tag`.
- **Inline encryption** embeds the Base64 payload directly in the note using the `encrypt(visible text){<payload>}` format.

---

## Installation

### Option A — BRAT (recommended for testing)
1. Install the **BRAT** plugin from the community store.
2. `Ctrl/Cmd+P` → *BRAT: Add a beta plugin*.
3. Paste the repository URL: `https://github.com/hellokunzai/obsidian-vault-encrypted`.
4. Enable **Vault Encrypted** in Community plugins.

### Option B — Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/hellokunzai/obsidian-vault-encrypted/releases).
2. Copy them into `<vault>/.obsidian/plugins/vault-encrypted/`.
3. Enable **Vault Encrypted** in **Settings → Community plugins**.

> After updating, reload with `Ctrl/Cmd+P` → *Reload app without saving* so the new `main.js` and `styles.css` take effect.

---

## Commands

| Command | Id | Description |
| --- | --- | --- |
| Create new encrypted note | `meld-encrypt-create-new-note` | Create a new fully encrypted note |
| Convert to or from an Encrypted note | `meld-encrypt-convert-to-or-from-encrypted-note` | Encrypt/decrypt the active note as a whole |
| Encrypt Selection | `meld-encrypt-in-place-encrypt` | Encrypt the selected text inline |
| Decrypt | `meld-encrypt-in-place-decrypt` | Decrypt the selected / cursor block inline |
| Encrypt folder of current note | `meld-encrypt-folder-encrypt` | Bulk-encrypt the current note's folder |
| Decrypt folder of current note | `meld-encrypt-folder-decrypt` | Bulk-decrypt the current note's folder |
| Mark / unmark folder of current note | `meld-encrypt-toggle-mark-folder` | Flag / unflag the current note's folder as encrypted (auto-encrypt new notes) |
| Generate Random Password | `meld-encrypt-generate-password` | Open the random password generator |
| Reload SSH key | `meld-encrypt-reload-ssh-key` | Re-read `~/.ssh/id_ed25519` |

---

## Settings

| Setting | Description |
| --- | --- |
| **SSH key (Ed25519)** | Shows whether the key was loaded (and from where), with a reload button. |
| **Inline encryption → Expand selection to whole line?** | Partial selections are expanded to the full line before encrypting. |
| **Inline encryption → Search limit for markers** | How far to look for markers when encrypting/decrypting. |
| **Inline encryption → By default, show encrypted marker when reading** | Whether inline encryption leaves a visible marker in Reading view. |
| **Generate random password → …** | Default length and character classes. |
| **Folder encryption → Recursive by default** | Include sub-folders when the folder dialog opens. |

---

## CLI tools

`mdenc` (build with `npm run build-tool-mdenc`) can list, test and bulk-decrypt encrypted artifacts from the command line using the same SSH key:

```
mdenc list
mdenc test                 # verify everything decrypts with ~/.ssh/id_ed25519
mdenc decrypt --outdir ./out
mdenc decrypt -k /path/to/id_ed25519 --outdir ./out
```

An offline browser decrypt page (`decrypt.html` + `offline-decrypt.ts`) lets you load the private key file manually and decrypt single notes without Obsidian.

---

## Security Notes

- Encryption is performed locally; no data leaves your device.
- Whoever can read your `~/.ssh/id_ed25519` can decrypt everything — protect it accordingly.
- The plugin relies on the Obsidian/Electron crypto primitives; it has not been independently audited.

---

## License

[MIT](./LICENSE) © hellokunzai
