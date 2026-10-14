# 開発者向け情報（clamp-calc）

利用者向けの説明は [README.md](README.md) にあります。

## ファイル構成

```
index.html             画面（スタイルを含む）
js/clamp.js            計算（4 節リンクの解析、死点、締圧力、仮想仕事による操作力、リンク力、カタログ換算、例の寸法）。Node でも読み込み可
js/app.js              画面処理（機構図、ドラッグ、グラフ、スライダと再生、結果の表示、テーマ、入力の保存、Service Worker の登録）
sw.js                  オフライン用のキャッシュ処理（Service Worker）
manifest.webmanifest   アプリとして追加するための設定
og.png                 SNS 共有用の画像（tools/screenshots.py で作る）
icons/                 アプリアイコン（tools/make_icons.py で作る）
docs/screenshots/      README 用のスクリーンショット（tools/screenshots.py で撮る）
tests/test.js          検算テスト
.github/workflows/     push 時の自動テスト
```

## 更新して公開するとき

- `index.html`・`js/`・`icons/` を変更したら、**`sw.js` 先頭の `VERSION` を必ず上げてから** push してください。上げないと、すでに使っている人の端末に古いファイルが残り続けます
- 画面の見た目を変えたときは、`docs/screenshots/` の画像と `og.png` も撮り直してください（撮影手順は `tools/screenshots.py` の先頭）
- GitHub Pages は main ブランチのルートを公開しています

## テスト

```
node tests/test.js    # 不一致があれば終了コード 1
```

## 実装のメモ

- **点の役割**：押えアーム = A・B・S、カップラ = B・C、ロッカ = D・C。`type: 'arm'` はカップラがハンドル（握り H はカップラに付く）、`type: 'base'` はロッカがハンドル（H はロッカに付く）
- **姿勢の解き方**（`makePoser`）：ロッカの角度 ψ から C を出し、B を「A 中心・半径 |AB|」と「C 中心・半径 |BC|」の円の交点から選ぶ。2 つの交点のうち直前の B に近いほうを取り、組み立て方が途中で入れ替わらないようにする
- **たどる向き**：入れた姿勢（ロック位置）から ±0.02° 動かして S が下がる側へ進む。S の最初の極小を死点とし、ハンドルが `op` 回るか、リンクが組めなくなるか、ハンドルの回る向きが逆になるまでたどる。並べ替えて「全開 → ロック」の順にする
- **ハンドル角**：ハンドル（剛体）の絶対角を連続にし、死点で 0、閉じる向きを正にしたもの（`phi`、度）
- **締圧力**：当たり面の高さ `yc = 死点の S.y + e`、`δ = max(0, yc − S.y)`、`F = k·δ`
- **操作力**：隣り合う 2 点の差分で `Fh = k·δ·dδ / (n·dH)`。n はハンドル軸（握りと回転中心を結ぶ線）に直角な単位ベクトルで、握りが閉じる向きに動く側に向ける
- **入力の保存**：localStorage のキー `clamp-calc-inputs`。読み書きはすべて try/catch で囲み、保存できない環境でも動きます
- **テーマ**：QC Workbench の全ツールで共通のキー `qc-workbench-theme`
