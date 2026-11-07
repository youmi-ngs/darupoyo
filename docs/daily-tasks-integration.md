# 日々の記録・遊び担当の統合メモ

対象: #87 / #89 / #94 / #95。#92（ランキング）はユーザー指示で保留し、実装していません。

## 確定した動作

- 各家事の選択画面に「だるぽよ」を追加。写真または140文字以内の一言が必須。同じハウスの住人が掲示板の「だるぽよの日」で見られます。
- 写真はネイティブの写真選択・撮影から選び、5:6に切り取り、プレビュー後の「共有」で初めてアップロード。文字のみでも投稿できます。日時区切りは既存の `Domain.day()`（JST朝4時）を使用します。
- 完了、報酬、アバターの行動状態、部屋の明かり、家事完了通知には影響しません。
- 家事が完了したマグネットには「かんりょ〜」シールを重ねます。予定として貼らなかった家事も、完了すれば今日のボードに固定表示します。自己申告チェックAPIは追加していません。翌朝4時には既存の今日の状態とともにリセットされます。
- 家具はタップまたはEnter/Spaceで揺れ＋効果音。ページを開いている間の5操作ごとに特別な揺れとつけまつげが現れます。拾うと「＋1」をその場で表示するだけです。累計、サーバー保存、localStorage保存、交換機能はありません。音OFF・動きを減らす設定に従います。

## PC②: 写真・タイムラインとの接続

`POST /api/houses/{house_id}/darupoyo`

```json
{
  "request_id": "UUID（再試行で同じ値）",
  "chore": "laundry | meal | dryer | garbage",
  "caption": "任意の一言（写真がなければ必須）",
  "media_id": "任意の所有写真UUID"
}
```

写真は先に既存の `/media?kind=darupoyo` へアップロードします。他人・別ハウスの写真や他のkindのメディアは拒否します。同じrequest_id・同じ内容の再送は重複保存しません。異なる内容での再使用は409です。

応答は `{record, created}`。recordは `id, kind: 'darupoyo', user_id, chore, caption, media_id|null, day, created_at` を持ちます。完了投稿の `praise` / `reward` / `method` は持ちません。通常の `/posts` や `/moments` に混ぜていないので、それらの既存変換処理には流さないでください。

`GET /api/houses/{house_id}/darupoyo?before={cursor}` は新しい順30件の `{items, next_cursor}` を返します。朝4時以降も過去の記録は残り、ページ送りで閲覧できます。写真取得は既存の `/media/{id}` を使います。公開範囲は所属ハウスのみです。

保存時に `days/{day}.darupoyo_updated_at` を更新するため、既存のdays購読から再取得できます。これは通知用の時刻だけで、ユーザーの完了情報ではありません。フロントは保存成功時に `window` の `darupoyo:recorded` イベントを発火します。detailは `{houseId, record}`。

`src/darupoyo-records.js` が投稿ダイアログと独立した `.darupoyo-feed` を描画します。現時点では `.sv-board` に追加しています。タイムライン担当が統合するときはこのセクションを移設するか、新APIから別種の記録として表示してください。既存タイムライン描画関数・アルバム・カメラ判定は変更していません。写真は表示領域に入ったときだけ取得します。

## PC①: 家具画像との接続

`src/furniture-play.js` は `.scene .sv > .sv-obj` と自室のベッド/机/ライト/窓に遊びを付けます。家具のSVG内容や位置は変更していません。

画像に置き換える場合、要素に `data-furniture-name="くつ箱"` のような名前を付ければ遊びの対象になります。配置先は `.sv` または `.myroom` の内側にしてください。既存の家事ボタン・リンクの内側は除外されます。DOMが差し替わっても再登録されます。既存の操作を持つボタンにはこの属性を付けないでください。

シールは `src/legacy.js` の `renderBoard` で生成する `.completion-sticker` です。完了マグネットの既存クリック動作（食事後の録音など）は維持します。

## 保存と削除・競合が起きうる箇所

- 新規コレクション: `houses/{id}/darupoyo_records` と `darupoyo_requests`。両方に `user_id` を持ち、アカウント削除で本人分、最後の住人なら全件を削除します。写真は既存のmedia削除経路に含まれます。
- Firestoreクライアントから直接読むルールは追加していません。すべて所属確認付きのAPI経由です。
- バックエンドの処理・モデル・ルートは `backend/src/app/darupoyo.py` に分離。`main.py` は登録呼び出しとアップロードkind追加のみ。`accounts.py` は新規2コレクションの削除追加のみ。
- `src/legacy.js` はモジュール初期化、家事選択画面へのボタン追加、受信データの引き渡し、シール描画と完了マグネットの表示に限定。
- モックは `src/mock-darupoyo.js` に分離し、`src/mock.js` に呼び出しと削除を接続。
- スタイルは `src/daily-tasks.css` に分離。`index.html` / `src/style.css` / `src/api.js` / `src/media.js` / `domain.py` / `models.py` は変更していません。

PRのマージ・本番デプロイ・Issuesのcloseは統合担当が行います。
