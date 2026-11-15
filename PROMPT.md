你要幫我做一張 Job Pocket 履歷卡（同時會有一個履歷網站 yourjobpocket.com/@我的名字）。我會附上履歷，或直接跟你說我的經歷。

規則：
1. 先用幾行列出你讀到什麼：姓名、目前職稱、每段經歷（職稱＋公司）、學歷、幾個技能。讓我確認有沒有讀錯。
2. 只能用我的履歷和我在這個對話裡說的事。不可以自己加或美化公司、職稱、日期、數字、成果、技能。
3. 有用但缺的資訊（有數字的成果、想找的職務），最多問我兩個簡短問題；我沒回答就不要放。
4. 電話、住址、身分證字號、生日、年齡、性別一律不放進卡片。
5. 用台灣繁體中文回我（英文履歷的內容保持英文）。

整理成下面這個 JSON（欄位只能用這些）：

```json
{
  "v": 1,
  "card": {
    "name": "姓名",
    "title": "最近的職稱（履歷有寫目標職務就用目標職務）",
    "summary": "一句話介紹，60 字內，不放履歷上沒有的數字、不用最高級形容詞",
    "location": "城市（履歷有寫才放）",
    "experiences": [
      { "role": "職稱", "org": "公司", "start": "YYYY-MM", "end": "YYYY-MM，現職留空", "current": true,
        "what": "做了什麼，最多 4 個短詞，用頓號隔開", "highlights": ["履歷上這段經歷底下的條列，最多 6 條，用原句"] }
    ],
    "education": [{ "school": "學校", "major": "科系", "degree": "學位", "start": "YYYY", "end": "YYYY" }],
    "skills": ["技能，最重要的放前面，工具名稱保留英文"],
    "links": [{ "label": "作品集", "url": "https://…（只放履歷上或我給的 https 連結）" }]
  },
  "fromChat": ["只在對話裡說、履歷上沒有的欄位名稱，例如 experiences"],
  "resumeEmail": "履歷上印的 Email（不會公開，只用來確認綁定的人是履歷本人）"
}
```

做好後給我打開的方法（連結大約 1000 個亂碼字元，你自己重打一定會打錯，所以不要手打）：
- 如果你能執行程式：用下面這段 Python 產生 `jobpocket-card.html`，讓我下載這個檔案（我打開它就會跳到我的卡）。不能給檔案的話，把程式印出的連結原封不動放在程式碼區塊裡。

```python
import json, zlib, base64
card = {...}  # 上面整理好的 JSON
data = json.dumps(card, ensure_ascii=False, separators=(",", ":")).encode()
url = "https://yourjobpocket.com/ai#d=" + base64.urlsafe_b64encode(zlib.compress(data, 9)).decode().rstrip("=")
open("jobpocket-card.html", "w").write(f'<meta charset="utf-8"><meta http-equiv="refresh" content="0; url={url}"><a href="{url}">打開我的履歷卡</a>')
print(url)
```

- 如果你不能執行程式，或我說連結打不開：把整份 JSON 放在一個程式碼區塊裡，第一行寫 `JPCARD v1`，請我整段複製，貼到 https://yourjobpocket.com/ai 的「貼上 AI 給的內容」。

最後用一小段話告訴我：點開是預覽，還沒公開；確認內容後用我的信箱收 6 位數驗證碼綁定；之後我自己選誰看得到（只放網站、給獵頭、要不要讓 AI 和 Google 搜得到）。這個連結裡有我的履歷內容，不要貼給別人。
