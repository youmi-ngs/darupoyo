# だるぽよ / Clean Your Life — 温玉

家事の「できた」を友達と共有する、スマホ向けのバーチャルシェアハウス。
**このリポジトリ1つにFrontend・Backend・テスト・公開手順をまとめています。**
提出先: https://github.com/youmi-ngs/darupoyo

## 構成と担当

```text
darupoyo/
├── index.html, src/, public/   # Frontend：Vite + JavaScript
├── backend/
│   ├── src/app/               # Backend：Python 3.12 + FastAPI
│   ├── tests/                 # 認証・所属・記録・画像のテスト
│   ├── Dockerfile             # Backend専用のCloud Runイメージ
│   └── docs/                  # API仕様・GCP設定手順
├── tests/, e2e/               # Frontend単体・接続テスト
└── .github/workflows/ci.yml   # Frontend / Backend / 結合テスト
```

Frontend担当は既存のルートとsrc/を、Backend担当はbackend/を更新する。
各自の作業ブランチからPRを作成する。API変更は同じPRで両側を更新し、
[API仕様](backend/docs/api.md) と接続テストを合わせる。
別のdarupoyo-backリポジトリは今回の統合元。今後の変更はこのリポジトリのbackend/で行う。

## ローカル起動

Node.js 22以上、uv、Python 3.12を使用する。

```sh
npm ci
npm run setup:backend
npm run dev:all
```

画面: http://127.0.0.1:5173
API仕様: http://127.0.0.1:8080/docs
停止はCtrl+C。個別起動は別ターミナルで npm run dev と npm run dev:backend。
既存のBackend仮想環境への依存同期は
`uv pip sync --python backend/.venv/bin/python backend/requirements-dev.lock`。

GCP設定なしで試せる開発用ログイン・メモリ保存・定型ほめコメントを使用する。
ハウスを作成し、別ブラウザで招待リンクを開くと2人で試せる。
**ローカルの記録はBackend再起動で消える。** 本番ではFirebase認証とFirestore/Storageを使う。
共有更新はローカル2.5秒間隔、本番Firestore通知。

### 起動のしかた（3種類）

| コマンド | Backend | ログイン・データ | 使う場面 |
|---|---|---|---|
| `npm run dev:emu` | このリポジトリのBackend（無変更） | Firebase Emulator（Auth / Firestore / Storage）、プロジェクトID `demo-darupoyo` | 本番に近い確認。電気はFirestoreのリアルタイム通知でつく |
| `npm run dev:all` | Backendのメモリ保存 | 開発用ログイン | いちばん手軽 |
| `npm run dev:mock` | なし（`src/mock.js`がブラウザ内で返事） | このブラウザだけ。タブごとに別ユーザー | Backendが動かないとき |

`dev:emu` にはJava 21（`brew install openjdk@21`）が必要。
Emulatorの画面は http://127.0.0.1:4000 、ログインはEmulatorの偽Googleアカウントで行う。
Emulatorのデータは `.emulator-data/` に残る（消すと最初から）。`demo-` で始まるIDなので本物のプロジェクトにはつながらない。
`npm run dev` でもBackendが応答しなければ自動でモックになる（開発時のみ。本番ビルドにモックは入らない）。

## 機能

- ハウス作成・最大6人の招待・マグネット・達成記録・部屋の点灯・アルバム・リアクション
- ゴミ捨て：MediaPipeによる人物切り抜きとポーズ比較。送信前に切り抜きを確認
- 洗濯：音の立ち上がり／手動タップのリズムゲーム。洗濯音の種類を分類するものではない
- 食事：写真だけ、または対応ブラウザの「いただきます」音声認識
- ドライヤー：端末内YAMNetで検出時間を蓄積
- 本番のほめコメント：BackendからVertex AI / Gemini（障害時は定型文）

カメラ・マイクはHTTPSまたはPC自身のlocalhostで使用する。
音声認識サービスへの送信の可能性は開始前に表示する。
認識精度は実機で調整が必要。元のデザイン・イラスト・アニメーションを維持している。

## テスト

```sh
npm test
npm run test:backend
npx playwright install chromium
npm run test:e2e
# ブラウザから別originのAPIへ直接接続するテスト
VITE_API_BASE_URL=http://127.0.0.1:8080/api npm run test:e2e
```

```sh
npm run test:mock          # Backendなし・モックで2タブ
npm run dev:emu            # 別ターミナルで起動してから
npm run test:emu           # 2ユーザーでログインし、リアルタイムで電気がつくか
```

E2Eはこのリポジトリ内のBackendとFrontendを自動起動する。
CIも同じリポジトリだけで単体テスト・Dockerビルド・接続テストを実行する。

## ビルド・公開

リポジトリは1つ、公開先はFrontendとBackendで独立させる。

```sh
# Frontend（ルートで実行）
VITE_API_BASE_URL=https://YOUR-CLOUD-RUN/api npm run build
firebase deploy --only hosting --project YOUR_PROJECT_ID

# Backend（ルートからビルド）
docker build --platform linux/amd64 -t darupoyo-back:local backend
# Cloud Runデプロイ：必要な環境変数を設定後
bash backend/scripts/deploy.sh
```

Frontendはdist/をFirebase Hostingなどへ、BackendはCloud Runへ配置する。
詳細は[Backendのデプロイ手順](backend/docs/deploy.md)。
ルートの `firebase.json` は Hosting と、backend/ の Firestore / Storage ルールをまとめて出す。

### 凍結が解けたら（半日デプロイの手順）

1. `.firebaserc` の `demo-darupoyo` を本物のプロジェクトIDに書きかえる。
2. Firebaseコンソールで Auth（Google）・Firestore・Storage を有効にし、Webアプリを登録して apiKey / appId を控える。
3. Backend：`backend/docs/deploy.md` の環境変数を設定して `bash backend/scripts/deploy.sh`（Cloud Run）。
4. Frontend：`VITE_API_BASE_URL=https://（Cloud RunのURL）/api npm run build` → `npx firebase deploy`。
5. Cloud Run の `CORS_ORIGINS` と Firebase Auth の承認済みドメインに Hosting のURLを登録する。
公開時はBackendのCORS_ORIGINSとFirebase Authの承認済みドメインにFrontendを登録する。
実際のGoogleサービスへの接続には対象プロジェクトの設定が必要。ローカルテストでは課金APIを呼ばない。

## 接続先・秘密情報

.env.exampleを.env.localにコピーすると接続先を変更できる。
BACKEND_ORIGINは開発用プロキシ先、VITE_API_BASE_URLはブラウザが直接呼ぶAPIのURL（末尾/api）。
変更後は開発サーバー再起動／再ビルドが必要。Backendの設定例はbackend/.env.example。

VITE_*はブラウザに公開されるため、秘密情報を入れない。
APIキー・認証情報・サービスアカウント鍵JSON・.env実値はコミットしない。
Cloud Runは実行サービスアカウント（ADC）を使い、秘密鍵JSONを作成しない。
Firebase Web設定はBackendの公開/api/configから取得する。
