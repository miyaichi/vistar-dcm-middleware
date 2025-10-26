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
| Display Time Latency | 5-30秒 | **60秒未満**（キャッシュヒット時は1-5秒） |

## 3つの主要な強化ポイント

### 1. Creative Caching（最大の付加価値）
- Vistar Creative Caching APIを使用した1時間ごとのバックグラウンド更新
- ローカルファイルシステムへの保存
- キャッシュからの即座配信（通常1-5秒）
- ネットワーク障害への耐性
- 目標：60秒未満の表示遅延（Vistar要件：15分未満）

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

### 3. PoP（Proof of Play）の確実な送信
- HTML onloadイベント → 即座にPoP送信
- 失敗時のリトライ機構
- 目標：5分以内（Vistar要件の15分以内を大幅にクリア）

## 開発スケジュール

**第1-2週:** 基本的なad request/response + HTML生成  
**第3週:** Creative Caching実装  
**第4週:** マルチプレイヤー対応  
**第5-6週:** 本番環境準備 + 認証テスト準備

### 各フェーズの詳細

#### Phase 1: 最小限の実行可能な統合（第1-2週）
**目標：** 基本的な広告配信フローの実現
- Ad Request API統合
- シンプルなHTML5プレイヤー生成
- 基本的なPoP実装
- Staging環境での初期テスト
- **マイルストーン：** テストプレイヤーで最初の広告表示成功

#### Phase 2: Creative Caching（第3週）
**目標：** オフライン耐性の実現
- Creative Caching API統合
- ローカルキャッシュ管理
- キャッシュヒット/ミス処理
- バックグラウンドキャッシュ更新
- **マイルストーン：** ネットワーク障害時も広告配信継続

#### Phase 3: マルチプレイヤー対応（第4週）
**目標：** 全MEDIAEDGEプレイヤーモデルへの最適化
- プレイヤー検出ロジック
- モデル別の`supported_media`設定
- HTML生成のバリエーション
- USDP-R1000向け直接ファイル配信対応
- **マイルストーン：** 全プレイヤータイプで正常動作確認

#### Phase 4: 本番環境準備（第5-6週）
**目標：** Vistar統合基準への適合
- モニタリング＆メトリクス機能
- エラーハンドリングの改善
- パフォーマンス最適化
- ドキュメント完成
- **マイルストーン：** 認証テスト準備完了

## 広告配信フローの例

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
         ├→ [キャッシュヒット] ✅ (1-5秒で配信)
         │
         └→ [キャッシュミス] オリジンから取得 (5-60秒で配信)
         │
6. キャッシュからHTML生成 (10:00:02-10:00:03)
         ↓
7. DCMへHTML返却
         ↓
8. プレイヤーで広告表示 (10:00:03-10:01:00)
         ↓
9. onloadイベント → VistarへPoP送信 (10:00:03-10:01:00)

キャッシュヒット時の遅延: 約3秒
キャッシュミス時の遅延: 最大60秒
```

## 次のステップ

1. **今週中：** 第1フェーズ実装完了
2. **2週目：** Staging環境でテストプレイヤーセットアップ
3. **2-3週目：** Vistarチームとの初期テスト開始
4. **3週目：** Creative Caching実装
5. **4週目：** マルチプレイヤー対応
6. **5-6週目：** 本番環境準備、認証準備

## Vistarチームへの質問

実装を進める前に、以下の点について確認したいと考えています：

1. **Caching:** Creative Caching APIの呼び出しにレート制限はありますか？
2. **ME-DEC（HTML内で動画非対応）:** `supported_media`で静止画のみリクエストすべきか、動画もリクエストして別ファイルとして配信すべきか？
3. **テスト:** 第2週終了後に初回テストコールをスケジュールできますか？
4. **Dynamic Creative:** `asset_url`ベースのキャッシュとJPEGサポート以外に追加要件はありますか？

## プロジェクト情報

**GitHubリポジトリ：**  
https://github.com/miyaichi/vistar-dcm-middleware

**プロジェクトリード：**  
Yoshihiko Miyaichi (yoshihiko.miyaichi@pier1.co.jp)

**Vistar Media担当：**
- Janice Ong (Manager, Supply Operations APAC)
- Kurt Woodford

## まとめ

当社の実装アプローチ：
- ✅ 実績のあるBroadsign Web Redirectパターンを踏襲
- ✅ Creative Cachingで優れた安定性を実現
- ✅ MEDIAEDGEプレイヤーの制約に最適化
- ✅ 95%以上のSpend Rateと60秒未満のDisplay Time Latencyを目標
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
