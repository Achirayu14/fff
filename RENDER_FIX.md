# แก้ Deploy failed (Exit status 1)

## 1) ตรวจ Render ต้องเป็น Web Service

- Build Command: `npm install` เท่านั้น
- Start Command: `npm start`
- **ห้าม** Publish Directory

## 2) อัป GitHub ไฟล์ครบ

```
bot.js
fivemPresence.js
presenceMonitor.js
package.json        ← ใช้เวอร์ชันใหม่ (dotenv 16.4.7)
.node-version       ← Node 20
env.example
```

## 3) Environment บน Render (ต้องมีก่อน Deploy)

`DISCORD_TOKEN`, `GOOGLE_PRIVATE_KEY`, Channel IDs, ฯลฯ

ถ้าไม่มี → บอทรันแล้วดับ (exit 1)

## 4) ใน Render Settings → Environment

เพิ่ม (ถ้ายังไม่มี):

```
NODE_VERSION=20.18.0
```

## 5) package.json บน GitHub ห้ามมี

```json
"dotenv": "^17.4.2"
```

เวอร์ชันนี้ไม่มีจริง → npm install พัง

ใช้:

```json
"dotenv": "16.4.7"
```
