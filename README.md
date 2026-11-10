# だるぽよ — チーム温玉

だるい家事を、シェアハウスの友だちとゆるく見せ合って、ギャルにほめてもらうスマホ向け Web アプリ。
洗濯・ごはん・ドライヤー・ゴミ出しの4つの家事を、カメラ・マイク・ポーズで「やった」と記録すると、
自分の部屋の電気がつき、ハウスのみんなの「け〜じばん」に貼られ、選んだギャルが Gemini でほめてくれる。
やれなかった日は「だるぽよ」として残せる。

- 本番：https://darupoyo.web.app
- リポジトリ：https://github.com/youmi-ngs/darupoyo（Frontend・Backend・テスト・公開手順をこの1つにまとめている）

---

## 目次

1. [できること](#できること)
2. [技術構成](#技術構成)
3. [ディレクトリ構成](#ディレクトリ構成)
4. [ローカルで動かす](#ローカルで動かす)
5. [テスト](#テスト)
6. [公開（デプロイ）](#公開デプロイ)
7. [API](#api)
8. [設定・秘密情報](#設定秘密情報)
9. [プライバシー](#プライバシー)
10. [関連ドキュメント](#関連ドキュメント)

---

## できること

### おうち（ホーム）
左右にスワイプして部屋を移動する。下のドットでも移動できる。

| 場所 | あるもの |
|---|---|
| 外 | ゴミ箱（ゴミ出し）・黒猫（ゴミがある間だけ）・空の天気 |
| 玄関（最初の画面） | け〜じばん（最新6件）・うちらのなう（壁かけ棚のカメラ）・「おかえり〜！」と顔を出すギャル |
| リビング | 食卓（ごはん）・時計・窓の空 |
| 洗面所 | 洗面台（ドライヤー） |
| ベランダ | 洗濯かご・物干し（洗濯）・しゃべる鳥 |
| みんなの部屋 | 住人のドア（1ページ3つ）。中で家具・アルバム・模様替え |

- 家事ができるもの（ピンク）と、家事ではないアクション（青）が光ってゆれる。
- その日に家事を1つやるか、だるぽよを共有すると、自分の部屋の電気がつく。
- 住人は1人1色のテーマカラー（16色）。部屋・干した服・ギャルの服の色になる。
- 時計と昼夜の背景は端末の時刻、空の天気は Google Weather API（東京で固定）から。

### 家事の記録

| 家事 | 記録のしかた | 判定 |
|---|---|---|
| 洗濯 | 前のカメラに上半身を映し、流れてくる音符に合わせて洗濯物をバサッ | 8拍中6回タイミングが合えばクリア（MediaPipe Pose、端末内） |
| ごはん | 写真を撮る（ライブラリからも可）→「いただきます」と言う | 言い終わると自動でサーバーの Gemini が声を確認。写真だけでも記録できる |
| ドライヤー | マイクでドライヤーの音を聞く | 10秒聞こえたらクリア（YAMNet、端末内） |
| ゴミ出し | ポーズ（サンタ・泥棒・オリジナル）で撮る | 写真が入った瞬間にポーズを判定（MediaPipe Pose、端末内）。顔と両肩が映ればよく、点数が低くても投稿できる（人が見つからないときだけ撮り直し）。人だけ切り抜いて送る（Image Segmenter、端末内） |

- 撮影画面は、写真枠の下に「ライブラリ・シャッター・カメラ切り替え」。撮ったら左上の×で撮り直し。
- どの記録にも「ひとこと」（30文字まで・任意）を付けられる。ギャルのほめ言葉にも反映される。
- 送信中は「そ〜しんちゅ〜」のアニメーション。終わると紙ふぶきとチェックが出て、写真・ひとこと・ギャルの吹き出し。そのあと「け〜じばん」か「げんかんにもどる」を選ぶ。
- ゴミ出しは、その日の一番乗りのポーズがみんなの「お手本」になり、まねっこ度が出る。
- 5分以内に同じ家事をした住人どうしは「シンクロ」になる。

### だるぽよ
やれなかった日も、写真やひとこと（任意、ギャルが責めずにひとこと返す、例：「今日はだるぽよ。いつかやる〜」）で「だるぽよ」を残せる。家事の完了にはならないが、部屋の電気はつく。

### うちらのなう
玄関の壁かけ棚のカメラから、家事とは別の「今」（ごはん・景色・ペット・自分など何でも）を撮って共有する。
ギャルが写真を見てひとことコメントし（Gemini）、ほかの住人に通知が届く。け〜じばんに貼られる。

### け〜じばん
ハウスの全員の記録・うちらのなう・だるぽよが新しい順に貼られる。タップで拡大。
拡大表示では左右スワイプで移動（横か縦の一方向だけ動く）。自分の投稿は、ひとことの編集（ギャルのひとことも書き直される）と削除ができる。

### 共有範囲
家事・うちらのなう・だるぽよの投稿画面に「🏠 実家・寮 ›」のようなボタンがあり、押すと住んでいるハウスから見せる先を選べる（「すべてのハウス」も）。選んだハウスにも同じ投稿が置かれ（写真・声はハウスごとにコピー）、そのハウスのけーじばん・部屋・通知にも出る。編集・削除は全部のハウスにまとめて反映される。家事の記録にはリアクション（♥👏✨）、すべての投稿（家事・うちらのなう・だるぽよ）にコメントができる。写真のない記録はギャルのイラスト。

### ギャル（ほめてくれる人）
平成ギャル・令和ギャル・黒ギャル・姫ギャルの4人から選ぶ（「ノリで」なら毎回ランダム）。
記録・うちらのなう・通知の言葉を、そのギャルの口調で Gemini が書く。うちらのなうは写真も見て書く（人の見た目は評価しない）。禁止ルールに反した文は使わず、決まった一言に戻す。
ホーム画面アイコンも選んだギャルになる。

### ハウス・マイページ
- はじめての画面（やっほ〜）：「すでに入居済みの家に帰る」（住んでいるハウスの一覧へ）・「友達の家に住む」（招待コード）・「新しく家をつくる」
- ハウスは最大6人。招待コード / 招待リンクで入る。複数のハウスを切り替えられる
- マイページ：名前・プロフィール写真・ハウス名・招待コード（タップでコピー）・ギャル・効果音・通知・利用規約とプライバシーポリシー
- ハウスから退去（自分の記録だけ消える）・ハウスを削除（住人が自分だけのとき）・アカウント削除
- 通知（Firebase Cloud Messaging）：友だちの家事・うちらのなう、19:00 にまだ何もしていない人へのやさしい声かけ
- あそびかた（5枚のスワイプカード。最後の1枚はホーム画面への追加。追加済みなら「もう追加できてるよ」と出る）

---

## 技術構成

```
[スマホのブラウザ]  Vite + Vanilla JavaScript（PWA / Service Worker）
  ├─ MediaPipe Pose Landmarker / Image Segmenter / YAMNet … 端末内で判定（映像・音は送らない）
  ├─ Firebase Authentication（Google ログイン）
  └─ Firestore のリアルタイム購読（ハウス・今日の記録・最新の投稿）
        │ HTTPS（ID トークン）
        ▼
[Cloud Run]  Python 3.12 + FastAPI（backend/）
  ├─ Cloud Firestore     … ハウス・記録・通知設定
  ├─ Cloud Storage       … 写真・音声
  ├─ Vertex AI Gemini    … ほめ言葉・いただきます判定・通知文・うちらのなうのコメント（写真を見る）
  ├─ Google Weather API  … 空の天気（15分キャッシュ、キーは Secret Manager）
  └─ Firebase Cloud Messaging … プッシュ通知
        ▲
[Cloud Scheduler]  毎日 19:00 に声かけ通知（POST /api/tasks/evening）
[Firebase Hosting] Frontend の配信
[GitHub Actions]   main への push でテスト → Cloud Run / Hosting へ自動デプロイ（Workload Identity Federation）
```

| 分類 | 使っているもの |
|---|---|
| Frontend | Vanilla JS、Vite 7、PWA、Web Audio（効果音・声っぽい音はその場で合成） |
| 端末内 AI | `@mediapipe/tasks-vision`（Pose・Segmenter）、`@mediapipe/tasks-audio`（YAMNet）。モデルは `public/models/` に同梱 |
| Backend | FastAPI、Uvicorn、Pillow（画像の確認・縮小） |
| 生成 AI | Vertex AI Gemini（`google-genai`）。入力は学習に使われない |
| データ | Firestore（本番）／メモリ（ローカル） |
| 認証 | Firebase Authentication（本番）／開発用トークン `dev:<uid>`（ローカル） |
| テスト | Node Test Runner、Playwright、pytest |

---

## ディレクトリ構成

```text
darupoyo/
├── index.html              # 画面の骨組み（おうちのシーン・ダイアログ）
├── src/                    # Frontend
│   ├── legacy.js           # 画面全体のつなぎ役（シーン・家事シート・部屋・アルバム）
│   ├── api.js              # Backend との通信、ログイン、Firestore 購読
│   ├── media.js            # 写真・ポーズの撮影フロー（ごはん・ゴミ出し）
│   ├── audio.js / rhythm.js / sparkle.js   # 洗濯リズム・ドライヤーの音
│   ├── meal-voice.js / voice-activity.js   # いただきます（言い終わりを音量で判定）
│   ├── pose.js / segment.js / camera.js / photo-camera.js  # MediaPipe とカメラまわり
│   ├── moments.js / moment-praise.js       # うちらのなう
│   ├── board-view.js       # け〜じばん
│   ├── darupoyo-records.js # だるぽよ
│   ├── social.js / history.js / album-calendar.js  # コメント・プロフィール写真・別ハウスの記録・カレンダー
│   ├── settings-ui.js / welcome-ui.js / install-guide.js / utility-menu.js  # マイページ・はじめての画面・ホーム追加・メニュー
│   ├── push.js / ambience.js / critters.js / resident-activities.js     # 通知・時間と天気・鳥と猫・ギャルの居場所
│   ├── gal-figure.js / themes.js / data.js  # ギャルの絵・テーマカラー・家事やギャルのデータ
│   ├── sending.js / busy.js / sfx.js / input-mode.js  # そ〜しんちゅ〜・ボタンのくるくる・効果音・フォーカス表示
│   ├── mock*.js            # Backend なしで動かすためのブラウザ内の代わり（開発時のみ）
│   └── *.css               # style（基本）・home・modal・moments・refined など
├── public/                 # 家具の絵（furniture/）・アイコン・MediaPipe モデル・Service Worker
│                           # privacy.html・terms.html（プライバシーポリシー・利用規約）
├── backend/
│   ├── src/app/            # main（API）・domain（ハウスと記録）・gals（ギャルの口調と禁止ルール）
│   │                       # services（Gemini・画像）・notify（通知）・social・accounts（削除・退去）
│   │                       # darupoyo・itadakimasu・weather・store（Firestore／メモリ）
│   ├── tests/              # pytest
│   ├── docs/api.md         # API 仕様
│   ├── firestore.rules / storage.rules
│   └── Dockerfile          # Cloud Run 用
├── tests/                  # Frontend の単体テスト（node --test）
├── e2e/ e2e-mock/ e2e-emu/ # Playwright（通常・モック・Firebase Emulator）
├── scripts/                # 起動・共有・初期設定・デプロイのスクリプト
├── deploy/                 # 公開設定（config.json）と手順（README）
└── .github/workflows/      # ci.yml（テスト）・deploy.yml（自動デプロイ）
```

---

## ローカルで動かす

Node.js 22 以上、[uv](https://docs.astral.sh/uv/)、Python 3.12 を使う。

```sh
npm ci
npm run setup:backend   # backend/.venv を作って依存を入れる
npm run dev:all         # Frontend と Backend を一緒に起動
```

- 画面：http://127.0.0.1:5173
- API 仕様（Swagger）：http://127.0.0.1:8080/docs
- 止めるときは Ctrl+C。別々に起動するなら `npm run dev` と `npm run dev:backend`。

GCP の設定なしで、開発用ログイン・メモリ保存・決まった一言のほめ言葉で動く。
**記録は Backend を止めると消える。** ハウスを作り、マイページの招待コードを別ブラウザで使うと2人で試せる。

### 起動のしかた

| コマンド | ログイン・データ | 使う場面 |
|---|---|---|
| `npm run dev:all` | 開発用ログイン・Backend のメモリ | いちばん手軽 |
| `npm run dev:mock` | Backend なし（`src/mock.js` がブラウザ内で返事）。タブごとに別ユーザー | Backend が動かないとき |
| `npm run dev:emu` | Firebase Emulator（Auth / Firestore / Storage、ID `demo-darupoyo`） | 本番に近い確認。Java 21 が必要。Emulator の画面は http://127.0.0.1:4000 |
| `npm run dev:google` | 本物の Google ログイン + メモリ保存 | ログイン・ログアウトの確認。gcloud の ADC 設定が必要 |
| `npm run dev:team -- <共有URL>` | 本物の Google ログイン + メモリ保存 | トンネル URL でチームと試す |
| `npm run share` | 開発用ログイン | cloudflared の一時 https URL でスマホから試す（**URL を知っている人は誰でも入れる**） |

- スマホのカメラ・マイクは https か、PC 自身の localhost でしか使えない。
- `npm run dev` で Backend が応答しないときは、自動でモックになる（開発時のみ。本番ビルドには入らない）。
- `dev:google` / `dev:team` の準備：

  ```sh
  gcloud auth application-default login --project=darupoyo-8ed91
  ```

---

## テスト

```sh
npm test                      # Frontend 単体（tests/*.test.mjs）
npm run test:backend          # Backend（pytest）
npx playwright install chromium
npm run test:e2e              # E2E（Backend と Frontend を自動起動）
npm run test:mock             # モック版の E2E
npm run test:emu              # Firebase Emulator 版（先に npm run dev:emu）
```

- E2E のカメラ・マイクは Chromium の疑似デバイスを使う。いただきますの声やポーズ判定は、テストの中で音量や判定モデルを差し替えて確認している。
- CI（`.github/workflows/ci.yml`）は PR ごと（と main への push）に Frontend 単体＋ビルド、Backend の pytest＋Docker ビルド、E2E を実行する。E2E は4台に分けて同時に流す（`--shard`、約4〜5分）。

---

## 公開（デプロイ）

GCP プロジェクト `darupoyo-8ed91` に、このリポジトリから公開する。
Frontend は Firebase Hosting、Backend は Docker → Cloud Build → Cloud Run（`asia-northeast1`）。

- **main に push すると自動で公開される**（`.github/workflows/deploy.yml`、Workload Identity Federation で鍵ファイルなし）。
- 手動で公開する場合：

  ```sh
  npm run setup:cloud   # 初回だけ（CLI ログインと課金アカウント接続のあと）
  npm run deploy
  ```

- 一度だけの初期設定スクリプト（プロジェクトのオーナーが実行）：

  | スクリプト | 内容 |
  |---|---|
  | `scripts/setup-github-deploy.sh` | GitHub Actions からの自動デプロイ（WIF） |
  | `scripts/setup-notifications.sh` | 通知の送信権限と 19:00 の Cloud Scheduler |
  | `scripts/setup-weather.sh` | Google Weather API のキーを Secret Manager に保存 |
  | `scripts/setup-account-deletion.mjs` | アカウント削除に必要な権限 |

詳しくは [deploy/README.md](deploy/README.md)。

---

## API

Base は `/api`。認証は `Authorization: Bearer <Firebase ID トークン>`（ローカルは `Bearer dev:<uid>`）。
ハウスの中の API は、そのハウスの住人だけが使える。詳しい仕様は [backend/docs/api.md](backend/docs/api.md)。

| 分類 | おもなエンドポイント |
|---|---|
| 設定・自分 | `GET /config`（公開設定）、`GET /me`、`DELETE /me`（アカウント削除） |
| ハウス | `POST/GET /houses`、`PUT /houses/{id}`、`POST /houses/{id}/invites`、`POST /join`、`POST /houses/{id}/leave`、`DELETE /houses/{id}` |
| 今日のようす | `GET /houses/{id}/dashboard`、`PUT /houses/{id}/goals`、`PUT /houses/{id}/profile` |
| 記録 | `POST /houses/{id}/media`、`POST /houses/{id}/completions`、`GET /houses/{id}/posts`、`POST /houses/{id}/media/{voice}/itadakimasu` |
| だるぽよ・うちらのなう | `POST/GET /houses/{id}/darupoyo`、`POST/GET /houses/{id}/moments` |
| つながり | リアクション、コメント（`/posts`・`/moments`・`/darupoyo` の `{id}/comments`）、プロフィール写真、別ハウスの記録（`/history-sharing`、`/members/{uid}/history`。画面からの切り替えはまだない） |
| 通知・天気 | `PUT /notifications`、`POST /tasks/evening`（Scheduler 専用）、`GET /weather` |

---

## 設定・秘密情報

- Frontend：`.env.example` を `.env.local` にコピーすると接続先を変えられる。
  `BACKEND_ORIGIN` は開発用プロキシ先、`VITE_API_BASE_URL` はブラウザが直接呼ぶ API の URL（末尾 `/api`）。
- Backend：`backend/.env.example` を参照。おもな設定は `APP_ENV`、`DATA_BACKEND`（memory / firestore）、
  `AUTH_MODE`（dev / firebase）、`PRAISE_BACKEND`（fallback / vertex）、`GEMINI_MODEL`、`GOOGLE_CLOUD_PROJECT`、`STORAGE_BUCKET`、`DAY_TIMEZONE`。
- Firebase の Web 設定は Backend の公開 `GET /api/config` から配る。

**秘密情報はコミットしない。**
- `VITE_*` はブラウザに公開されるので、秘密を入れない。
- API キー（Google Weather API など）は Secret Manager に置き、Cloud Run に環境変数として渡す。
- Cloud Run は実行サービスアカウント（ADC）を使い、サービスアカウントの鍵 JSON は作らない。

---

## プライバシー

利用者向けの文書は [プライバシーポリシー](https://darupoyo.web.app/privacy.html)（`public/privacy.html`）と [利用規約](https://darupoyo.web.app/terms.html)（`public/terms.html`）。対象は **18歳以上**（Gemini の利用規約が 18 歳未満の利用を認めていないため）。

**スマホの中だけで処理するもの**（送らない・保存しない）
- ゴミ出しのポーズを判定している間のカメラ映像（MediaPipe Pose）
- 洗濯のリズム中のカメラ映像（MediaPipe Pose）
- ドライヤーの音を聞いている間のマイクの音（YAMNet）

サーバーに届くのは「何秒聞こえた」「何回合った」「ポーズの体の位置」などの結果だけ。

**サーバーに送るもの**
- 投稿した写真（ごはん、ゴミ出しで撮った1枚＝人だけ切り抜いた画像、うちらのなう、だるぽよ、プロフィール写真）
- 「いただきます」の録音（最大10秒）
- ひとこと・コメント・リアクション・設定

**Gemini（Vertex AI）に送るもの**
- 「いただきます」の録音（言えているかの確認）
- うちらのなうの写真とひとこと（ギャルのひとこと）
- だるぽよの家事の種類・ひとこと・写真（あれば）（休むのを肯定するギャルのひとこと）
- 家事の記録の内容とひとこと（ほめ言葉・通知文）。家事の写真は送らない

そのほか
- 写真・音声はハウスの住人だけが見られる。ほかのハウスにも見せるかは、投稿ごとに「共有範囲」で本人が選ぶ（はじめは今のハウスだけ）。
- 天気は東京で固定して取得し、端末の位置情報は使わない。
- アカウント削除・ハウスからの退去で、本人の写真・音声・記録・コメントをまとめて消す（途中で止まってもやり直せる）。

---

## 関連ドキュメント

- [backend/docs/api.md](backend/docs/api.md) — API 仕様
- [backend/README.md](backend/README.md) — Backend の詳細
- [deploy/README.md](deploy/README.md) — 公開の初期設定と再公開
- [docs/](docs/) — 機能ごとの統合メモ
