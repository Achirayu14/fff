/**
 * ดึงรายชื่อผู้เล่น FiveM + เช็คว่าชื่อ Discord อยู่ในเซิร์ฟหรือไม่
 */
const https = require('https');
const http = require('http');

const FIVEM_JOIN_CODE = process.env.FIVEM_JOIN_CODE || 'a4z58zk';
const FIVEM_PLAYERS_URL = process.env.FIVEM_PLAYERS_URL || 'http://89.38.101.34:30120/players.json';
const FIVEM_FRONTEND_URL =
  process.env.FIVEM_FRONTEND_URL ||
  `https://servers-frontend.fivem.net/api/servers/single/${FIVEM_JOIN_CODE}`;

let cachedPlayers = null;
let cacheTime = 0;
const CACHE_MS = 45_000;

function normalizeName(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[\|\[\]\(\)\{\}\/\<>_*~`]/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/[^a-z0-9ก-๙\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(discordName, gameName) {
  const d = normalizeName(discordName);
  const g = normalizeName(gameName);
  if (!d || !g) return false;
  if (d === g) return true;
  if (g.includes(d) || d.includes(g)) return true;
  const words = d.split(' ').filter((w) => w.length > 1);
  if (words.length === 0) return false;
  return words.every((w) => g.includes(w));
}

function httpGet(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        resolve(body);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function resolvePlayersUrlFromCfx() {
  const res = await fetch(`https://cfx.re/join/${FIVEM_JOIN_CODE}`, {
    redirect: 'manual',
  });
  const base = res.headers.get('x-citizenfx-url');
  if (!base) return null;
  return base.replace(/\/$/, '') + '/players.json';
}

async function fetchFiveMPlayers(force = false) {
  const now = Date.now();
  if (!force && cachedPlayers && now - cacheTime < CACHE_MS) {
    return cachedPlayers;
  }

  const urls = [];
  if (FIVEM_PLAYERS_URL) urls.push(FIVEM_PLAYERS_URL);
  try {
    const fromCfx = await resolvePlayersUrlFromCfx();
    if (fromCfx) urls.push(fromCfx);
  } catch (_) {}
  urls.push(FIVEM_FRONTEND_URL);

  for (const url of urls) {
    try {
      const raw = await httpGet(url);
      const json = JSON.parse(raw);
      let list = [];
      if (Array.isArray(json)) list = json;
      else if (json?.Data?.players) list = json.Data.players;
      else if (json?.players) list = json.players;

      if (list.length > 0 || url.includes('players.json')) {
        cachedPlayers = list;
        cacheTime = now;
        return list;
      }
    } catch (err) {
      console.warn(`⚠️ FiveM fetch ล้มเหลว (${url}):`, err.message);
    }
  }
  return null;
}

async function isPlayerInFiveM(displayName) {
  const players = await fetchFiveMPlayers();
  if (players === null) {
    console.warn('⚠️ ดึงรายชื่อ FiveM ไม่ได้ — อนุญาตเข้าเวรชั่วคราว');
    return true;
  }
  if (players.length === 0) return false;
  return players.some((p) => namesMatch(displayName, p.name || ''));
}

async function getPlayerById(id) {
  const players = await fetchFiveMPlayers();
  if (!players) return null;
  return players.find((p) => String(p.id) === String(id)) || null;
}

const MSG_NOT_IN_GAME =
  '❌ **คุณไม่ได้อยู่ในเกม**\nกรุณาเข้า FiveM ก่อน แล้วค่อยกด **เข้าเวร**';

module.exports = {
  normalizeName,
  namesMatch,
  fetchFiveMPlayers,
  isPlayerInFiveM,
  getPlayerById,
  MSG_NOT_IN_GAME,
};
