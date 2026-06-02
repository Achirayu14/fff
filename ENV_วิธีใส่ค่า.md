# วิธีใส่ค่า .env จากโค้ดเก่า

## 1) สร้างไฟล์ `.env` ในโฟลเดอร์ Bot-PD-BAD

คัดลอกจาก `.env.example`

## 2) กรอกค่าที่ต้อง copy จากโค้ดเก่า (2 อย่างเท่านั้น)

| ใน .env | จากโค้ดเก่า |
|---------|-------------|
| `DISCORD_TOKEN=` | บรรทัด `const DISCORD_TOKEN = '...'` |
| `GOOGLE_PRIVATE_KEY=` | ทั้งก้อน `private_key: '-----BEGIN...'` (ใส่ในเครื่องเดียวบรรทัด หรือใช้ `\n`) |

## 3) ค่าอื่นใส่ใน .env.example ให้แล้ว

- Channel ID ทั้ง 4 ห้อง
- SPREADSHEET_ID
- GOOGLE_CLIENT_EMAIL
- FiveM

## 4) Render

ใส่ Environment เหมือน `.env` ทุกตัว (ไม่ต้องมีไฟล์ .env บน Render)

## 5) อัป GitHub ต้องมีไฟล์

- bot.js
- fivemPresence.js
- presenceMonitor.js
- package.json
- BAD_PD.jpg

**ห้าม** commit `.env`

## สิ่งที่เพิ่ม

- เช็ค FiveM ตอนกดเข้าเวร → **คุณไม่ได้อยู่ในเกม**
- ออกเวรอัตโนมัติเมื่อออกจากเกม (ทุก 1 นาที)
