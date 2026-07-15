# Theme verification evidence

実行環境: `https://localhost:8443/`（Docker Compose の gateway 経由）

## 操作確認

ヘッダー右上の `OpenFace theme` セレクタを実際に操作して、各状態で次の値が一致することを確認しました。

| 選択 | `data-openface-theme` | `localStorage.openface-theme` | セレクタ値 |
|---|---|---|---|
| Standard | 属性なし（`standard`） | `standard` | `standard` |
| Solarpunk | `solarpunk` | `solarpunk` | `solarpunk` |
| Cyberpunk | `cyberpunk` | `cyberpunk` | `cyberpunk` |

その後、同じブラウザプロファイルでページを再読込しても選択したテーマが表示されることを確認しました。テーマ値を読むインラインスクリプトをレイアウトの先頭に置いているため、初期描画で標準テーマが一瞬表示されることを避けています。

## 実画面

| Standard | Solarpunk | Cyberpunk |
|---|---|---|
| ![Standard theme](standard-home.png) | ![Solarpunk theme](solarpunk-home.png) | ![Cyberpunk theme](cyberpunk-home.png) |

Solarpunk は温かい紙面、植物の緑、日光の黄を使います。Cyberpunk は濃いインク面、シアンのグリッド、マゼンタの光を使い、一覧カードも暗色パネルへ揃えて可読性を保ちます。
