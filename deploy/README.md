# darupoyo の公開

このリポジトリだけで Frontend と Backend を公開する。

- プロジェクト: `darupoyo-8ed91`
- Frontend: Firebase Hosting（Vite の `dist/`）
- Backend: `backend/Dockerfile` → Cloud Build → Artifact Registry `ontama` → Cloud Run `ontama-backend`
- 実行サービスアカウント: `ontama-runtime`（既存環境を使用）
- リージョン: 東京 `asia-northeast1`
- データ: Firestore `(default)`、写真: 非公開 Cloud Storage バケット
- ログイン: Firebase Authentication / Google

Firebase App Hosting は使用しない。静的な Vite アプリにサーバーは不要。
Firebase Hosting の `/api/**` と `/healthz` を Cloud Run に転送するので、
ブラウザからの接続先は同じ HTTPS origin。ローカルは従来通り Vite が API をプロキシする。

## 初回

Node.js 22 以上、Google Cloud CLI、課金アカウントを接続したプロジェクトが必要。
Firebase CLI はリポジトリの devDependencies に固定してある。

```sh
npm ci
gcloud auth login
npx firebase login
npm run setup:cloud
```

`setup:cloud` は `deploy/config.json` のプロジェクトに API、Firebase Web アプリ、
Firestore、Artifact Registry、実行サービスアカウント、写真用バケットを用意する。
既存リソースは削除しない。Firestore のロケーションは作成後に変更できない。
Google Cloud の認証情報をファイルとしてリポジトリへ保存しない。

Firebase Console の Authentication → Sign-in method で Google を有効化する。
サポートメールには管理者のメールを設定する。承認済みドメインに
`darupoyo.web.app` と `darupoyo.firebaseapp.com` があることを確認する。

Cloud Build の既定サービスアカウントにはビルド元の読取・ログ記録・
Artifact Registry への push 権限が必要。新規プロジェクトの既定権限で不足する場合は、
`gcloud builds get-default-service-account --project darupoyo-8ed91` で実際のアカウントを確認し、
そのアカウントにだけ必要な権限を設定する。

写真は Backend の認証付き API 経由で扱う。バケットには public access prevention と
uniform bucket-level access を設定し、実行 SA に objectCreator / objectViewer のみを付与する。
Firebase Storage の直接 SDK は使わず、アクセス制御は Cloud Storage IAM で行う。
そのためルートの deploy は `backend/storage.rules` を使用しない。
Firestore のブラウザ購読には `backend/firestore.rules` を公開する。

## 更新の公開

```sh
npm run deploy
```

対象プロジェクトと Firebase Web 設定を確認し、Frontend のテスト・ビルド、
Firestore ルール、Backend の Docker ビルドと Cloud Run 更新、Hosting 公開を順に実行する。
最後に画面・ヘルスチェック・公開設定・未認証 API の 401 を確認する。
Cloud Build を使うのでローカルで Docker Desktop を起動する必要はない。

公開 URL: https://darupoyo.web.app

ほめコメントは既存環境の Vertex AI / Gemini 設定を引き継ぐ。
モデルは `deploy/config.json` の `geminiModel` で指定する。定型文のみで運用する場合は
`praiseBackend` を `fallback` に変更する。音声認識自体はブラウザの機能。

## 分離して操作する場合

Frontend のみ:

```sh
VITE_API_BASE_URL=/api npm run build
npx firebase deploy --only hosting --project darupoyo-8ed91
```

Backend のみは `backend/scripts/deploy.sh`（必要な環境変数は同ファイル参照）。
通常は SDK 設定を自動取得する `npm run deploy` を使う。
