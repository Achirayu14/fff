# ✅ เช็คลิสต์ก่อนอัป GitHub / Render

## ไฟล์ครบ 7 ชิ้น

- [ ] `bot.js`
- [ ] `fivemPresence.js`
- [ ] `presenceMonitor.js`
- [ ] `package.json`
- [ ] `.gitignore` (มี `.env`)
- [ ] `BAD_PD.jpg` (ถ้าใช้ `!shift`)
- [ ] **ไม่** อัป `.env` ขึ้น GitHub

## Render Environment (ครบทุกตัว)

- [ ] `DISCORD_TOKEN`
- [ ] `CHANNEL_ID_IN` / `OUT` / `RESET` / `ARCHIVE`
- [ ] `SPREADSHEET_ID` + `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`
- [ ] `FIVEM_JOIN_CODE` หรือ `FIVEM_PLAYERS_URL`
- [ ] `PRESENCE_CHECK_MS` = `60000`

## ทดสอบหลัง Deploy live

- [ ] กดเข้าเวร **ไม่อยู่ในเกม** → 「คุณไม่ได้อยู่ในเกม」
- [ ] เข้าเกม + เข้าเวร + ส่งรูป → ผ่าน
- [ ] ออกจากเกม ~1 นาที → ออกเวรอัตโนมัติ
- [ ] `!shift` แสดงปุ่ม 3 ปุ่ม
- [ ] Logs Render ไม่มี `Cannot find module`

## ฟีเจอร์ใน bot.js นี้

| มี | ไม่มี (เทียบของเก่า) |
|----|---------------------|
| เข้า/ออกเวร + รูป | เช็คเวลาในรูปด้วย Gemini |
| เช็ค FiveM + ออกเวรอัตโนมัติ | |
| Google Sheets | |
| รีเซ็ตรายเดือน | |
| `!shift` `!shiftlog` `!resetshift` `!clearchannel` | |
