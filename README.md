# BOT-PD-BAD — ระบบเข้าเวร + เช็ค FiveM

โฟลเดอร์บอทแยกจาก `Crirical_Prompt_Candy` แล้ว

## ไฟล์ในโฟลเดอร์นี้

| ไฟล์ | หน้าที่ |
|------|--------|
| `bot.js` | บอทหลัก |
| `fivemPresence.js` | เช็คอยู่ในเกมไหม |
| `presenceMonitor.js` | ออกเวรอัตโนมัติเมื่อออกจากเกม |
| `package.json` | dependencies |
| `BAD_PD.jpg` | ใส่เอง (รูปปุ่ม !shift) |
| `.env` | ค่าลับ — สร้างเอง ห้ามอัป GitHub |

## ติดตั้ง

```bash
cd C:\Users\Administrator\Desktop\Bot-PD-BAD
npm install
```

สร้าง `.env` จากตัวอย่างด้านล่าง แล้วรัน:

```bash
npm start
```

## ตัวอย่าง `.env`

```env
DISCORD_TOKEN=
CHANNEL_ID_IN=
CHANNEL_ID_OUT=
CHANNEL_ID_RESET=
CHANNEL_ID_ARCHIVE=
SPREADSHEET_ID=
SHEET_NAME=ชีต1
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
FIVEM_JOIN_CODE=67lzxd
FIVEM_PLAYERS_URL=http://IP:30120/players.json
PRESENCE_CHECK_MS=60000
```

## อัป GitHub + Render

1. อัปโหลดทั้งโฟลเดอร์นี้ไป repo `nutthapong456n-gif/Bot`
2. Render → Environment → ใส่ค่าเดียวกับ `.env`
3. รอ Deploy live

## ฟีเจอร์

- กดเข้าเวร ไม่อยู่ในเกม → **คุณไม่ได้อยู่ในเกม**
- กำลังเข้าเวร แล้วออกจาก FiveM → ออกเวรอัตโนมัติ (ทุก 1 นาที ถ้าตั้ง 60000)
- เช็คเฉพาะคนใน Discord ที่เข้าเวรอยู่
- คำสั่ง: `!shift` `!shiftlog` `!resetshift` `!clearchannel`

ดู **CHECKLIST.md** ก่อนอัป GitHub ทุกครั้ง

## หมายเหตุ

- ถ้า FiveM API ล้มตอนกดเข้าเวร → ยังให้เข้าได้ชั่วคราว (กันเซิร์ฟล่ม)
- ถ้า API ตอบได้แต่รายชื่อว่าง → ถือว่าไม่อยู่ในเกม
