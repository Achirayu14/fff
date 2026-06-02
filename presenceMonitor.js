const { EmbedBuilder } = require('discord.js');
const { fetchFiveMPlayers, namesMatch } = require('./fivemPresence');

const CHECK_INTERVAL_MS = Number(process.env.PRESENCE_CHECK_MS) || 2 * 60 * 1000;

function startPresenceMonitor(client, deps) {
  const {
    activeShifts,
    pendingPhoto,
    CHANNEL_ID_IN,
    CHANNEL_ID_OUT,
    CHANNEL_ID_ARCHIVE,
    formatDurationThai,
    formatTime,
    discordFullTime,
    writeShiftToSheet,
    lockUserInChannel,
    getChannelById,
  } = deps;

  async function autoClockOut(userId, shift, reason) {
    if (!activeShifts.has(userId)) return;
    if (pendingPhoto.has(userId)) return;

    const endTime = new Date();
    const { startTime, logMessageId, archiveMessageId, guildId } = shift;
    activeShifts.delete(userId);

    const guild = client.guilds.cache.get(guildId);
    let username = 'Unknown';
    let displayName = username;

    if (guild) {
      try {
        const member = await guild.members.fetch(userId);
        username = member.user.username;
        displayName = member.nickname || member.displayName || username;
        await lockUserInChannel(CHANNEL_ID_IN, guild, userId);
      } catch (_) {
        console.log(`⚠️ ออกเวรอัตโนมัติ: ${userId} ไม่อยู่ใน Discord`);
      }
    }

    const elapsed = Math.floor((endTime - startTime) / 1000);
    const logInChannel = await getChannelById(CHANNEL_ID_IN);
    if (logInChannel && logMessageId) {
      try {
        const logMsg = await logInChannel.messages.fetch(logMessageId);
        const updated = new EmbedBuilder()
          .setTitle('🟡 ออกเวรอัตโนมัติ')
          .setDescription(`<@${userId}>\n📌 ${reason}`)
          .addFields(
            { name: '👤 พนักงาน', value: displayName, inline: true },
            { name: '🕐 เวลาเข้าเวร', value: discordFullTime(startTime), inline: true },
            { name: '⏱️ รวมเวลาทำงาน', value: formatDurationThai(elapsed), inline: false },
          )
          .setColor(0xfee75c)
          .setTimestamp();
        await logMsg.edit({ embeds: [updated], files: [] });
      } catch (_) {}
    }

    await writeShiftToSheet(userId, username, startTime, endTime, guild);

    const logOutChannel = await getChannelById(CHANNEL_ID_OUT);
    if (logOutChannel) {
      const embed = new EmbedBuilder()
        .setTitle('🔴 ออกเวรอัตโนมัติ')
        .setDescription(`<@${userId}> — ${reason}`)
        .addFields(
          { name: '👤 พนักงาน', value: displayName, inline: true },
          { name: '🕐 เข้าเวร', value: formatTime(startTime), inline: true },
          { name: '🕔 ออกเวร', value: formatTime(endTime), inline: true },
          { name: '⏱️ รวม', value: formatDurationThai(elapsed), inline: false },
        )
        .setColor(0xed4245)
        .setTimestamp();
      await logOutChannel.send({ embeds: [embed] });
    }

    const archiveChannel = await getChannelById(CHANNEL_ID_ARCHIVE);
    if (archiveChannel && archiveMessageId) {
      try {
        const archMsg = await archiveChannel.messages.fetch(archiveMessageId);
        const updated = new EmbedBuilder()
          .setTitle('เสร็จสิ้นกะ (ออกเวรอัตโนมัติ)')
          .setDescription(`<@${userId}>\n${reason}`)
          .addFields(
            { name: 'พนักงาน', value: displayName, inline: true },
            { name: 'รวมเวลา', value: formatDurationThai(elapsed), inline: false },
          )
          .setColor(0xfee75c)
          .setTimestamp();
        await archMsg.edit({ embeds: [updated] });
      } catch (_) {}
    }

    console.log(`🤖 ออกเวรอัตโนมัติ: ${displayName} — ${reason}`);
  }

  setInterval(async () => {
    if (activeShifts.size === 0) return;
    const players = await fetchFiveMPlayers();
    if (!players) {
      console.log('⚠️ ข้ามรอบเช็ค FiveM — ดึงรายชื่อไม่ได้');
      return;
    }

    for (const [userId, shift] of activeShifts.entries()) {
      if (pendingPhoto.has(userId)) continue;
      const guild = client.guilds.cache.get(shift.guildId);
      if (!guild) {
        await autoClockOut(userId, shift, 'ไม่อยู่ในเซิร์ฟ Discord');
        continue;
      }
      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch {
        await autoClockOut(userId, shift, 'ไม่อยู่ในเซิร์ฟ Discord แล้ว');
        continue;
      }
      const displayName =
        member.nickname || member.displayName || member.user.username;
      const inGame = players.some((p) => namesMatch(displayName, p.name || ''));
      if (!inGame) {
        await autoClockOut(userId, shift, 'ออกจากประเทศ (ไม่อยู่ใน FiveM แล้ว)');
      }
    }
  }, CHECK_INTERVAL_MS);

  console.log(`👁️ เช็ค FiveM ทุก ${CHECK_INTERVAL_MS / 1000} วินาที`);
}

module.exports = { startPresenceMonitor };
