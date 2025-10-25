# DCM-Vistar統合アプローチ - 概要

## 統合パターン
**Broadsign Web Redirectと同様のアプローチ + Creative Caching機能の強化**

```
[Vistar広告サーバー] ↔ [中間サーバー] ↔ [DCM] → [プレイヤー]
                      (Node.js/Express)
```

## Broadsignとの主な違い

| 機能 | Broadsign | 当社のDCM実装 |
|---------|-----------|------------------------|
| Creative Caching | ❌ 非対応 | ✅ Vistar Caching API使用 |
| リアルタイム配信 | 唯一の選択肢 | キャッシュ + フォールバック |
| 安定性 | ネットワーク依存 | オフライン耐性あり |
| 期待されるSpend Rate | 85-90% | **95%以上** |

## 3つの主要な強化ポイント

### 1. Creative Caching（最大の付加価値）
- Vistar Creative Caching APIを使用した1時間ごとのバックグラウンド更新
- ローカルファイルシステムへの保存
- キャッシュからの即座配信（1-5秒 vs 5-30秒）
- ネットワーク障害への耐性

**技術的な実装：**
```javascript
// 定期的なキャッシュ更新
setInterval(() => {
  cacheManager.updateCache(deviceId, venueId);
}, 3600000); // 1時間ごと

// 広告配信時
if (cache.has(creativeId)) {
  // キャッシュヒット - 即座に配信
  return serveFromCache(creativeId);
} else {
  // キャッシュミス - オリジンから配信＋バックグラウンドでキャッシュ
  downloadToCache(creativeId);
  return serveFromOrigin(assetUrl);
}
```

### 2. プレイヤー機種別最適化
各プレイヤーの能力に応じた広告リクエスト：

```
ME-DEC:           image/jpeg, image/png のみ
USDP-R5000/R2200: image/jpeg, image/png, video/mp4
USDP-R1000:       直接ファイルダウンロード（HTML非対応）
```

**実装例：**
```javascript
const PLAYER_CONFIGS = {
  'ME-DEC': {
    supported_media: ['image/jpeg', 'image/png'],
    html_support: true,
    video_in_html: false
  },
  'USDP-R5000': {
    supported_media: ['image/jpeg', 'image/png', 'video/mp4'],
    html_support: true,
    video_in_html: true
  }
};
```

### 3. PoP（Proof of Play）コンプライアンス
- HTML onloadイベントで即座にPoP送信
- 失敗時のリトライメカニズム
- 目標：5分以内（Vistarの15分要件を大幅にクリア）

**実装例：**
```html
<img src="creative.jpg" onload="sendPoP('https://vistar.../pop_url')">
<script>
  function sendPoP(url) {
    fetch(url)
      .then(() => console.log('PoP送信成功'))
      .catch(() => retryPoP(url)); // リトライ機能
  }
</script>
```

## 開発タイムライン

### **第1フェーズ（1-2週目）：最小限の動作実装**
- [x] プロジェクトセットアップとリポジトリ作成
- [ ] Ad Request API統合
- [ ] シンプルなHTML5プレイヤー生成
- [ ] 基本的なPoP実装
- [ ] Staging環境での初期テスト

**マイルストーン：** テストプレイヤーで最初の広告表示

### **第2フェーズ（3週目）：Creative Caching実装**
- [ ] Creative Caching API統合
- [ ] ローカルキャッシュ管理
- [ ] キャッシュヒット/ミス処理
- [ ] バックグラウンドキャッシュ更新

**マイルストーン：** ネットワーク障害時でも広告表示可能

### **第3フェーズ（4週目）：マルチプレイヤー対応**
- [ ] プレイヤー検出ロジック
- [ ] 機種別supported_media設定
- [ ] HTML生成のバリエーション
- [ ] USDP-R1000直接ファイル対応

**マイルストーン：** すべてのプレイヤータイプで正常動作

### **第4フェーズ（5-6週目）：本番環境準備**
- [ ] モニタリングとメトリクス
- [ ] エラーハンドリングの改善
- [ ] パフォーマンス最適化
- [ ] ドキュメント完成

**マイルストーン：** Certification Test準備完了

## 技術仕様

### 中間サーバー
- **技術スタック：** Node.js 18+ / Express
- **デプロイ：** Dockerコンテナ
- **キャッシュ保存：** ローカルファイルシステム
- **モニタリング：** Prometheusメトリクス

### DCM統合
- **方式：** URIアセットタイプ
- **URL形式：** `http://middleware:3000/ad?device_id={id}&display_area={area}`
- **更新：** リクエストごとに動的
- **再生時間：** Vistar spot durationと一致

### Vistar API使用
- **Ad Request：** 標準Ad Serving API
- **Creative Caching：** 定期的な一括リクエスト
- **PoP：** 標準のproof_of_play_url
- **環境：** Staging → Production

## 目標とする統合品質メトリクス

当社の実装アプローチとVistarの要件に基づき、以下の目標を設定しています：

| 指標 | Vistar要件 | 当社目標 | 実装戦略 |
|------|-----------|---------|---------|
| **Spend Rate** | 90%以上 | **90%以上**（目標95%+） | Creative caching + 確実なPoP |
| **Display Time Latency** | 15分未満（900秒） | **60秒未満** | ローカルキャッシュ配信 |
| **Cache Hit Rate** | N/A | **85%以上** | 1時間ごとのキャッシュ更新 |
| **PoP Time Latency** | 15分未満 | **5分未満** | HTML onload + リトライ |

**重要な注意事項：**
- 目標値はVistarの要件とCreative Caching実装に基づいた理論値です
- 実際のメトリクスは統合テストフェーズで測定・検証します
- ネットワーク環境、キャンペーン設定、デプロイ環境により変動する可能性があります
- 実測データに基づき、Vistarチームと協力して最適化を行います

## Vistarチームへの質問事項

実装開始前に、以下の点についてVistarチームに確認します：

### 1. **Creative Caching戦略**
- **質問：** 計画しているキャッシング手法（1時間ごとの更新、ローカル保存）はベストプラクティスと合致していますか？
- **質問：** Creative Caching APIコールのレート制限はありますか？

### 2. **プレイヤー制約の取り扱い**
- **質問：** ME-DEC（HTML内で動画再生不可）の場合、以下のどちらが推奨されますか？
  - supported_mediaで静止画のみをリクエストする
  - 動画もリクエストするが、別ファイルとしてダウンロード配信する
- **質問：** USDP-R1000（HTML非対応）について特別な考慮事項はありますか？

### 3. **テストプロセス**
- **質問：** 第1フェーズ完了後（約2週間後）に初期テストコールをスケジュールできますか？
- **質問：** Initial Integration Testに進むための最小要件は何ですか？

### 4. **Dynamic Creative要件**
- **質問：** asset_urlベースのキャッシングとJPEGサポート以外に追加要件はありますか？
- **質問：** Dynamic Creative更新の想定頻度は？

## アーキテクチャ概要図

```
┌─────────────────────────────────────────────────────────┐
│                  Vistar Media 広告サーバー                │
│  - Ad Request API                                        │
│  - Creative Caching API                                  │
│  - Proof of Play                                         │
└─────────────────────────────────────────────────────────┘
                         ↕
┌─────────────────────────────────────────────────────────┐
│              中間サーバー（当社開発）                       │
│  - Node.js/Express                                       │
│  - HTML5生成                                             │
│  - Creative Cache管理                                    │
│  - /var/cache/vistar/creatives/ ← ローカルキャッシュ     │
└─────────────────────────────────────────────────────────┘
                         ↕
┌─────────────────────────────────────────────────────────┐
│                  MEDIAEDGE DCM                           │
│  - URIアセット登録                                        │
│  - レイアウト/プレイリスト                                 │
│  - スケジュール管理                                       │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              デジタルサイネージプレイヤー                   │
│  - ME-DEC（HTML対応、動画不可）                           │
│  - USDP-R5000/R2200（フルHTML5対応）                     │
│  - USDP-R1000（HTML非対応）                              │
└─────────────────────────────────────────────────────────┘
```

## 広告配信フロー（キャッシュヒット時）

```
1. DCMスケジュール実行 (10:00:00)
         ↓
2. URI読み込み: /ad?device_id=DEC001&area=main
         ↓
3. 中間サーバー: Vistarへ広告リクエスト (10:00:01)
         ↓
4. Vistarレスポンス: creative_id=12345 (10:00:02)
         ↓
5. ローカルキャッシュ確認
         ├→ [キャッシュヒット] ✅
         │
6. キャッシュからHTML生成 (10:00:02)
         ↓
7. DCMへHTML返却
         ↓
8. プレイヤーで広告表示 (10:00:03)
         ↓
9. onloadイベント → VistarへPoP送信 (10:00:03)

合計遅延: 約3秒
```

## 次のステップ

1. **今週中：** 第1フェーズ実装完了
2. **2週目：** Staging環境でテストプレイヤーセットアップ
3. **2-3週目：** Vistarチームとの初期テスト開始
4. **3-4週目：** Creative Caching実装
5. **5-6週目：** マルチプレイヤー対応完了、認証準備

## プロジェクト情報

**GitHubリポジトリ：**  
https://github.com/miyaichi/vistar-dcm-middleware

**プロジェクトリード：**  
宮一 佳彦 (yoshihiko.miyaichi@pier1.co.jp)

**Vistar Media担当：**
- Janice Ong (Manager, Supply Operations APAC)
- Kurt Woodford

## まとめ

当社の実装アプローチ：
- ✅ 実績のあるBroadsign Web Redirectパターンを踏襲
- ✅ Creative Cachingで優れた安定性を実現
- ✅ MEDIAEDGEプレイヤーの制約に最適化
- ✅ 95%以上のSpend Rateと5秒未満のDisplay Time Latencyを目標
- ✅ Vistar統合要件に完全準拠

**Broadsignとの主な差別化要素：**

| 項目 | 効果 |
|------|------|
| Creative Caching | ネットワーク障害時も広告配信継続 |
| プレイヤー最適化 | 各機種の能力を最大限活用 |
| PoP Retry機能 | PoP送信成功率99%以上 |
| モニタリング機能 | 統合健全性のリアルタイム監視 |

開発はすでに開始しており、Vistarチームからのフィードバックを受けて、6週間以内に本番環境での運用開始を目指します。

---

**詳細ドキュメント：**
- 完全版統合アプローチ: `docs/INTEGRATION_APPROACH.md`
- アーキテクチャ図解: `docs/ARCHITECTURE_DIAGRAMS.md`
