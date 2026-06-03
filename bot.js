const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const { google } = require('googleapis');
const { isPlayerInFiveM, getPlayerById, fetchFiveMPlayers, namesMatch, MSG_NOT_IN_GAME } = require('./fivemPresence');

// ========== Google Sheets ==========
const SPREADSHEET_ID = '11xMZUUw8lZqY0lqihxCzkCMSYvnoa5VNw3Z1Q1c_Rq4';
const SHEET_NAME = 'ชีต1';

// ========== Discord Bot Token ==========
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// ========== ID ห้อง Discord ==========
const CHANNEL_ID_IN = '1509561704596377690';
const CHANNEL_ID_OUT = '1509561736850571415';
const CHANNEL_ID_RESET = '1509971682012430476';
const CHANNEL_ID_ARCHIVE = '1509972377272979518';

const START_ROW = 4;

const COL_NAME = 'A';
const COL_DATE = 'B';
const COL_IN = 'C';
const COL_OUT = 'D';
const COL_TOTAL = 'E';

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_CLIENT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

function formatTime(date) {
  return date.toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(date) {
  return date.toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

function formatDurationThai(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  let result = '';
  if (h > 0) result += `${h} ชม. `;
  if (m > 0) result += `${m} นาที `;
  if (s > 0 || result === '') result += `${s} วินาที`;
  return result.trim();
}

function parseDurationThai(str) {
  let seconds = 0;
  const h = str.match(/(\d+)\s*ชม/);
  const m = str.match(/(\d+)\s*นาที/);
  const s = str.match(/(\d+)\s*วินาที/);
  if (h) seconds += parseInt(h[1], 10) * 3600;
  if (m) seconds += parseInt(m[1], 10) * 60;
  if (s) seconds += parseInt(s[1], 10);
  return seconds;
}

async function getDisplayName(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    return member.nickname || member.displayName || member.user.username;
  } catch {
    return null;
  }
}

async function resetMonthlySheet(client) {
  try {
    const sheets = await getSheetsClient();
    const now = new Date();
    const resetTime = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const monthYear = now.toLocaleDateString('th-TH', {
      timeZone: 'Asia/Bangkok',
      month: 'long',
      year: 'numeric',
    });

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!B${START_ROW}:F1000`,
    });
    const rows = existing.data.values || [];

    const logChannel = await client.channels.fetch(CHANNEL_ID_RESET).catch(() => null);
    if (logChannel && rows.length > 0) {
      const summaryMap = {};
      for (const row of rows) {
        const name = row[1] || '-';
        const total = row[4] || '0 วินาที';
        if (!summaryMap[name]) {
          summaryMap[name] = parseDurationThai(total);
        } else {
          summaryMap[name] += parseDurationThai(total);
        }
      }

      const lines = Object.entries(summaryMap)
        .map(([name, secs]) => `👤 **${name}** — ${formatDurationThai(secs)}`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setTitle(`📊 สรุปเวลาทำงาน — ${monthYear}`)
        .setDescription(lines || 'ไม่มีข้อมูล')
        .setColor(0x5865f2)
        .setFooter({ text: `รีเซ็ตเมื่อ: ${resetTime}` })
        .setTimestamp();

      const csvHeader = 'วันที่,ชื่อ-นามสกุล,เวลาเข้า,เวลาออก,รวมเวลา';
      const csvRows = rows.map((r) => (r || []).join(','));
      const csvContent = [csvHeader, ...csvRows].join('\n');
      const csvBuffer = Buffer.from('\ufeff' + csvContent, 'utf8');
      const csvAttach = new AttachmentBuilder(csvBuffer, { name: `shift_${monthYear}.csv` });
      await logChannel.send({ embeds: [embed], files: [csvAttach] });
      console.log('📤 ส่งข้อมูลก่อนรีเซ็ตสำเร็จ');
    }

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!B${START_ROW}:F1000`,
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!G1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[`รีเซ็ตล่าสุด: ${resetTime}`]] },
    });
    console.log(`🗑️ รีเซ็ต Google Sheets สำเร็จ — ${resetTime}`);
  } catch (err) {
    console.error('❌ รีเซ็ต Sheets ล้มเหลว:', err.message);
  }
}

function scheduleMonthlyReset(client) {
  let lastResetMonth = -1;
  setInterval(async () => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const day = now.getDate();
    const month = now.getMonth();
    const hour = now.getHours();
    if (day === 1 && hour === 0 && month !== lastResetMonth) {
      lastResetMonth = month;
      await resetMonthlySheet(client);
    }
  }, 60 * 60 * 1000);
  console.log('📅 ตั้งค่ารีเซ็ตรายเดือนสำเร็จ (เช็คทุก 1 ชม.)');
}

async function writeShiftToSheet(userId, username, startTime, endTime, guild) {
  try {
    const sheets = await getSheetsClient();
    const elapsed = Math.floor((endTime - startTime) / 1000);
    let displayName = username;
    if (guild) {
      const memberName = await getDisplayName(guild, userId);
      if (memberName) displayName = memberName;
    }
    const dateStr = formatDate(startTime);
    const timeInStr = formatTime(startTime);
    const timeOutStr = formatTime(endTime);

    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!B${START_ROW}:F`,
    });
    const rows = existing.data.values || [];
    const rowIndex = rows.findIndex((row) => row[0] === dateStr && row[1] === displayName);

    let totalSeconds = elapsed;
    if (rowIndex !== -1) {
      const existingTotal = rows[rowIndex][4];
      if (existingTotal) {
        totalSeconds = parseDurationThai(existingTotal) + elapsed;
      }
    }
    const totalTime = formatDurationThai(totalSeconds);
    console.log(`📝 บันทึก: ${displayName} | ${dateStr} | เข้า ${timeInStr} | ออก ${timeOutStr} | รวม ${totalTime}`);

    const values = [[dateStr, displayName, timeInStr, timeOutStr, totalTime]];
    if (rowIndex !== -1) {
      const actualRow = rowIndex + START_ROW;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!B${actualRow}:F${actualRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
      console.log(`🔄 อัปเดต: ${displayName} — ${dateStr} — รวมสะสม ${totalTime}`);
    } else {
      const nextRow = rows.length + START_ROW;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!B${nextRow}:F${nextRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
      console.log(`✅ บันทึกใหม่: ${displayName} — ${dateStr} — รวม ${totalTime}`);
    }
  } catch (err) {
    console.error('❌ Google Sheets error:', err.message);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const activeShifts = new Map();
const pendingPhoto = new Map();
const pendingIdCheck = new Map(); // เก็บ userId ที่รอกรอก ID ในเกม

async function getChannelById(channelId) {
  return client.channels.fetch(channelId).catch((err) => {
    console.error(`❌ ไม่สามารถดึงห้อง ID ${channelId}:`, err.message);
    return null;
  });
}

function discordRelativeTime(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function discordFullTime(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

async function replyThenDelete(interaction, options, seconds = 10) {
  await interaction.reply({ ...options, ephemeral: true });
  setTimeout(() => interaction.deleteReply().catch(() => {}), seconds * 1000);
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function sendEmbedWithPhoto(channel, embed, imageBuffer, filename) {
  const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
  embed.setImage(`attachment://${filename}`);
  return channel.send({ embeds: [embed], files: [attachment] });
}

async function unlockUserInChannel(channelId, guild, userId) {
  try {
    const channel = await guild.channels.fetch(channelId);
    await channel.permissionOverwrites.edit(userId, {
      SendMessages: true,
      AttachFiles: true,
    });
  } catch (err) {
    console.error('❌ ปลดล็อก user ล้มเหลว:', err.message);
  }
}

async function lockUserInChannel(channelId, guild, userId) {
  try {
    const channel = await guild.channels.fetch(channelId);
    await channel.permissionOverwrites.delete(userId);
  } catch (err) {
    console.error('❌ ล็อก user ล้มเหลว:', err.message);
  }
}

client.on('error', (err) => console.error('❌ Discord Client Error:', err.message));
client.on('shardError', (err) => console.error('❌ WebSocket Error:', err.message));
process.on('unhandledRejection', (err) => console.error('❌ Unhandled Rejection:', err?.message || err));
process.on('uncaughtException', (err) => console.error('❌ Uncaught Exception:', err?.message || err));

client.once('ready', () => {
  console.log(`✅ Bot พร้อมใช้งาน: ${client.user.tag}`);
  console.log(`📋 กำลังทำงานใน ${client.guilds.cache.size} เซิร์ฟเวอร์`);
  scheduleMonthlyReset(client);

  // ===== เช็คลืมออกเวร (1 ชั่วโมง) =====
  const CHANNEL_ID_FORGOT = '1511668609271988365';
  const MAX_SHIFT_MS = 60 * 60 * 1000;

  setInterval(async () => {
    if (activeShifts.size === 0) return;
    const now = Date.now();

    for (const [userId, shift] of activeShifts.entries()) {
      if (pendingPhoto.has(userId)) continue;
      const elapsed = now - shift.startTime.getTime();
      if (elapsed < MAX_SHIFT_MS) continue;

      activeShifts.delete(userId);

      const guild = client.guilds.cache.get(shift.guildId);
      let displayName = 'Unknown';
      if (guild) {
        try {
          const member = await guild.members.fetch(userId);
          displayName = member.nickname || member.displayName || member.user.username;
          await lockUserInChannel(CHANNEL_ID_IN, guild, userId);
        } catch (_) {}
      }

      // ลบ log เข้าเวรออก
      const logInChannel = await getChannelById(CHANNEL_ID_IN);
      if (logInChannel && shift.logMessageId) {
        try {
          const logMsg = await logInChannel.messages.fetch(shift.logMessageId);
          await logMsg.delete();
        } catch (_) {}
      }

      // แจ้งห้องลืมออกเวร
      const forgotChannel = await getChannelById(CHANNEL_ID_FORGOT);
      if (forgotChannel) {
        const elapsedSec = Math.floor(elapsed / 1000);
        const embed = new EmbedBuilder()
          .setTitle('⚠️ ลืมกดออกเวร!')
          .setDescription(`<@${userId}> ลืมกดออกเวร — **ไม่บันทึกเวลางานวันนี้**`)
          .addFields(
            { name: '👤 พนักงาน', value: displayName, inline: true },
            { name: '🕐 เข้าเวรตั้งแต่', value: discordFullTime(shift.startTime), inline: true },
            { name: '⏱️ ทำงานนานกว่า', value: formatDurationThai(elapsedSec), inline: false },
            { name: '📌 หมายเหตุ', value: 'ระบบยกเลิก log วันนี้แล้ว กรุณาติดต่อผู้ดูแล', inline: false },
          )
          .setColor(0xed4245)
          .setTimestamp();
        await forgotChannel.send({ content: `<@${userId}>`, embeds: [embed] });
      }

      console.log(`⚠️ ลืมออกเวร (ไม่บันทึก): ${displayName}`);
    }
  }, 60 * 1000);

  console.log('👁️ เช็คลืมออกเวรทุก 1 นาที (หมดเวลา 1 ชั่วโมง)');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.channel.id === CHANNEL_ID_IN) {
    const isOnShift = activeShifts.has(message.author.id);
    const isPending = pendingPhoto.has(message.author.id);
    if (!isOnShift && !isPending) {
      try {
        await message.delete();
      } catch (_) {}
      try {
        const w = await message.channel.send(
          `<@${message.author.id}> ❌ กรุณากดปุ่ม **เข้าเวร** ก่อนส่งข้อความในช่องนี้ครับ`,
        );
        setTimeout(() => w.delete().catch(() => {}), 5000);
      } catch (_) {}
      return;
    }
  }

  if (pendingPhoto.has(message.author.id)) {
    const photo = message.attachments.first();
    if (!photo) return;

    const pending = pendingPhoto.get(message.author.id);
    pendingPhoto.delete(message.author.id);

    const guild = message.guild;
    const logInChannel = await getChannelById(CHANNEL_ID_IN);
    const logOutChannel = await getChannelById(CHANNEL_ID_OUT);
    const archiveChannel = await getChannelById(CHANNEL_ID_ARCHIVE);

    let imgBuffer;
    try {
      imgBuffer = await downloadImage(photo.url);
    } catch (_) {
      imgBuffer = null;
    }
    try {
      await message.delete();
    } catch (_) {}

    const ext = photo.name?.split('.').pop() || 'jpg';
    const filename = `BAD_PD.${ext}`;

    if (pending.type === 'in') {
      let logMessageId = null;
      let archiveMessageId = null;

      if (logInChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🟢 เข้าเวร — กำลังทำงาน')
          .setDescription(`<@${message.author.id}> ได้เข้าเวรแล้ว`)
          .addFields(
            { name: '👤 พนักงาน', value: message.author.username, inline: true },
            { name: '🕐 เวลาเข้าเวร', value: discordFullTime(pending.startTime), inline: true },
            { name: '⏱️ ทำงานมาแล้ว', value: discordRelativeTime(pending.startTime), inline: false },
          )
          .setColor(0x57f287)
          .setFooter({ text: 'รอออกเวร...' })
          .setTimestamp();

        let logMsg;
        if (imgBuffer) {
          logMsg = await sendEmbedWithPhoto(logInChannel, embed, imgBuffer, filename);
        } else {
          embed.setImage(photo.url);
          logMsg = await logInChannel.send({ embeds: [embed] });
        }
        logMessageId = logMsg.id;
      }

      if (archiveChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🟢 เข้าเวร — กำลังทำงาน')
          .setDescription(`<@${message.author.id}>`)
          .addFields(
            { name: '👤 พนักงาน', value: message.author.username, inline: true },
            { name: '🕐 เวลาเข้าเวร', value: discordFullTime(pending.startTime), inline: true },
            { name: '⏱️ ทำงานมาแล้ว', value: discordRelativeTime(pending.startTime), inline: false },
          )
          .setColor(0x57f287)
          .setFooter({ text: 'รอออกเวร...' })
          .setTimestamp();

        let archMsg;
        if (imgBuffer) {
          archMsg = await sendEmbedWithPhoto(archiveChannel, embed, imgBuffer, filename);
        } else {
          embed.setImage(photo.url);
          archMsg = await archiveChannel.send({ embeds: [embed] });
        }
        archiveMessageId = archMsg.id;
      }

      activeShifts.set(message.author.id, {
        startTime: pending.startTime,
        logMessageId,
        archiveMessageId,
        photoBuffer: imgBuffer,
        photoFilename: filename,
        guildId: guild?.id,
        userId: message.author.id,
      });

      if (guild) await lockUserInChannel(CHANNEL_ID_IN, guild, message.author.id);
    } else if (pending.type === 'out') {
      const elapsed = Math.floor((pending.endTime - pending.startTime) / 1000);

      if (logInChannel && pending.logMessageId) {
        try {
          const logMsg = await logInChannel.messages.fetch(pending.logMessageId);
          const updatedInEmbed = new EmbedBuilder()
            .setTitle('🟡 ออกเวรแล้ว')
            .setDescription(`<@${pending.userId || message.author.id}>`)
            .addFields(
              { name: '👤 พนักงาน', value: message.author.username, inline: true },
              { name: '🕐 เวลาเข้าเวร', value: discordFullTime(pending.startTime), inline: true },
              { name: '⏱️ ทำงานมาแล้ว', value: '✅ ออกเวรไปแล้ว', inline: false },
            )
            .setColor(0xfee75c)
            .setFooter({ text: '✅ เสร็จสิ้นกะการทำงาน' })
            .setTimestamp();

          if (imgBuffer) {
            const reAttach = new AttachmentBuilder(imgBuffer, { name: filename });
            updatedInEmbed.setImage(`attachment://${filename}`);
            await logMsg.edit({ embeds: [updatedInEmbed], files: [reAttach] });
          } else {
            await logMsg.edit({ embeds: [updatedInEmbed], files: [] });
          }
        } catch (_) {}
      }

      const shiftGuild = guild || client.guilds.cache.get(pending.guildId);
      await writeShiftToSheet(
        pending.userId || message.author.id,
        message.author.username,
        pending.startTime,
        pending.endTime,
        shiftGuild,
      );

      if (shiftGuild) await lockUserInChannel(CHANNEL_ID_IN, shiftGuild, pending.userId || message.author.id);

      if (logOutChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🔴 ออกเวรแล้ว')
          .setDescription(`<@${message.author.id}> สิ้นสุดกะการทำงาน`)
          .addFields(
            { name: '👤 พนักงาน', value: message.author.username, inline: true },
            { name: '🕐 เวลาเข้าเวร', value: discordFullTime(pending.startTime), inline: true },
            { name: '🕔 เวลาออกเวร', value: discordFullTime(pending.endTime), inline: true },
            { name: '⏱️ รวมเวลาทำงาน', value: formatDurationThai(elapsed), inline: false },
          )
          .setColor(0xed4245)
          .setFooter({ text: '✅ เสร็จสิ้นกะการทำงาน' })
          .setTimestamp();

        if (imgBuffer) {
          await sendEmbedWithPhoto(logOutChannel, embed, imgBuffer, filename);
        } else {
          embed.setImage(photo.url);
          await logOutChannel.send({ embeds: [embed] });
        }
      }

      if (archiveChannel && pending.archiveMessageId) {
        try {
          const archMsg = await archiveChannel.messages.fetch(pending.archiveMessageId);
          const elapsed2 = Math.floor((pending.endTime - pending.startTime) / 1000);
          const updatedEmbed = new EmbedBuilder()
            .setTitle('เสร็จสิ้นกะการทำงาน')
            .setDescription(`<@${message.author.id}>`)
            .addFields(
              { name: 'พนักงาน', value: message.author.username, inline: true },
              { name: 'เวลาเข้าเวร', value: discordFullTime(pending.startTime), inline: true },
              { name: 'เวลาออกเวร', value: discordFullTime(pending.endTime), inline: true },
              { name: 'รวมเวลาทำงาน', value: formatDurationThai(elapsed2), inline: false },
            )
            .setColor(0xfee75c)
            .setTimestamp();
          await archMsg.edit({ embeds: [updatedEmbed] });
        } catch (_) {}
      }
    }
    return;
  }

  // ===== รับ ID ในเกม (กรณีชื่อไม่ตรง) =====
  if (pendingIdCheck.has(message.author.id)) {
    const idInput = message.content.trim();
    if (/^\d+$/.test(idInput)) {
      const pending = pendingIdCheck.get(message.author.id);
      const player = await getPlayerById(idInput);
      if (!player) {
        await message.reply(`❌ ไม่พบ ID **${idInput}** ในเกมขณะนี้\nกรุณาตรวจสอบ ID อีกครั้ง หรือเข้าเกมแล้วลองใหม่`);
        return;
      }
      // เจอ ID แต่ชื่อไม่ตรง → แจ้งให้เปลี่ยนชื่อ
      const gameMatch = namesMatch(pending.displayName, player.name);
      if (!gameMatch) {
        pendingIdCheck.delete(message.author.id);
        await message.reply([
          `⚠️ **พบ ID ${idInput} ในเกมแล้ว** แต่ชื่อไม่ตรงกัน`,
          `ชื่อในเกม: **${player.name}**`,
          `ชื่อ Discord: **${pending.displayName}**`,
          '',
          '📌 กรุณาเปลี่ยน **Nickname** ใน Discord Server ให้ตรงกับชื่อในเกม แล้วกด **เข้าเวร** ใหม่อีกครั้ง',
        ].join('\n'));
        return;
      }
      // ชื่อตรง → ผ่าน ดำเนินการเข้าเวรต่อ (ไม่ต้องทำอะไร แค่ลบออกจาก pendingIdCheck)
      pendingIdCheck.delete(message.author.id);
      await message.reply('✅ ยืนยันตัวตนสำเร็จ กรุณากด **เข้าเวร** อีกครั้งได้เลยครับ');
      return;
    }
  }

  if (message.content.toLowerCase() === '!shift') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('clock_in').setLabel('🟢 เข้าเวร').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('clock_out').setLabel('🔴 ออกเวร').setStyle(ButtonStyle.Danger),
    );
    const embed = new EmbedBuilder()
      .setTitle('📋 ระบบบันทึกเวร')
      .setDescription('กดปุ่มด้านล่างเพื่อเข้าหรือออกเวร')
      .setColor(0x5865f2)
      .setFooter({ text: 'Shift Management System' })
      .setTimestamp();

    const files = [];
    try {
      const badPdPath = path.join(__dirname, 'BAD_PD.jpg');
      const badPdBuffer = fs.readFileSync(badPdPath);
      const attachment = new AttachmentBuilder(badPdBuffer, { name: 'BAD_PD.jpg' });
      embed.setImage('attachment://BAD_PD.jpg');
      files.push(attachment);
    } catch (err) {
      console.error('❌ ไม่พบไฟล์ BAD_PD.jpg:', err.message);
    }
    await message.channel.send({ embeds: [embed], components: [row], files });
  }

  if (message.content.toLowerCase() === '!shiftlog') {
    if (activeShifts.size === 0) {
      return message.reply('❌ ไม่มีพนักงานที่กำลังเข้าเวรอยู่ในขณะนี้');
    }
    let desc = '';
    for (const [userId, data] of activeShifts.entries()) {
      desc += `<@${userId}> — เข้าเวร ${discordFullTime(data.startTime)}\n⏱️ เริ่มมาแล้ว ${discordRelativeTime(data.startTime)}\n\n`;
    }
    const embed = new EmbedBuilder()
      .setTitle('📊 พนักงานที่กำลังเข้าเวร')
      .setDescription(desc)
      .setColor(0x57f287)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
  }

  if (message.content.toLowerCase() === '!resetshift') {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ คำสั่งนี้ใช้ได้เฉพาะแอดมินเท่านั้น');
    }
    await resetMonthlySheet(client);
    return message.reply('✅ รีเซ็ต Google Sheets สำเร็จแล้ว');
  }

  if (message.content.toLowerCase() === '!clearchannel') {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('❌ คำสั่งนี้ใช้ได้เฉพาะแอดมินเท่านั้น');
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('clear_in').setLabel('🗑️ ห้องเข้าเวร').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('clear_out').setLabel('🗑️ ห้องออกเวร').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('clear_archive').setLabel('🗑️ ห้อง Archive').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('clear_reset').setLabel('🗑️ ห้อง Reset-Log').setStyle(ButtonStyle.Danger),
    );
    const embed = new EmbedBuilder()
      .setTitle('🗑️ ลบข้อความในห้อง')
      .setDescription('เลือกห้องที่ต้องการลบข้อความทั้งหมด\n⚠️ ไม่สามารถกู้คืนได้!')
      .setColor(0xed4245)
      .setTimestamp();
    await message.channel.send({ embeds: [embed], components: [row] });
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user } = interaction;

  if (customId === 'clock_in') {
    if (activeShifts.has(user.id)) {
      const data = activeShifts.get(user.id);
      return replyThenDelete(
        interaction,
        {
          content: [
            '⚠️ **คุณเข้าเวรอยู่แล้ว!**',
            `🕐 เข้าเวรตั้งแต่: ${discordFullTime(data.startTime)}`,
            `⏱️ เริ่มมาแล้ว: ${discordRelativeTime(data.startTime)}`,
          ].join('\n'),
        },
        10,
      );
    }
    if (pendingPhoto.has(user.id)) {
      return replyThenDelete(interaction, { content: '⏳ รอคุณส่งรูปเข้าเวรอยู่นะครับ กรุณาส่งรูปในช่องนี้' }, 10);
    }

    const memberForCheck = await interaction.guild.members.fetch(user.id);
    const displayNameForCheck = memberForCheck.nickname || memberForCheck.displayName || user.username;
    const inGame = await isPlayerInFiveM(displayNameForCheck);
    if (!inGame) {
      const players = await fetchFiveMPlayers();
      if (players === null) {
        // ดึงไม่ได้เลย อนุญาตผ่านชั่วคราว
      } else {
        // ชื่อไม่ตรง → ให้กรอก ID
        pendingIdCheck.set(user.id, { displayName: displayNameForCheck, startTime: new Date() });
        await interaction.reply({
          content: [
            '❌ **ไม่พบชื่อของคุณในเกม**',
            `ชื่อ Discord: **${displayNameForCheck}**`,
            '',
            '📌 ถ้าคุณอยู่ในเกมอยู่จริง กรุณาพิมพ์ **ID ในเกม** ของคุณในช่องนี้',
            '',
            '⚠️ ถ้าชื่อในเกมไม่ตรงกับ Discord กรุณาเปลี่ยนชื่อ Discord ให้ตรงแล้วลองใหม่',
          ].join('\n'),
          ephemeral: true,
        });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 15000);
        return;
      }
    }

    const startTime = new Date();
    pendingPhoto.set(user.id, { type: 'in', startTime });
    if (interaction.guild) await unlockUserInChannel(CHANNEL_ID_IN, interaction.guild, user.id);
    return replyThenDelete(
      interaction,
      {
        content: ['💥 **กรุณาส่งรูปเพื่อยืนยันการเข้าเวร**', '❗ ส่งรูปในช่องเข้าเวรได้เลยครับ'].join('\n'),
      },
      30,
    );
  }

  if (customId === 'clock_out') {
    if (!activeShifts.has(user.id)) {
      return replyThenDelete(interaction, { content: '⚠️ คุณยังไม่ได้เข้าเวร กรุณากด **เข้าเวร** ก่อน' }, 10);
    }
    if (pendingPhoto.has(user.id)) {
      return replyThenDelete(interaction, { content: '⏳ รอคุณส่งรูปออกเวรอยู่นะครับ กรุณาส่งรูปในช่องนี้' }, 10);
    }
    const data = activeShifts.get(user.id);
    const endTime = new Date();
    activeShifts.delete(user.id);
    pendingPhoto.set(user.id, {
      type: 'out',
      startTime: data.startTime,
      endTime,
      logMessageId: data.logMessageId,
      archiveMessageId: data.archiveMessageId,
      guildId: data.guildId,
      userId: data.userId,
    });
    if (interaction.guild) await unlockUserInChannel(CHANNEL_ID_IN, interaction.guild, user.id);
    return replyThenDelete(
      interaction,
      {
        content: ['💥 **กรุณาส่งรูปเพื่อยืนยันการออกเวร**', '❗ ส่งรูปในช่องนี้ได้เลยครับ'].join('\n'),
      },
      30,
    );
  }

  if (customId === 'check_status') {
    if (!activeShifts.has(user.id)) {
      return replyThenDelete(interaction, { content: '❌ คุณยังไม่ได้เข้าเวรในขณะนี้' }, 10);
    }
    const data = activeShifts.get(user.id);
    const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
    const embed = new EmbedBuilder()
      .setTitle('🟢 กำลังเข้าเวรอยู่')
      .setDescription(`👤 **${user.username}**\n<@${user.id}>`)
      .addFields(
        { name: '🕐 เวลาเข้าเวร', value: discordFullTime(data.startTime), inline: false },
        { name: '⏱️ รวมเวลาทำงาน', value: formatDurationThai(elapsed), inline: false },
        { name: '📊 สถานะ', value: '`กำลังทำงาน`', inline: false },
      )
      .setColor(0x57f287)
      .setFooter({ text: 'Shift Management System' })
      .setTimestamp();

    const files = [];
    try {
      let badPdPath = path.join(__dirname, 'BAD_PD.jpg');
      if (!fs.existsSync(badPdPath)) badPdPath = path.resolve(process.cwd(), 'BAD_PD.jpg');
      if (fs.existsSync(badPdPath)) {
        const badPdBuffer = fs.readFileSync(badPdPath);
        const attachment = new AttachmentBuilder(badPdBuffer, { name: 'BAD_PD.jpg' });
        embed.setImage('attachment://BAD_PD.jpg');
        files.push(attachment);
      }
    } catch (err) {
      console.error('❌ โหลด BAD_PD.jpg:', err.message);
    }

    await interaction.reply({ embeds: [embed], files, ephemeral: true });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 30000);
    return;
  }

  if (['clear_in', 'clear_out', 'clear_archive', 'clear_reset'].includes(customId)) {
    if (!interaction.member.permissions.has('Administrator')) {
      return replyThenDelete(interaction, { content: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมินเท่านั้น' }, 5);
    }
    const channelMap = {
      clear_in: CHANNEL_ID_IN,
      clear_out: CHANNEL_ID_OUT,
      clear_archive: CHANNEL_ID_ARCHIVE,
      clear_reset: CHANNEL_ID_RESET,
    };
    const targetChannel = await getChannelById(channelMap[customId]);
    if (!targetChannel) {
      return replyThenDelete(interaction, { content: '❌ ไม่พบห้องที่ต้องการ' }, 5);
    }
    await replyThenDelete(interaction, { content: `⏳ กำลังลบข้อความในห้อง <#${targetChannel.id}>...` }, 5);

    let deleted;
    do {
      const fetched = await targetChannel.messages.fetch({ limit: 100 });
      if (fetched.size === 0) break;
      deleted = await targetChannel.bulkDelete(fetched, true).catch(() => null);
      if (!deleted || deleted.size === 0) {
        for (const msg of fetched.values()) {
          await msg.delete().catch(() => {});
          await new Promise((r) => setTimeout(r, 500));
        }
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    } while (deleted && deleted.size >= 2);
  }
});

http
  .createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, `http://localhost`);
    if (url.pathname === '/players') {
      try {
        const players = await fetchFiveMPlayers(true);
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, players: players || [], count: players ? players.length : 0 }));
      } catch (err) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    res.writeHead(200);
    res.end('Bot is alive!');
  })
  .listen(process.env.PORT || 3000);

console.log(`🌐 HTTP server เปิดที่ port ${process.env.PORT || 3000}`);

client.login(DISCORD_TOKEN);
