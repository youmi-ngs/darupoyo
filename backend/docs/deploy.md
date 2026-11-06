# Google Cloud / Firebase 接続

現在の `darupoyo-8ed91` への公開は、ルートの [deploy/README.md](../../deploy/README.md) と
`npm run setup:cloud` / `npm run deploy` を使用する。以下は個別構成用の参考。
ルートの構成では画像に非公開 Cloud Storage を使い、Firebase Storage ルールではなく IAM で制御する。

Backendは同じリポジトリのbackend/に置く。Vite FrontendはルートからFirebase Hostingなどに別途公開する。この手順のコマンドはbackend/内で実行する。
同じGCP/FirebaseプロジェクトのFirebase Auth、Firestore(default)、Storageを利用する。
クラウドリソースや課金はこのセットアップでは変更していない。

## 初回準備

1. 課金設定済みGCPプロジェクトをFirebaseに関連付ける。
2. Firebase Authenticationの使用するサインイン方式・承認済みドメインを設定する。
3. FirestoreをNativeモードで作成し、Cloud Storage for Firebaseの非公開バケットを準備する。
4. Cloud Run、Cloud Build、Artifact Registry、Vertex AI、Firestore、Identity Toolkit、Cloud StorageのAPIを有効化する。
5. Cloud Runと同じリージョンにDocker形式Artifact Registry（既定名 `ontama`）を作成する。
6. 専用ランタイムサービスアカウントを作り、Firestoreアクセスに `roles/datastore.user`、Vertex AI呼び出しに `roles/aiplatform.user`、認証失効確認に必要な `firebaseauth.users.get`（例: `roles/firebaseauth.viewer`）を付与する。
7. Storageは対象バケットだけにオブジェクト作成・読み取り権限を付与する（`roles/storage.objectCreator` + `roles/storage.objectViewer`）。公開URL/全ユーザーへの読取権限は設定しない。
8. デプロイ担当者にCloud Runデプロイ・ビルド実行・ランタイムSAの利用権限、Cloud Buildの実行SAにビルド元取得・イメージpush・ログ記録の権限を設定する。プロジェクトの既定ビルドSAは環境によって異なるため実設定を確認する。

ランタイム認証はサービスアカウントのADC。JSON秘密鍵は作成・配布しない。
ローカルから本物のGCPを使う場合は `gcloud auth application-default login` を使用する。
認証ファイルをリポジトリへコピーしない。

## ルールとインデックス

Firebase CLIで正しいプロジェクトを明示して実行する。

```sh
firebase deploy --project YOUR_PROJECT --only firestore:rules,firestore:indexes,storage
```

Firestoreのブラウザアクセスは所属ハウスの情報・日次状態・投稿の読取だけ。
書込みはBackendを経由する。招待トークン・再送管理・画像メタデータはブラウザから直接読めない。
Storageへのブラウザ直接アクセスも禁止。アップロード/閲覧はFirebase ID token付きAPI経由。

## Backendデプロイ

DockerにはPython Backendのみ含める。Cloud Runの /api/* がAPI、/healthz が起動確認、/docs がAPI仕様。/ には画面を配信しない。Firebase ConsoleでWebアプリを登録し、Googleログインを有効化、FrontendのホストをAuthの承認済みドメインへ追加する。
Frontendは VITE_API_BASE_URL=https://YOUR-CLOUD-RUN/api を設定してビルドする。Backendの CORS_ORIGINS はFrontendの正確なorigin（パスなし）を指定する。PCから開発用Cloud Runへ直接接続する場合はlocalhost:5173等のoriginも必要に応じて許可する。本番でAUTH_MODE=devを使わない。
`FIREBASE_WEB_API_KEY`・`FIREBASE_AUTH_DOMAIN`・`FIREBASE_APP_ID` はローカルの環境変数から渡す（リポジトリに値を保存しない）。Web API keyはブラウザへ公開される識別子であり、Adminサービスアカウントの秘密鍵とは異なる。Admin秘密鍵JSONは作成不要。

[deploy.sh](../scripts/deploy.sh) は既存プロジェクトへビルドとデプロイを行う。
初期IAM設定・API有効化・バケット作成は行わない。

```sh
export PROJECT_ID=your-project
export REGION=asia-northeast1
export STORAGE_BUCKET=your-actual-firebase-bucket
export SERVICE_ACCOUNT=ontama-runtime@your-project.iam.gserviceaccount.com
export CORS_ORIGINS=https://your-frontend.example
export GEMINI_MODEL=your-available-gemini-model-id
bash scripts/deploy.sh
```

モデルは対象プロジェクト/ロケーションで利用可能なものを確認して設定する。未指定のまま推測で課金APIを呼ばない。
モデル障害時でも達成は保存され、定型ほめコメントが返る。
Cloud RunはHTTP到達自体を許可し、データAPIはFirebase Authで認証する。
組織ポリシーが未認証のHTTP到達を禁止している場合は別途ゲートウェイ等を設計する。
`--max-instances=3` は費用の上限保証ではない。予算アラートと使用量監視も設定する。

## 確認

- `/healthz` が200、トークンなし `/api/houses` が401になること。
- FirebaseでログインしたユーザーのID tokenでハウス作成・招待・参加できること。
- 別ユーザー/別ハウスから写真・投稿が読めないこと。
- 2台で同じ日次ドキュメントを購読し、達成後に電気/掲示板が更新されること。
- 切断からの復帰時に最新状態を取得できること。日付が変わると購読先も切り替わること。
- Gemini有効時の応答の `praise.source` が `gemini` になること。`fallback` はAI生成ではない。

## 現段階の運用範囲

小規模ハッカソンMVP。画像の未投稿アップロード整理、退会/削除/招待取消、利用量制限は今後の運用機能。
個人利用を超えて公開する前に保持期間・削除フロー・ユーザーごとの使用量制限を追加する。
日次集計は日付別ドキュメントで管理するので、0時に全員のデータを書き換えるジョブは不要。

公式参考: [ID token検証](https://firebase.google.com/docs/auth/admin/verify-id-tokens)、
[Firestoreトランザクション](https://firebase.google.com/docs/firestore/manage-data/transactions)、
[リアルタイム購読](https://firebase.google.com/docs/firestore/query-data/listen)、
[Google Gen AI SDK](https://googleapis.github.io/python-genai/)。
