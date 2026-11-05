# だるぽよ Backend

Python 3.12 / FastAPI。認証・グループ・画像・達成記録・Gemini連携のAPI。
このフォルダは提出リポジトリ darupoyo のBackend部分。Frontendは親ディレクトリ。
BackendのDockerにはFrontendのコード・Node.js・画面配信を含めない。

## ローカル開発

```sh
uv venv --python 3.12 .venv
uv pip sync --python .venv/bin/python requirements-dev.lock
bash scripts/dev.sh
```

上記はbackend/内で実行する。API: http://127.0.0.1:8080/docs 。親ディレクトリで npm ci と npm run dev を実行する。
ローカルは開発用ログイン・メモリ保存・定型ほめコメント。再起動で記録が消える。
開発用tokenは Bearer dev:alice。Cloud Runでは開発用認証／メモリ保存を禁止する。

## テスト・ビルド

```sh
uv run --python .venv/bin/python --no-project python -m pytest -q
docker build --platform linux/amd64 -t darupoyo-back:local .
docker run --rm --env-file .env.example -p 127.0.0.1:8080:8080 darupoyo-back:local
```

Backend単体でビルドできる。画面の結合テストは親ディレクトリで npm run test:e2e。

## Cloud Run・API契約

[デプロイ手順](docs/deploy.md)に沿って scripts/deploy.sh を利用する。
Firebase Auth / Firestore / Storage / Vertex AI の対象プロジェクトを設定する。
CORS_ORIGINS にはFrontendの正確なoriginを指定する。ワイルドカードは禁止。
Googleサービスの実接続確認にはプロジェクト設定が必要。ローカルテストでは課金APIを呼ばない。
[API仕様](docs/api.md) と /openapi.json がFrontendとの契約。変更時は同じPRでFrontend側も合わせて更新する。

## 秘密情報

サービスアカウント鍵JSONは作らず、Cloud Runの実行サービスアカウント（ADC）を使う。
キー・token・環境固有の値は .env／環境変数で管理し、コミットしない。
本番の認証・所属チェックはBackendが担当し、クライアントの自己申告uidを信用しない。
Notionは変更せず、このリポジトリ内で実装と説明を管理する。
