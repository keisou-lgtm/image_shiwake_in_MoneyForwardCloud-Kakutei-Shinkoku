# 領収書自動仕訳システム

iPhoneで領収書を撮影 → Google Drive に保存 → Claude が読み取り・仕訳登録・証憑添付まで自動化するシステムです。

## できること

- 📸 iPhoneのショートカットでワンタップ撮影 → Google Drive へ自動保存
- 🔍 Claude が領収書の内容を読み取り（日付・金額・勘定科目・取引先）
- ✅ 登録前にユーザーが内容を確認・修正できる
- 📒 マネーフォワードクラウド確定申告へ自動で仕訳登録
- 📎 証憑画像を仕訳に自動添付（5MB超は自動圧縮）
- 🗂️ 処理済み画像をアーカイブフォルダへ自動移動

## 対象ユーザー

紙の領収書があり、マネーフォワードクラウド確定申告に連携していない銀行口座・クレジットカードでの支出を仕訳したい個人事業主・フリーランスの方。

---

## セットアップ

### 必要なもの

| ツール | 用途 |
|--------|------|
| Node.js 18以上 | ローカルサーバー実行 |
| Claude Code | AI処理・ワークフロー実行 |
| Googleアカウント | Google Drive アクセス |
| マネーフォワードクラウド確定申告アカウント | 仕訳登録 |
| iPhone（任意） | 領収書の撮影 |

---

### 1. リポジトリをクローン

```bash
git clone https://github.com/YOUR_USERNAME/receipt-automation.git
cd receipt-automation
npm install
```

---

### 2. Google Drive フォルダを作成

Google Drive 上に以下の2つのフォルダを作成します。

| フォルダ名（任意） | 用途 |
|---|---|
| `領収書_受信トレイ` | iPhoneから保存先 |
| `領収書_処理済み` | 処理後の移動先 |

各フォルダのURLから **フォルダID**（`/folders/` 以降の文字列）を控えておきます。

```
https://drive.google.com/drive/folders/【ここがフォルダID】
```

---

### 3. Google Cloud Console で認証情報を作成

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「APIとサービス」→「ライブラリ」→ **Google Drive API** を有効化
3. 「APIとサービス」→「OAuth同意画面」を設定（ユーザーの種類: 外部）
4. 「APIとサービス」→「認証情報」→「OAuth 2.0 クライアントID」を作成
   - アプリの種類: **ウェブアプリケーション**
   - 承認済みのリダイレクトURI: `http://localhost:3000/auth/callback`
5. ダウンロードしたファイルを **`credentials.json`** にリネームしてプロジェクトルートに配置

> ⚠️ `credentials.json` は `.gitignore` に含まれており、GitHubには公開されません。

---

### 4. 環境変数を設定

プロジェクトルートに `.env` ファイルを作成します。

```
PORT=3000
REDIRECT_URI=http://localhost:3000/auth/callback
```

---

### 5. CLAUDE.md のフォルダIDを書き換える

`CLAUDE.md` の先頭にある定数を自分のフォルダIDに変更します。

```
INBOX_FOLDER_ID   = 【手順2で控えた受信トレイのフォルダID】
ARCHIVE_FOLDER_ID = 【手順2で控えた処理済みフォルダのID】
```

---

### 6. マネーフォワードクラウド MCP を Claude Code に追加

Claude Code の設定ファイル（`~/.claude/settings.json`）にMoneyForward Cloud MCPサーバーを追加します。

MCPサーバーの追加方法は [Claude Code 公式ドキュメント](https://docs.anthropic.com/ja/docs/claude-code) を参照してください。

---

### 7. サーバーを起動

```bash
npm start
```

---

### 8. Google Drive を認証

ブラウザで以下にアクセスし、Googleアカウントでログインします。

```
http://localhost:3000/auth/google
```

「認証が完了しました」と表示されたら完了です。

---

## 使い方

### iPhone ショートカットの設定

1. iPhoneに **Google Drive アプリ** をインストール
2. **ショートカットアプリ** → 「+」で新規作成
3. 以下のアクションを順に追加：
   - **「写真を撮る」** — カメラを起動
   - **「ファイルに保存」** — 保存先: Google Drive の `領収書_受信トレイ` フォルダ
4. ホーム画面に追加

### 領収書を処理する

Claude Code を開き、以下のように話しかけます。

```
領収書を処理して
```

Claude が以下を自動で行います：

1. 受信トレイの画像一覧を取得
2. 各画像をOCRで読み取り（日付・金額・勘定科目・取引先を抽出）
3. ファイル名を `YYYYMMDD_金額円_勘定科目_取引先.jpg` に変更
4. **仕訳内容をユーザーに提示し、承認を求める** ← 必ず確認が入ります
5. 承認後、マネーフォワードクラウドに仕訳を登録
6. 証憑画像をアップロード（5MB超は自動圧縮）
7. 画像をアーカイブフォルダへ移動

---

## プロジェクト構成

```
.
├── src/
│   ├── index.js                    # Expressサーバー（APIルート）
│   ├── parsers/
│   │   └── googleDocsParser.js     # Google OAuth2 認証
│   ├── generators/
│   │   ├── xmindGenerator.js
│   │   └── htmlGenerator.js
│   └── services/
│       ├── googleDriveService.js   # Google Drive API 操作
│       ├── mfcAttachmentService.js # MFC 証憑アップロード
│       └── imageService.js         # 画像圧縮（5MB超対応）
├── scripts/
│   └── api.js                      # UTF-8セーフ HTTPヘルパー
├── public/
│   └── index.html
├── CLAUDE.md                        # Claude へのワークフロー指示書
├── package.json
├── .env                             # 【各自作成・非公開】
└── credentials.json                 # 【各自取得・非公開】
```

---

## 注意事項

- `credentials.json` と `token.json` は絶対に公開しないでください
- サーバー（`npm start`）はClaude Codeのセッション中は起動したままにしてください
- MoneyForward Cloud MCPのアクセストークンは1時間で失効します。失効したら再認証してください

## ライセンス

MIT
