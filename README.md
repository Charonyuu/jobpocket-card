# jobpocket-card

讓你的 AI 把履歷做成一張履歷卡和一個履歷網站（`yourjobpocket.com/@你的名字`）。
AI 只整理你給的內容，不會自己編；存檔和公開都由你在 yourjobpocket.com 上按。

*Let your AI turn your résumé into a résumé card and a one-page résumé website on [Job Pocket](https://yourjobpocket.com). English below.*

## 安裝

**Claude Code**

```bash
git clone https://github.com/Charonyuu/jobpocket-card ~/.claude/skills/jobpocket-card
```

**Codex**

```bash
git clone https://github.com/Charonyuu/jobpocket-card ~/.codex/skills/jobpocket-card
```

之後 `git pull` 就更新。

**Claude 網頁／App**：到 [Releases](https://github.com/Charonyuu/jobpocket-card/releases) 下載 `jobpocket-card.zip`，在 Claude 的設定 › 功能 › 技能上傳。

**ChatGPT、Gemini、其他 AI**：複製 [PROMPT.md](PROMPT.md) 整段，貼進新對話，附上履歷。

## 用法

對 AI 說「幫我用 Job Pocket 做一張履歷卡」，附上履歷 PDF。它會：

1. 列出讀到什麼，讓你先確認
2. 缺的只問你，不自己補；電話、地址這類個資會拿掉
3. 依你的職務推薦一款卡片樣式（十款：極簡白、終端機、Developer、Neo、雜誌米色、研究員、作品牆和三款放照片的）
4. 給你一個連結

點開連結是預覽（樣式隨時能換，缺照片或作品圖會告訴你補什麼）（還沒公開）。內容沒問題就用你的信箱收 6 位數驗證碼綁定，最後自己選誰看得到：

| | 網址打開 | 獵頭搜得到 | AI 和 Google 搜得到 |
|---|---|---|---|
| 網站公開＋完整給獵頭（預先選好） | 可以 | 看得到全名和網址 | 可以（你勾同意才開） |
| 網站公開＋匿名給獵頭 | 可以 | 只看到名字縮寫 | 不行 |
| 只放網站 | 可以 | 不行 | 可以選 |
| 先關著 | 不行 | 不行 | 不行 |

## 把自己原本的網站照搬過來

有接 Job Pocket MCP 的 AI（Claude Code、Codex）可以把你自己的個人網站「一模一樣」搬到 Job Pocket 網址頁：
它在瀏覽器裡用 `scripts/site-to-canvas.js` 量出每個元素的位置、字、顏色、圖片和連結，上傳圖片，
每一屏做成一塊自由畫布。履歷內容還是照常放（ATS 版只讀這裡）。日夜切換、捲動特效這類互動搬不過去，
手機上是整塊等比縮小。小卡沒有自由畫布，會從十款卡片樣式挑最接近的（程式感的網站用「終端機」、作品集用「Creative 作品牆」並放上作品圖）。

## 隱私

- 連結裡的內容放在 `#` 後面，瀏覽器不會送到伺服器；打開預覽才存成草稿，24 小時沒綁定就刪除。
- 電話、地址、身分證字號在 AI 這邊就拿掉，網站收到後再檢查一次。
- 履歷上的 Email 不會公開，只存雜湊，用來確認綁定的人是履歷本人（一樣才有「本人認證」章）。
- 沒有你本人同意，不會給獵頭、也不會被 AI 和 Google 收錄。隨時可以關掉或刪掉。

## 檔案

| 檔案 | 用途 |
|---|---|
| `SKILL.md` | 給 Claude、Codex 讀的說明 |
| `scripts/make_link.py` | 把 card.json 變成連結（只用 Python 內建函式庫）；`--post` 直接建草稿 |
| `scripts/make_link.mjs` | 同一件事的 Node 版 |
| `schema/card.v1.json` | 卡片欄位格式 |
| `PROMPT.md` | 沒有 skill 功能的 AI 用 |
| `examples/` | 虛構人物範例 |

---

## English

Install for Claude Code (`~/.claude/skills/jobpocket-card`) or Codex (`~/.codex/skills/jobpocket-card`) with
`git clone`, upload the release zip to Claude, or paste `PROMPT.md` into any other AI. Ask it to make a Job Pocket
résumé card and attach your résumé. It lists what it read, asks instead of inventing, removes phone numbers and
addresses, and gives you a link. The link opens a private preview; you save it with an email code and choose who
can see it (website only, hunters anonymously or by name, and whether AI assistants and Google may read it).

The résumé content travels after `#` in the link, which browsers do not send to servers. Unsaved drafts are deleted
after 24 hours.

## License

MIT
