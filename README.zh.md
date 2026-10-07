# [Vault Encrypted](https://github.com/hellokunzai/obsidian-vault-encrypted) Obsidian 加密插件

**把秘密藏进你的 [Obsidian.md](https://obsidian.md/) 仓库。**

[Vault Encrypted](https://github.com/hellokunzai/obsidian-vault-encrypted) 是一款 Obsidian 社区插件，可以在 Obsidian 中对内容进行加密与解密。你可以加密[整篇笔记](https://github.com/hellokunzai/obsidian-vault-encrypted)，也可以只加密[笔记中的部分选中文本](https://github.com/hellokunzai/obsidian-vault-encrypted)，还能对整个文件夹批量加密。

加密后的内容绝不会以明文写入磁盘，你可以放心地同步或备份，无需担心解密后的内容被外泄。

> 本插件由 [Meld Encrypt](https://github.com/meld-cp/obsidian-encrypt) 衍生（fork）而来，并更名为 **Vault Encrypted**，由 <https://github.com/hellokunzai/obsidian-vault-encrypted> 维护。

---

> [!WARNING]
> ⚠️ 风险自担 ⚠️
> - 加密使用你的**本地 OpenSSH Ed25519 私钥**（`~/.ssh/id_ed25519`）。本插件加密的内容只能在持有同一把私钥的机器上解密，请妥善备份该私钥。
> - 若密文无法通过认证（密钥缺失/不符、数据被篡改，或来自其它方案的负载），解密会直接失败并报错。
> - 所使用的加密方法未经独立审计。请务必自行做好笔记备份。

---

## 密钥模式：本地 SSH 密钥（Ed25519）

自 v2.12.3.1 起，**全程无密码、无弹窗**。所有加密直接使用本地 OpenSSH Ed25519 私钥的 32 字节种子作为密钥：

- 插件自动查找 `~/.ssh/id_ed25519` 下的**无口令**私钥（仅桌面端，依赖 Node/Electron）。
- 32 字节 Ed25519 种子直接作为 AES-256-GCM 密钥 —— 无 KDF、无 salt，全程无需输入任何密码。
- 私钥仅在本地解析并导入为不可导出的 `CryptoKey`；种子只驻留内存，绝不写盘。
- **不支持**设置了口令保护的私钥 —— 请用 `ssh-keygen -p` 去掉口令，或改用无口令密钥。
- 命令 *重新加载 SSH 密钥* 可重新读取；设置页会显示当前密钥状态。
- 移动端不支持此模式（会显示明确错误提示）。

---

## 功能特性

### 1. 整篇笔记加密
加密整篇笔记，没有你的 SSH 密钥则内容完全不可读。

- **新建加密笔记** —— `Ctrl/Cmd+P` → *新建加密笔记*，或在文件资源管理器中右键文件夹 → *新建加密笔记*。
- **转换现有笔记** —— `Ctrl/Cmd+P` → *转换为加密笔记或反向转换*；或在文件资源管理器中右键 `.md` 文件 → *加密笔记* / 右键已加密文件 → *解密笔记*。
- 加密笔记以专用视图打开并自动解密 —— 无需任何输入。

### 2. 行内加密（Inline Encryption）
只加密笔记中的部分内容，其余部分保持可读。

- **加密选中内容** —— 选中文本后 `Ctrl/Cmd+P` → *加密选中内容*（或右键 → *加密选中内容*）。
- **解密选中内容** —— 单击渲染出的加密块即可查看原文；右键 → *解密选中内容* 可原位替换为明文。
- 加密文本以 `encrypt(可见文本){密文}` 格式存储。*可见文本* 在阅读视图中显示为可点击标记；*密文* 为加密后的内容。
- 旧版 `🔐β …` / `🔐α …` 标记仍可**识别**，但其密码式密文已无法解密。

### 3. 文件夹加密

#### 3.1 标记为加密文件夹（自动加密）
把某个文件夹「标记为加密文件夹」后，**该文件夹下新建的 `.md` 笔记会自动转为加密文件**（`.mdenc`）；从别处移入该文件夹的笔记也会自动加密。

- 在文件资源管理器中右键文件夹 → *标记为加密文件夹*，选择是否**同时加密文件夹内已有的笔记**（默认开启）。无需密码。
- 已标记的文件夹在文件资源管理器中显示 🔒 锁图标，加密文件也会显示锁图标。
- 右键已标记文件夹可 *取消标记*（仅移除标记，不会批量解密）。
- 命令 *标记 / 取消标记当前笔记所在文件夹* 作用于当前笔记所在的文件夹。
- 重命名 / 移动 / 删除标记文件夹时，标记会自动跟随或清理。

#### 3.2 一次性批量加密 / 解密
- 在文件资源管理器中右键文件夹 → *解密文件夹*，或命令 *加密当前笔记所在文件夹* / *解密当前笔记所在文件夹*，可对该文件夹（默认递归）一次性批量加 / 解密。
- 处理完成后会汇总成功 / 跳过 / 失败的数量。

### 4. 随机密码生成器
- 通过功能区（Ribbon）图标或 `Ctrl/Cmd+P` → *生成随机密码* 打开弹窗，设置长度（1–256）并勾选字符类型（大写、小写、数字、符号），一键重新生成并复制。

---

## 加密原理

所有加密均在本地通过 Web Crypto API（`crypto.subtle`）完成。自 v2.12.3.1 起只有一套方案：

| 版本 | 标记 | 密钥 | 算法 | 说明 |
| --- | --- | --- | --- | --- |
| **2.12.3.1（当前）** | 文件信封 `"2.12.3.1"` / 行内版本 `"2.12.3.1"` | `~/.ssh/id_ed25519` 的 Ed25519 种子（32 字节）直接作密钥 | AES-**256**-GCM，随机 16 字节 IV | 无 KDF、无 salt —— 种子本身即高熵密钥。 |
| 2（β）/ 1（α）/ 0 | `🔐β` / `🔐α` / `🔐` | PBKDF2(password) | AES-256-GCM | 旧版密码式标记。本版本不再生成；尝试解密这类负载会直接解密失败。 |

### 数据格式

- **整篇 / 文件加密** 写入一个 JSON 信封：`{ "version": "2.12.3.1", "encodedData": "<Base64>" }`。Base64 负载的字节布局为 `IV(16 字节) ‖ AES-GCM 密文 + 认证标签`。
- **行内加密** 将 Base64 负载直接嵌入笔记，使用 `encrypt(可见文本){<负载>}` 格式。

---

## 安装

### 方式一 —— BRAT（推荐用于测试）
1. 在社区插件中安装 **BRAT** 插件。
2. `Ctrl/Cmd+P` → *BRAT: Add a beta plugin*。
3. 粘贴仓库地址：`https://github.com/hellokunzai/obsidian-vault-encrypted`。
4. 在「社区插件」中启用 **Vault Encrypted**。

### 方式二 —— 手动安装
1. 从[最新发布页](https://github.com/hellokunzai/obsidian-vault-encrypted/releases)下载 `main.js`、`manifest.json`、`styles.css`。
2. 将三者复制到 `<vault>/.obsidian/plugins/vault-encrypted/` 目录。
3. 在 **设置 → 社区插件** 中启用 **Vault Encrypted**。

> 更新后请通过 `Ctrl/Cmd+P` → *Reload app without saving* 重新加载，使新的 `main.js` 与 `styles.css` 生效。

---

## 命令列表

| 命令 | Id | 说明 |
| --- | --- | --- |
| 新建加密笔记 | `meld-encrypt-create-new-note` | 新建一篇完整加密的笔记 |
| 转换为加密笔记或反向转换 | `meld-encrypt-convert-to-or-from-encrypted-note` | 整篇加密 / 解密当前笔记 |
| 加密选中内容 | `meld-encrypt-in-place-encrypt` | 对选中文本进行行内加密 |
| 解密 | `meld-encrypt-in-place-decrypt` | 对选中 / 光标所在块进行行内解密 |
| 加密当前笔记所在文件夹 | `meld-encrypt-folder-encrypt` | 批量加密当前笔记所在文件夹 |
| 解密当前笔记所在文件夹 | `meld-encrypt-folder-decrypt` | 批量解密当前笔记所在文件夹 |
| 标记或取消标记当前笔记所在文件夹 | `meld-encrypt-toggle-mark-folder` | 标记 / 取消标记当前笔记所在文件夹（自动加密新建笔记） |
| 生成随机密码 | `meld-encrypt-generate-password` | 打开随机密码生成器 |
| 重新加载 SSH 密钥 | `meld-encrypt-reload-ssh-key` | 重新读取 `~/.ssh/id_ed25519` |

---

## 设置项

| 设置 | 说明 |
| --- | --- |
| **SSH 密钥（Ed25519）** | 显示密钥是否已加载（及来源路径），附重新加载按钮。 |
| **行内加密 → 将选区扩展到整行？** | 部分选区在加密前自动扩展为整行。 |
| **行内加密 → 标记搜索范围** | 加密 / 解密时查找标记的最大范围。 |
| **行内加密 → 默认在阅读时显示加密标记** | 行内加密是否在阅读视图中保留可见标记。 |
| **生成随机密码 → …** | 默认长度与字符类型。 |
| **文件夹加密 → 默认递归处理** | 打开文件夹对话框时默认包含子文件夹。 |

---

## 命令行工具

`mdenc`（`npm run build-tool-mdenc` 构建）可在命令行用同一把 SSH 密钥列出、校验、批量解密加密内容：

```
mdenc list
mdenc test                 # 校验所有内容能否用 ~/.ssh/id_ed25519 解密
mdenc decrypt --outdir ./out
mdenc decrypt -k /path/to/id_ed25519 --outdir ./out
```

离线浏览器解密页（`decrypt.html` + `offline-decrypt.ts`）支持手动加载私钥文件，在没有 Obsidian 的环境下解密单篇笔记。

---

## 安全说明

- 加密在本地完成，数据不会离开你的设备。
- 任何能读取 `~/.ssh/id_ed25519` 的人都能解密全部内容 —— 请妥善保护私钥。
- 插件依赖 Obsidian / Electron 的加密原语，未经独立审计。

---

## 许可证

[MIT](./LICENSE) © hellokunzai
