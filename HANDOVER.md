# OpenFace 引継ぎ資料

最終更新: 2026-07-07（layout222）/ 計画: Claude Fable 5, 実装: Claude Sonnet 5 サブエージェント
初版: 2026-07-06

## 1. プロジェクト概要

セルフホスト版 HuggingFace「OpenFace」。Forgejo（Git+LFS）をバックエンドに、HF風 Next.js ポータル、Gradio Space 実行環境を docker compose で一括起動する。設計の全体像・サービス間契約は `PLAN.md`、利用手順は `README.md` を参照。

- アクセスURL: **http://localhost:8090**（ポータル） / **http://localhost:8090/git/**（Forgejo）
- 管理者: `openface-admin` / `openface1234`（`.env` で変更可。**`admin` はForgejoの予約名なので使用不可**）
- リポジトリ種別は topics（`model` / `dataset` / `space`）で判定

現フェーズのゴール: **ForgejoのUI/UXをHugging Face本家に限界まで似せる**（本家スクショ・実測CSS比較ベース）。
ユーザー要件: 手描き図形でなくFontAwesome等のアイコンを使う / 絵文字禁止 / 余白・細部まで本家寄せ / サンプルアバターは画像生成品を使用。

## 2. 現在の状態と次の一手

**コード側は layout222 まで完成済み。ただしライブ環境は layout219 のまま＝ `rebuild-forgejo.bat` が未実行。**
（確認方法: ライブHTMLの `openface.css?v=` を見る。サンドボックスから
`curl -s http://192.168.11.19:8090/git/openface/realtime-voice-space/src/branch/main | grep -o "layout[0-9]*"`）

次セッションの手順:

1. ユーザーに `rebuild-forgejo.bat` を実行してもらう（forgejo + frontend を build して up -d）
2. ライブ検証: サンドボックスから Playwright で `http://192.168.11.19:8090/...` を直接開ける（§7）。
   Chrome拡張が繋がればそれでも可（本セッションでは終始未接続だった）
3. Files desktop/mobile を再撮影し、`screenshots/goal-compare/layout221-hf-fidelity/hf-reference-*.png` と横比較
4. 残差修正 → 主要ページ（/spaces, repo landing, issues, activity, login/signup, settings, 404, editor）も同様に横比較
5. 絵文字スキャン / 主要URL 200 / docker health の最終監査

## 3. 今セッションの変更内容（layout220 → 222）

### layout220: Filesモバイル崩れの根本修正

- **根本原因**: openface.css に files toolbar 用モバイルブロックが4系統併存（行92 / 1164 / 1463 / 1594）。
  行92の `html.openface-hf-skin body[data-openface-file-list] ...` が最高specificityの `!important` を持ち、
  後から追加した修正が永久に負ける構造だった（**`!important` 同士は specificity 優先、記述順は無関係**）。
  オフライン再現環境で「tw-flex と go-to-file が同一rectに重なる」現象を再現→確定診断。
- 競合4ブロックを削除し、**ファイル末尾に単一の正規モバイルブロック「FINAL mobile Files toolbar」**
  （`@media (max-width:767px)`、`html body` プレフィックス + `!important`）を新設。以後モバイルFiles関連の
  変更はこのブロックだけを触ること（競合ブロックを再導入しない）。
- 最新コミット行は `display: table-caption` 化（colspan行が fixed-layout の列幅を汚染するのを回避）。
  caption幅は `calc(100vw - 34px)` で制約（100%指定はテーブル幅に対して効かなかった）。
- header.tmpl: branch dropdown データの script タグを DOMContentLoaded 後に DOM から除去
  （`repo-button-row.textContent` 汚染解消。Forgejo本体は window.config.pageData 経由で読むため安全）。
- frontend: blob ページの「←」テキスト矢印を `HfIcon(arrowLeft)` に置換（HfIcon.tsx に faArrowLeft 追加）。

### layout221: HF本家実測値ベースの忠実度パス

本家 `https://huggingface.co/spaces/smolagents/hf-realtime-voice/tree/main` を Playwright で実測
（computed styles を JSON 抽出）。参照スクショ: `screenshots/goal-compare/layout221-hf-fidelity/hf-reference-{desktop,mobile}.png`

実測デザイントークン（oklch→hex換算済み）:

| トークン | 値 |
|---|---|
| Sansフォント | "Source Sans Pro", 本文 16px / line-height 24px |
| Monoフォント | "IBM Plex Mono"（コミットメッセージ14px・サイズ12.8px・sha・kbd 9px） |
| 罫線 | #e5e7eb（gray-200）、ヘッダー下罫線 #f3f4f6 |
| 文字色 | メッセージ/サイズ #9ca3af、age #6b7280、アクティブタブ下線 #374151 |
| 背景 | shaチップ/バナー #f9fafb |
| コンテナ | max-width 1280px / padding 0 16px |
| ファイル行 | **高さ40px**（h-10）、padding 0 12px、border-top #e5e7eb、ゼブラなし |
| branchボタン | 34px / radius 8 / border #e5e7eb / padding 4px 12px |
| Go to file | 入力風 32px / w192 / radius 8 / 左に虫眼鏡 / 右に kbd Ctrl+K |
| Historyピル | 34px / radius 9999 / 時計アイコン付き |
| タブ | 行高52px、アクティブ = font-weight 600 + border-bottom 2px #374151 |

実装（Sonnet 5 サブエージェント、6バッチ+スクショ検証）:

- フォント5書体（SSP 400/600/700, Plex Mono 400/500, latinサブセット）を
  `forgejo/custom/public/assets/fonts/` にセルフホスト、@font-face 追加
- Filesツールバー / ファイル一覧 / コミットバナー / タブ / グローバルナビを上表の実測値で再構築
- モバイルを本家準拠に再構成: **Go to file は行1右端のアイコンボタン**（全幅バーではない）、
  行2 = contributors + Historyピル、コミットバナーは3行構成（avatar+author / monoメッセージ / shaチップ）
- Fable 5 の検証で行高 52px（`body[data-openface-file-list] ... tr.ready.entry`、行2725付近）が
  本家40pxとずれているのを検出し 40px + td padding 8px に修正

### layout222: 実環境フィードバック対応

- ユーザー報告「タイトルとタブが垂直にそろっていない」→ `.openface-repo-title-overlay` が
  `position:absolute; top:0` で上寄せだったのが原因。`top:50% + translateY(-50%)` で
  52pxタブ行と中央揃えに（行1937付近）。モバイル用オーバーライド2箇所には `transform:none` を追加済み。
- ユーザー報告「1行の高さが大きい」→ ライブが旧CSSのため（layout221で40px化済み、リビルド待ち）。
  見分け方: 旧CSS = ファイル名太字・メッセージ非mono / 新CSS = 名前400ウェイト・メッセージmono。

検証済み: CSSパースエラー0（tinycss2）、header.tmpl の script タグ1対、forgejo/custom 絵文字0。
最終スクショ: `screenshots/goal-compare/layout221-hf-fidelity/repro-files-{desktop,mobile}-layout221.png`、
`repro-files-desktop-layout222-wide.png`（1920px幅・タイトル整列後）

## 4. 検証環境（Claude作業用・重要）

### オフライン再現環境（今セッションで構築、/tmp に存在・セッション消滅時は再構築要）

サンドボックスからライブ8090へは localhost では届かないが、**LAN IP `http://192.168.11.19:8090` なら届く**（curl 200確認済み）。
それとは別に、ライブ不要のオフライン再現系を構築した:

- `/tmp/of_server.py` — 保存HTML `forgejo-realtime-tree.html` に**現行の header.tmpl を動的注入**し、
  **現行の openface.css・フォントをマウントから配信**、contents/commits API をフィクスチャで返す
  ローカルサーバー（port 8199）。Forgejoベースアセットは codeberg.org から取得済み（/tmp/of/git/assets/）
- `/tmp/of_shot.py` — mobile 390x844 / desktop 1440x900 のスクショ + toolbar計測
- Playwright chromium は `playwright install chromium` 済み。
  実行前に毎回 `export LD_LIBRARY_PATH=/tmp/libs/ex/usr/lib/x86_64-linux-gnu`（libXdamage の deb 展開）
- bash呼び出しごとにバックグラウンドプロセスが死ぬ → **サーバー起動とスクショは同一コマンド内で**:
  `cd /tmp/of && (python3 /tmp/of_server.py > server.log 2>&1 &) && sleep 1 && timeout 40 python3 -u /tmp/of_shot.py <tag>`
- HF実測データ: `/tmp/of/hf-tokens.json`, `/tmp/of/hf-tokens2.json`, `/tmp/of/hf-tree.html`（本家DOM 201KB）

### マウント同期の罠（今セッションで2回事故）

- **header.tmpl 等をホスト側ツール（Write/Edit）で編集すると、サンドボックスのマウントコピーが
  末尾切断されたまま固まる**ことがある（今回: 2249行→2235行で停止、5分待っても回復せず）。
  逆方向（サンドボックス側で編集→ホスト反映）は安定。
- **ルール: openface.css / header.tmpl の編集は必ず Linux シェル側から**
  `python3` の exact-string replace（`assert old in s` → `s.replace(old,new,1)`）で行う。
  行番号ベースの blind sed は禁止。編集後に `wc -l` / `tail` / tinycss2 パース / `grep -c "</script>"`==1 を確認。
- header.tmpl の JSコメント/文字列内に `<script` の字面を書くとHTMLパーサが壊れる（実際に発生）。

### その他の既知の癖（初版から継承）

- サンドボックスに Docker なし・root なし。ホストの docker 操作は **batファイル作成→ユーザーに実行依頼**方式
- Windows側で書かれたファイルのサンドボックス読み取りは数分遅延することがある → 最新が必要なら Read ツール（Windowsパス）
- `frontend/node_modules` に削除不能な残骸あり（ビルドには無害）

## 5. ファイル構成（主要）

```
OpenFace/
├── PLAN.md / README.md / HANDOVER.md（本書）
├── docker-compose.yml           # 5サービス（ポート ${OPENFACE_PORT:-8090}）
├── gateway/nginx.conf           # ルーティング（$http_host 修正済み）
├── forgejo/
│   ├── Dockerfile               # forgejo:11 + COPY custom/ /custom/（GITEA_CUSTOM=/custom）
│   └── custom/
│       ├── templates/custom/header.tmpl   # スキンの心臓部（inline JS ~2260行、fontAwesomeIcon()ヘルパー）
│       └── public/assets/
│           ├── css/openface.css           # ~11300行。末尾に「FINAL mobile Files toolbar」正規ブロック
│           ├── fonts/*.woff2              # SSP + Plex Mono（layout221で追加）
│           └── img/avatars/lina-park.png  # 生成済みサンプルアバター
├── frontend/                    # Next.js 14 ポータル（HfIcon.tsx = FontAwesomeラッパー）
├── spaces-runner/ / seed/ / *.bat
└── rebuild-forgejo.bat          # ★これを実行すると forgejo+frontend を再ビルド・再起動
```

- **CSS改造の原則**: 新規ルールはファイル末尾に `html body` プレフィックス + `!important` で追加
  （旧世代ルールが `!important` 込みで大量に残っているため、specificityで上回る必要がある）。
  キャッシュバスターは header.tmpl 6行目 `openface.css?v=20260707-layoutNNN` を毎回インクリメント。
- header.tmpl の Files 関連: `ensureGoToFileControl()` / `enhanceFileTable()` が
  `.openface-go-to-file` `.openface-contributors` `.openface-path-summary` と
  `data-history-label`（::before のHistoryピル）を生成。Forgejo contents/commits API で hydrate。

## 6. 運用コマンド（Windows側で実行）

- UI反映: `rebuild-forgejo.bat`（forgejo + frontend のみ再ビルド）
- 起動/全更新: `start-openface.bat`（= `docker compose up -d --build`）
- 状態確認: `docker compose ps` / ログ: `docker compose logs <service>`
- 完全リセット: `docker compose down -v`（ボリューム削除→次回起動で seed 再投入）
- Space操作API: `POST /runner-api/spaces/{owner}/{repo}/start|stop`、`GET .../status`（アイドル30分で自動停止）

## 7. 過去セッションからの継承事項

### 未確認の残作業（2026-07-06 分）

- **gateway 再起動 → Space UI の最終確認**が未完のまま持ち越されている可能性あり。
  `restart-gateway.bat` 実行後、`http://localhost:8090/openface/hello-space` の
  「▶ Run Space」iframe で E2E 確認（詳細な切り分け手順は git 履歴 or 旧HANDOVERを参照:
  SSE直叩き `POST /run/.../gradio_api/queue/join` → `GET .../queue/data`）。
  ※ ポータル側は日本語UI・絵文字アイコンの記述が旧資料にあった。**現方針は絵文字禁止**なので、
  ポータル(frontend)側に絵文字が残っていないか要再監査（forgejo/custom は監査済みクリーン）。

### 再発注意のバグ（2026-07-06 に修正済み）

1. `admin` はForgejo予約ユーザー名 → `openface-admin` を使用
2. Forgejo v9 はEOL → v11 (LTS)
3. カスタムテンプレートのアセットパスは `{{AssetUrlPrefix}}` を使う（ハードコード禁止）
4. ポート8080は既存WordPressと競合 → 8090（`.env` の `OPENFACE_PORT`）
5. 一覧件数は `X-Total-Count` ヘッダー参照（`frontend/lib/forgejo.ts`）
6. プロキシのHostヘッダー問題 → `spaces-runner/proxy.py` + `gateway/nginx.conf`（`$http_host`）修正済み

## 8. スクリーンショット索引

- `screenshots/goal-compare/layout221-hf-fidelity/`
  - `hf-reference-{desktop,mobile}.png` — **本家HFの参照スクショ**（実測時に撮影）
  - `repro-files-{desktop,mobile}-layout221.png` — 再現環境の最終状態
  - `repro-files-desktop-layout222-wide.png` — 1920px幅・タイトル/タブ整列後
- `screenshots/goal-compare/layout220-files-repro/` — モバイル崩れ修正直後
- それ以前（layout218/219）は旧世代。比較には layout221 の hf-reference を使うこと
