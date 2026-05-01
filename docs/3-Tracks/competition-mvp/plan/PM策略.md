# PM 策略

最後更新：2026-05-01

負責人：羅浚

## 目標

把賽前素材轉成比賽可用的規格與測試，讓團隊能從官方 fork 以可追溯的 commit 歷史重建 4 組件 MVP。

## 商業成果

展示一個可重複使用的雙城決策儀表板：

- 一張地圖回答需要在哪裡採取行動。
- 一張趨勢或異常圖回答情勢是否惡化。
- 一張比較卡回答臺北與大臺北有何差異。
- 一張 AI 決策卡說明證據、風險、建議與副作用。

## 範圍內

- 六個可能正式主題的情境矩陣。
- 資料集優先順序與備援決策。
- 評審敘事與展示腳本。
- 最終合規審查。
- 當 DE/BE/FE 合約衝突時的範圍仲裁。

## 範圍外

- 撰寫 ETL 程式碼。
- 撰寫 Go handler。
- 撰寫 Vue 元件。
- 將賽前實作程式碼複製到官方 fork。

## 必要產物

- `docs/3-Tracks/competition-mvp/plan/scenario_matrix.md`
- `docs/3-Tracks/competition-mvp/plan/demo_narrative.md`
- 最終 PM 簽核：`docs/3-Tracks/competition-mvp/verification/compliance_checklist.md`

## 完成標準

- 團隊能說明為什麼選定主題是一個公共決策問題。
- 每個 MVP 元件都有決策問題與資料來源。
- 即使沒有 AI，每個元件仍然有用。
- 展示可以直接從儀表板畫面完成，不依賴投影片。
- 不需要舊聊天紀錄也能理解重建計畫。
