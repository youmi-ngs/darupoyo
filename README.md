# だるぽよ Frontend

Vite + JavaScript。元のイラスト・アニメーション・横スワイプを維持したWebアプリ。
Backend: https://github.com/nbtrmmy/darupoyo-back

## 開発

Node.js 22以上。Backendを隣のフォルダで起動してから：

```sh
npm ci
npm run dev
```

http://127.0.0.1:5173 を開く。設定なしでは /api を http://127.0.0.1:8080 にプロキシする。
接続先の変更は .env.example を .env.local にコピーする。
BACKEND_ORIGIN は開発用プロキシ先、VITE_API_BASE_URL はブラウザが直接呼ぶAPIのURL（末尾 /api）。
変更後は開発サーバー再起動／再ビルドが必要。

## ビルド・公開

```sh
VITE_API_BASE_URL=https://YOUR-CLOUD-RUN/api npm run build
firebase deploy --only hosting --project YOUR_PROJECT_ID
```

dist/ をFirebase Hostingなどの静的ホスティングに配置する。Backendは独立してCloud Runに公開する。
BackendのCORS_ORIGINSとFirebase Authの承認済みドメインにFrontendを登録する。
スマホのカメラ・マイクにはHTTPSが必要。PC自身のlocalhostは例外。
Firebase Web設定はBackendの /api/config から取得する。このリポジトリにAPIキーを記載しない。
VITE_* はブラウザに公開される。秘密情報・Admin鍵を入れない。

## テスト

```sh
npm test
npx playwright install chromium
BACKEND_DIR=../darupoyo-back npm run test:e2e
# 別originのAPI/CORS接続を検証する場合
VITE_API_BASE_URL=http://127.0.0.1:8080/api npm run test:e2e
```

E2Eは別リポジトリのBackendとFrontendを起動する。Backend側の .venv と依存ライブラリが必要。
CIはFrontend単体のテストとビルドを行う。結合テストは非公開の両リポジトリをcloneした環境で実行する。

## Frontend担当への引き継ぎ

- 画面・CSS・アニメーション：index.html、src/legacy.js、src/style.css
- API通信・ログイン・共有更新：src/backend.js
- 撮影・切り抜き・音検出・リズム：src/media.js
- APIの正本：Backendの docs/api.md と起動中の /openapi.json

API変更は両リポジトリのPRをリンクし、接続テスト後に反映する。
元のDesktopの3ファイルをコピーしてAPI接続を上書きしないこと。
ローカル記録はBackend再起動で消える。共有更新はローカル2.5秒間隔、本番Firestore通知。
音声・ポーズ認識の精度は実機で調整が必要。写真のみ／手動タップの選択肢を維持する。
