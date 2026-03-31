# 領収書自動仕訳システム — Claude操作ガイド

## 重要な定数

```
INBOX_FOLDER_ID   = 1sINpf7XL_MpZNFDN7UNhw4bpJIU9meVf   （受信トレイ）
ARCHIVE_FOLDER_ID = 1lHOcuB0dxIXlXGEMbB5MXP773fIdmkcp   （処理済みアーカイブ）
SERVER_BASE_URL   = http://localhost:3000
MFC_API_BASE      = https://invoice.moneyforward.com/api/v3
```

---

## 事前準備（初回のみ）

### 1. サーバー起動

```bash
cd C:\Users\sitex\OneDrive\デスクトップ\claudecode
npm start
```

### 2. Google Drive 認証

ブラウザで http://localhost:3000/auth/google を開いてGoogleアカウントで認証。
「認証が完了しました」と表示されれば完了。

### 3. MoneyForward Cloud 認証

`mfc_ca_authorize` ツールを呼び出してURLを取得 → ブラウザで認証 → 表示されたコードを `mfc_ca_exchange` に渡す。
取得した `access_token` を以降のすべての `mfc_ca_*` 呼び出しで使う。

---

## 「領収書を処理して」と言われたときの手順

> **必ず下記の順番で実行すること。仕訳登録の前にユーザーの承認を得ること。**

### Step 1: 受信トレイの画像一覧取得

```
GET http://localhost:3000/drive/list/1sINpf7XL_MpZNFDN7UNhw4bpJIU9meVf
```

ファイルが0件であれば「受信トレイに画像がありません」とユーザーに伝えて終了。

### Step 2: 勘定科目・税区分・取引先の一覧を取得

```
mfc_ca_getAccounts(access_token)
mfc_ca_getTaxes(access_token)
mfc_ca_getTradePartners(access_token)
```

（すでにこのセッションで取得済みなら省略可）

### Step 3: 各画像をダウンロードして内容をOCR解析

各ファイルについて:

```
GET http://localhost:3000/drive/file/{fileId}
```

base64画像をClaude visionで読み取り、以下を抽出:
- **年月日**: YYYY-MM-DD形式
- **金額**: 整数（円）。税込金額を使う
- **勘定科目**: `mfc_ca_getAccounts` で取得した一覧から最も近いものを選ぶ
  - 判断に迷う場合は「旅費交通費」「会議費」「消耗品費」「接待交際費」「通信費」などを優先
- **取引先**: `mfc_ca_getTradePartners` にあればそのコードを使う。なければ店舗名をそのまま使う
- **税区分**: 一般的には「課税仕入10%」を使う。非課税・免税が明らかな場合は適切に選ぶ
- **貸方科目**: デフォルトは「現金」。レシートにカード名・電子マネー名が書いてあれば対応する科目を選ぶ

### Step 4: ファイル名を変更

> ⚠️ **重要 — 文字化け防止**: 日本語を含むJSONをBashのcurlで直接渡すとWindowsで文字化けする。
> 必ず以下の「ファイル経由」の手順を使うこと。

**手順:**

1. **Write ツール**でJSONファイルを作成する（UTF-8で書き出される）:

```json
// ファイルパス例: C:/Users/sitex/AppData/Local/Temp/rename_body.json
{
  "newName": "YYYYMMDD_金額円_勘定科目_取引先.jpg"
}
```

2. **Bash ツール**でヘルパースクリプトを実行する:

```bash
node scripts/api.js PATCH drive/file/{fileId} C:/Users/sitex/AppData/Local/Temp/rename_body.json
```

例: `20260315_3300円_消耗品費_ローソン.jpg`

### Step 5: ユーザーに仕訳一覧を提示して承認を求める

**必ず以下の形式で一覧を見せること。承認なしに仕訳を登録してはならない。**

```
以下の仕訳を登録してよいですか？

| # | 日付       | 金額    | 借方科目   | 貸方科目 | 取引先     | 税区分       |
|---|------------|---------|------------|----------|------------|--------------|
| 1 | 2026/03/15 | 3,300円 | 消耗品費   | 現金     | ローソン   | 課税仕入10%  |
| 2 | 2026/03/20 | 8,800円 | 接待交際費 | 現金     | 〇〇レストラン | 課税仕入10% |

修正したい場合は「#1の勘定科目を会議費に変更して」のようにお知らせください。
問題なければ「承認します」とお答えください。
```

修正依頼があれば修正して再度一覧を提示する。

### Step 6: 承認後 — 仕訳を登録

承認を得たら `mfc_ca_postJournals` で各仕訳を登録:

```
mfc_ca_postJournals(
  access_token,
  journal = {
    transaction_date: "YYYY-MM-DD",
    journal_type: "journal_entry",
    branches: [{
      debitor: {
        account_id: <借方科目ID>,
        value: <金額>,
        tax_id: <税区分ID>,
        trade_partner_code: <取引先コード（あれば）>
      },
      creditor: {
        account_id: <貸方科目ID>,
        value: <金額>
      },
      remark: <取引先名>
    }],
    memo: <元のファイル名>
  }
)
```

登録に成功したらレスポンスから `journal.id` を控える。

### Step 7: 処理済みフォルダへ移動

フォルダIDはASCIIのみなのでcurlで直接可:

```bash
curl -s -X POST http://localhost:3000/drive/file/{fileId}/move \
  -H "Content-Type: application/json" \
  -d "{\"oldParentId\":\"1sINpf7XL_MpZNFDN7UNhw4bpJIU9meVf\",\"newParentId\":\"1lHOcuB0dxIXlXGEMbB5MXP773fIdmkcp\"}"
```

### Step 8: 完了報告

処理した仕訳の件数・合計金額をユーザーに報告する。

---

## エラー対応

| エラー | 対処 |
|--------|------|
| `auth_required` (Drive) | ブラウザで http://localhost:3000/auth/google を開いて再認証 |
| `auth_required` (MFC) | `mfc_ca_authorize` → `mfc_ca_exchange` で再取得 |
| 画像が読み取れない | ユーザーに「この領収書は手動での入力をお願いします」と伝える |
| MFC登録エラー | エラーメッセージをユーザーに見せて確認を求める |

---

## iPhoneショートカットの設定方法

1. iPhoneに **Google Driveアプリ** をインストール
2. **ショートカットアプリ** を開く → 「+」で新規作成
3. 以下のアクションを順番に追加:
   - **「写真を撮る」** — カメラを起動して1枚撮影
   - **「ファイルに保存」** — 保存先: Google Drive の `領収書_受信トレイ` フォルダを選択
4. ショートカット名を「領収書を撮る」などに設定
5. ホーム画面やウィジェットに追加すると便利

> Google Driveフォルダの指定: ショートカットで「ファイルに保存」アクションを追加すると、
> 初回にフォルダを選択するダイアログが表示される。
> そこで `領収書_受信トレイ` フォルダ（ID: 1sINpf7XL_MpZNFDN7UNhw4bpJIU9meVf）を選択する。
