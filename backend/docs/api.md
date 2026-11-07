# Frontend接続仕様 v0.3

企画元: [最終案（Claudeまとめ）](https://app.notion.com/p/40f0042691a38072a7cefb4e240d6f66)。Notionは編集していない。
起動後の `/docs`、`/openapi.json` に型付きAPI仕様がある。
以前の汎用 `/api/input` と `/ws/input` は置換した。常時音声/映像中継はしない。

## 認証・Realtime

`Authorization: Bearer <Firebase ID token>`。uidはtokenから取得する。JSONにuser_idを渡さない。
Firebase AuthユーザーとFirestoreクライアントはBackendと同じプロジェクトを使う。
ローカル専用モードでは `Bearer dev:alice`、`Bearer dev:bob` で2人の動作を確認できる。
この認証は偽物であり、Cloud Run/productionでは起動時に拒否する。

- 書込み: このREST API。
- リアルタイム読取: Firebase JS SDKの `onSnapshot` で `houses/{houseId}`、`houses/{houseId}/days/{YYYY-MM-DD}`、`houses/{houseId}/posts` を購読。
- 一覧: `houses` のqueryには `where('member_ids', 'array-contains', currentUser.uid)` を付ける。ルールはフィルターではない。
- 日付はAsia/Tokyo。0時/復帰時に日次購読先を変更。日次ドキュメントがなければ全員未達成。
- スマホ内のMediaPipe判定とゲージは通信せず即時描画。仲間の変化はFirestoreが通知する。
- local memoryモードではFirestore購読は動かない。dashboard再取得で確認する。

[APIクライアント例](../examples/frontend-client.mjs) と [購読例](../examples/watch-house.mjs) をFrontendへ組み込める。
購読はログイン/所属確認後に開始し、画面離脱やログアウトで解除する。認証/権限エラー時は表示データを消す。

## API一覧

| Method | Path | 用途 |
|---|---|---|
| GET | /healthz | 起動確認（公開） |
| GET | /api/config | 公開Firebase Web設定・認証モード（Admin秘密情報は含まない） |
| GET | /api/me | 認証確認 |
| POST / GET | /api/houses | ハウス作成 / 自分のハウス一覧（最大50） |
| POST | /api/houses/{id}/invites | 招待コード作成（8文字、7日有効）。`token` に入る |
| POST | /api/join | 招待コードで参加、6人上限。大文字小文字・ハイフン・空白は区別しない |
| PUT | /api/notifications | この端末の通知 `{token, enabled, gal}`。`token` は Firebase Cloud Messaging の登録トークン（最大5台）、`gal` は通知の口調（heisei/reiwa/kuro/hime/random） |
| POST | /api/tasks/evening | 19時の声かけ。Cloud Scheduler の OIDC トークン（`SCHEDULER_EMAIL` / `SCHEDULER_AUDIENCE`）だけ受け付ける |
| GET | /api/houses/{id}/dashboard?day=2026-11-05 | 電気・掲示板・今日のポーズ・日次状態 |
| PUT | /api/houses/{id}/goals | 今日やる家事マグネット（空でもOK） |
| PUT | /api/houses/{id} | 家の名前を変更 `{name}`（1〜60文字）。住人なら誰でも |
| PUT | /api/houses/{id}/profile | 自分のテーマカラー `theme`（16色: pink/cyan/lilac/lime/peach/mint/cream/night/coral/sky/grape/leaf/orange/teal/berry/cocoa）・表示名 `display_name`（1〜40文字）・ギャル `gal`。片方だけでも可。テーマカラーはハウス内で1人1色：ほかの住人が使っている色は409。作成時はpink、入居時は空いている最初の色。古いハウスで色がかぶっていたら、先に住んでいた人がその色のまま、後の人を空いている色に直す |
| POST | /api/houses/{id}/media?kind=meal / cutout / voice | 画像、または「いただきます」の録音（WebM・Ogg・MP4、512KBまで）をアップロード |
| GET | /api/houses/{id}/media/{mediaId} | 所属者だけ画像を取得 |
| POST | /api/houses/{id}/completions | 達成記録、AIほめコメント |
| GET | /api/houses/{id}/posts?limit=30&before=... | 新しい順の履歴、アルバム |
| PUT | /api/houses/{id}/posts/{postId}/reaction | heart / clap / sparkles |

全データAPIは認証必須。非所属ハウスは存在を隠して404。型不正422、再送矛盾や満員409、過大入力413。
一覧には `items` と `next_cursor`（次のbefore）が返る。アルバムはpost.dayごとにまとめる。
家の部屋の配置や移動、キャラクター、ゲージ描画、写真の飾り方はFrontendの責務。

## 接続例

ハウス作成: `{"name":"温玉ハウス","display_name":"ぽよ"}`。
招待は8文字のコード（`A-Z`から`I`/`O`を除いた文字と`2-9`。例 `K7PM3QXD`）。画面では `K7PM-3QXD` のように区切って見せ、参加画面で入力された値を `{"token":"k7pm-3qxd","display_name":"友達"}` として `/api/join` へ送る。以前の長い招待token（`/#invite=...` のリンク）も期限内は使える。
マグネット: `{"chores":["meal","dryer"]}`。目標未設定でもクリアできる。

### ドライヤーの音

```json
{
  "request_id": "45d7a899-d429-4878-bb2d-a0bf968dc89c",
  "chore": "dryer",
  "method": "sound",
  "duration_seconds": 10
}
```

音の判定はFrontend。Backendは自己申告の検知結果を受け取るので、家事実行の証明ではない。
生の音声は送らない。

### 洗濯リズム

`{"request_id":"UUID", "chore":"laundry", "method":"rhythm", "hits":4, "total_beats":8, "duration_seconds":7}`。
5秒以上・1ヒット以上が必要。hitsはtotal_beatsを超えない。古い洗濯pose/sound方式は受理しない。
すべての達成に任意の `gal`（heisei/reiwa/kuro/hime、既定reiwa）を指定できる。

### ごはん

写真のみの場合は `method: "photo"` と `media_id`。音声確認を使う場合は以下の `photo_voice`。

画像のBlobを `kind=meal` でアップロードし、返ったidを指定する。

```json
{
  "request_id": "8dca451f-61e0-430c-aec1-c05d58ac1bd4",
  "chore": "meal",
  "method": "photo_voice",
  "media_id": "a56ae906-baba-4986-8612-13eff3d2ce22",
  "itadakimasu": true,
  "voice_media_id": "0f4c1c1e-7a52-4a39-9d55-2d0c9b6f7e10"
}
```

`voice_media_id` は省略可。「いただきます」が聞こえたときの録音を `kind=voice` でアップロードしたid（`photo_voice` のときだけ）。
postにも `voice_media_id` が入り、住人は `GET /api/houses/{id}/media/{voice_media_id}` で再生できる。

「いただきます」は対応ブラウザのSpeechRecognitionで確認する。写真のみへの切替を常に用意する。trueはFrontendからの確認結果であってサーバー音声認識ではない。
食事は回数制限なし。別の投稿は別request_id、同じ投稿の再送は同じrequest_idと同じ本文を使う。

### 洗濯・ゴミ捨てのポーズ

`chore: garbage`、`method: pose`。
ブラウザ内で人物を切り抜き、透明背景画像を `kind=cutout` でアップロードする。
`media_id` とMediaPipeの33個の `landmarks: [{x,y,z,visibility}, ...]` を送る。
最初のポーズ投稿はその日のテンプレートとして原子的に登録。任意の `pose_name` も指定できる。
後続はdashboardの `state.poses[chore]` を参照してFrontendでまねっこ度を計算し、
`reference_post_id` と `similarity`（0〜100）を送れる。参照先が違う場合409。
まねっこ度の低さでは不合格にしない。ポーズの合否/類似度計算法自体はFrontend実装範囲。
画像はJPEG/PNG/WebP入力、5MiB・12MPまで。人物用は実際に透明画素があることを確認するが、人物切り抜きの正しさまでサーバーは判定しない。
再エンコードしてEXIFなどを除去し、食事はJPEG、人物はPNGで非公開保存。

## 達成レスポンス

`{post: {...}, created: true|false}`。postにid、day、chore、reward、media_id、praise、sync_withなど。
Geminiを呼ぶ前に定型コメント付きの達成を確定。Gemini障害/処理途中の停止でも達成は消えない。
AIコメント生成は最大約8秒の外部呼出し待ち。Firestoreの達成反映はその前に発生する。
`praise.source: gemini` がAI生成、`fallback` は定型文。再送は新たなAI呼出しを起こさない。

## 仮置きルール（企画の未確定部分）

- ハウス作成時は1人、招待で2〜6人。最小人数に達する前も操作可能。
- 日の境界はAsia/Tokyo。
- シンクロは同じハウスの別人が同じ家事を5分以内に達成したとき。活動開始時の同時判定ではない。`SYNC_WINDOW_SECONDS`で変更可能。
- シンクロ相手は新しい投稿の `sync_with` に記録。両者は同じ投稿を購読してふせん表示できる。
- ハピネスは今日1件以上達成した人数÷現在のメンバー人数。毎日リセットするがペナルティなし。
- 最初の「ポーズ投稿」を今日の見本にする。洗濯の音だけの投稿は見本を作れないのでポーズ枠を占有しない。
- ドライヤーと洗濯音は検知時間10秒以上。洗濯音の時間は企画書に明記がなく、仮の共通値。
- リアクションはユーザーごとに1種類（再送/変更で加算しない）。

## Firestoreの保存形

`houses/{id}`: メンバーと家名。
`days/{date}`: goals/completed/poses/latest/recent。recentは直近50件のみ、全履歴はpostsに残す。
`posts/{id}`: サーバーUTC時刻、投稿、報酬、コメント、リアクション。
`media/{uuid}`: 所有者、非公開オブジェクト名。
`requests/{hash}`: ユーザーとrequest_idごとの再送管理。
`invites/{token_hash}`: 所属先と有効期限。招待token自体はDBに保存しない。

## 通知（スマホ）

- 家事が記録されると、同じハウスのほかの住人の端末へ、各自が選んだギャルの口調で知らせる（応答のあとに送信）
- 毎日19:00（Asia/Tokyo）に、その日どのハウスでも家事をしていない人へ、責めない口調で声をかける（1日1回）
- 送信は data のみの web push（`title` / `body` / `link`）。表示は `public/push-sw.js`。アプリを開いているときは画面内に出す
- 端末トークンは `notify/{uid}` に保存し、ブラウザからは読めない。届かなくなったトークンは自動で消す
- `/api/config` の `push.vapid_key` が空なら通知はオフ（画面に設定を出さない）

### 任意の自撮り・近況共有

`POST /api/houses/{house_id}/media?kind=selfie` に写真を送る（既存の画像正規化でEXIF等を除去）。
`POST /api/houses/{house_id}/moments` は `{request_id, media_id, caption?}` を受け取り、ハウスの住人が所有する自撮りだけを保存する。`caption` は140文字まで。同じrequest_idで同じ内容を再送しても重複せず、異なる内容なら409。
`GET /api/houses/{house_id}/moments?before=...` は新しい順に30件とnext_cursorを返す。
閲覧・画像取得にはハウスの所属が必要。近況は家事の記録・部屋の点灯・ハピネス・報酬に影響しない。

## 写真・共有（コメント・プロフィール写真・別ハウスの記録）

| Method | Path | 用途 |
|---|---|---|
| POST | /api/houses/{id}/posts/{postId}/comments | コメント `{request_id, text}`（1〜200文字）。request_id がそのままコメントidになり、再送しても重複しない。同じidで別の本文は409。1投稿50件まで |
| DELETE | /api/houses/{id}/posts/{postId}/comments/{commentId} | 自分のコメントだけ消せる |
| POST | /api/houses/{id}/media?kind=avatar | プロフィール写真（JPEGに再エンコード） |
| PUT / DELETE | /api/houses/{id}/avatar | `{media_id}` でこのハウスでのプロフィール写真を設定 / 外す。前の写真のファイルは消す |
| PUT | /api/houses/{id}/history-sharing | `{enabled}`。オンにしたハウスの住人だけが、本人の別ハウスでの記録を見られる |
| GET | /api/houses/{id}/members/{uid}/history | 本人の別ハウスでの投稿（新しい順、1ページ200件。`next_cursor` を `?before=` に渡して続き取得）。本人はいつでも、ほかの住人は本人がこのハウスで共有オンのときだけ（それ以外403） |
| GET | /api/houses/{id}/members/{uid}/history/{sourceHouseId}/media/{mediaId} | 上の公開済み本人投稿に紐づく写真・録音（meal / cutout / voice のみ。未投稿のアップロードは対象外） |

- コメントは投稿の `comments: [{id, user_id, text, created_at}]` に入る。投稿の購読・一覧にそのまま含まれる
- プロフィール写真は `house.members[uid].avatar_media_id`、共有設定は `house.members[uid].share_history`
- 別ハウスの記録に含めるのは本人の内容だけ（`id, day, chore, method, created_at, media_id, voice_media_id, finished_voice_media_id, reward, praise, gal, source_house_id`）。リアクション・コメント・シンクロ相手は含めない
- アカウント削除では、本人のコメント（他人の投稿上も）・プロフィール写真・共有設定も消える
