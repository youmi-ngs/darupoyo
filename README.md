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
ハウスを作成し、メニューの「招待リンク」でリンクをコピーし、別ブラウザで開くと2人で試せる。招待コードでの参加も利用できる。
**ローカルの記録はBackend再起動で消える。** 本番ではFirebase認証とFirestore/Storageを使う。
共有更新はローカル2.5秒間隔、本番Firestore通知。

## チームで Google ログインを試す（Cloud Run の課金設定不要）

Firebase に既存の `darupoyo-8ed91` を追加し、Web アプリ `darupoyo-web` を登録、
Authentication の Google ログインを有効化する。
バックエンドで ID token と失効状態を検証するため、管理者のローカル ADC を設定する。

```sh
gcloud auth application-default login --project=darupoyo-8ed91
# cloudflared の共有 URL を渡す。既存の dev:all は先に停止する。
npm run dev:team -- https://YOUR-SHARED-URL.trycloudflare.com
```

起動時に Firebase の公開 Web 設定を取得し、指定 URL のホストを Auth の承認済みドメインへ追加する。
共有 URL が変わったら、このコマンドも新しい URL で再実行する。
使わなくなった共有ホストは Firebase Console の承認済みドメインから削除する。
Google の認証情報をリポジトリや共有端末へコピーしない。

このモードは Google ログインのみ本物。写真・ハウス・記録は Mac のメモリ上に保持し、
バックエンド再起動で消える。チームの更新は 2.5 秒間隔で反映する。
Firestore と Cloud Storage は使わず、Mac とトンネルを動かしている間だけ利用できる。
通常の `npm run dev:all` は引き続き開発用ログインで起動する。

## その他のローカル起動

| コマンド | Backend | ログイン・データ | 使う場面 |
|---|---|---|---|
| `npm run dev:emu` | このリポジトリのBackend（無変更） | Firebase Emulator（Auth / Firestore / Storage）、プロジェクトID `demo-darupoyo` | 本番に近い確認。電気はFirestoreのリアルタイム通知でつく |
| `npm run dev:all` | Backendのメモリ保存 | 開発用ログイン | いちばん手軽 |
| `npm run dev:mock` | なし（`src/mock.js`がブラウザ内で返事） | このブラウザだけ。タブごとに別ユーザー | Backendが動かないとき |

`dev:emu` にはJava 21（`brew install openjdk@21`）が必要。
Emulatorの画面は http://127.0.0.1:4000 、ログインはEmulatorの偽Googleアカウントで行う。
Emulatorのデータは `.emulator-data/` に残る（消すと最初から）。`demo-` で始まるIDなので本物のプロジェクトにはつながらない。
`npm run dev` でもBackendが応答しなければ自動でモックになる（開発時のみ。本番ビルドにモックは入らない）。

## チームでスマホから試す（`npm run share`）

1台のPCで `dev:all` を動かし、Cloudflareの一時的なhttps URL（無料・登録なし）をつける。
スマホはhttpsでないとカメラ・マイクが使えないため。事前に `brew install cloudflared`。
表示されたURLをチームに送り、1人目がハウスを作って招待コードを配る。

- ログインは開発用の仮のもの。**URLを知っている人は誰でも入れる**ので、チーム内だけで共有する。
- 試し終わったら Ctrl+C で止める。止めると記録は消え、URLも使えなくなる（毎回URLは変わる）。
- 電気は2.5秒ごとの更新で反映される。


## 機能

- ハウス作成・最大6人の招待・マグネット・達成記録・部屋の点灯・アルバム・リアクション
- ゴミ捨て：MediaPipeによる人物切り抜きとポーズ比較。送信前に切り抜きを確認
- 洗濯：前のカメラに自分を映し、流れてくる音符に合わせて洗濯物をバサッと動かすリズムゲーム。8拍中6回タイミングが合えばクリア。合った瞬間に体の輪郭（MediaPipe Image Segmenter）からキラキラと効果音。映像は端末内でのみ処理し、保存・送信しない
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

E2Eはこのリポジトリ内のBackendとFrontendを自動起動する。
CIも同じリポジトリだけで単体テスト・Dockerビルド・接続テストを実行する。

## ビルド・公開

GCP プロジェクト `darupoyo-8ed91` に同じリポジトリから公開する。
Frontend は Firebase Hosting、Backend は Docker → Cloud Build → Cloud Run。
詳しい初期設定・再公開手順は [deploy/README.md](deploy/README.md)。

```sh
# 初回: CLI ログインと課金アカウント接続後
npm run setup:cloud
# Firebase Console で Google ログインを有効化後
npm run deploy
```

## 接続先・秘密情報

.env.exampleを.env.localにコピーすると接続先を変更できる。
BACKEND_ORIGINは開発用プロキシ先、VITE_API_BASE_URLはブラウザが直接呼ぶAPIのURL（末尾/api）。
変更後は開発サーバー再起動／再ビルドが必要。Backendの設定例はbackend/.env.example。

VITE_*はブラウザに公開されるため、秘密情報を入れない。
APIキー・認証情報・サービスアカウント鍵JSON・.env実値はコミットしない。
Cloud Runは実行サービスアカウント（ADC）を使い、秘密鍵JSONを作成しない。
Firebase Web設定はBackendの公開/api/configから取得する。

## 近況と部屋の演出

玄関の「みんなの今」から自撮りを任意に共有できる。写真は所属ハウス内でのみ閲覧でき、家事の達成・点灯・報酬には影響しない。
冷蔵庫の「今日やること」は初期状態では空。本人が選んだ家事だけを保存する。
時計と昼夜の背景は端末の時刻に連動する。窓の天気は固定の東京（35.68, 139.76）を[Open-Meteo](https://open-meteo.com/en/docs)から15分間隔で取得する。端末の位置情報は取得しない。天気を取得できないときも時刻の背景は表示する。
模様替えの間だけ暗いオーバーレイを外して色を確認できる。家具の揺れは端末の「視差効果を減らす」設定に従う。
