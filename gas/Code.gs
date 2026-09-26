/**
 * Last Call leaderboard: Google Apps Script web app bound to a Sheet.
 * Deploy steps: gas/README.md. This file is generated from gas/Code.template.gs
 * by tools/build-gas.ts (which inlines src/leaderboard/shared/validate.js); edit
 * the template, not Code.gs.
 *
 * Endpoints
 *   POST <json RunRecord>              -> {ok:true} | {ok:false, retry?:true, error}
 *   GET  ?board=monopoly|cv&cat=...&n= -> {rows:[{rank,name,homeCity,value,winType,date}]}
 *
 * Hardening over the Mario version: shared validation, a build allowlist in
 * Script Properties, formula-injection escaping, per-client and global rate
 * limits, duplicate runId rejection, top-N only (cached), an admin `hidden` column.
 *
 * @OnlyCurrentDoc
 */

/* Shared leaderboard validation (ES5 so it also runs inside Google Apps Script).
 * Used by the game client, the mock adapter, the tests, and gas/Code.gs
 * (tools/build-gas.ts inlines this file). Honest-mode checks only: a static
 * site can't stop a determined cheat, but it can stop junk and formula injection. */

var LC_CITIES = ['aleforge', 'shanty', 'providence', 'roto'];
var LC_CATEGORIES = ['standard', 'assisted', 'ngplus'];
var LC_WIN_TYPES = ['monopoly', 'sponsor'];

function lcIsNum(n) {
  return typeof n === 'number' && isFinite(n) && n >= 0;
}

/** Returns null when the record is acceptable, else a short reason. */
function lcValidateRecord(r, opts) {
  opts = opts || {};
  if (!r || typeof r !== 'object') return 'bad payload';
  if (typeof r.runId !== 'string' || !/^[A-Za-z0-9-]{6,64}$/.test(r.runId)) return 'bad runId';
  if (typeof r.clientId !== 'string' || !/^[A-Za-z0-9-]{6,64}$/.test(r.clientId)) return 'bad clientId';
  if (typeof r.name !== 'string' || !/^[A-Za-z0-9 _.'-]{1,16}$/.test(r.name) || !/[A-Za-z0-9]/.test(r.name)) return 'bad name';
  if (LC_CITIES.indexOf(r.homeCity) < 0) return 'bad homeCity';
  if (LC_CATEGORIES.indexOf(r.category) < 0) return 'bad category';
  if (LC_WIN_TYPES.indexOf(r.winType) < 0) return 'bad winType';
  if (typeof r.build !== 'string' || r.build.length > 24) return 'bad build';
  if (opts.allowedBuilds && opts.allowedBuilds.length && opts.allowedBuilds.indexOf(r.build) < 0) return 'build not allowed';
  var nums = ['finalCV', 'peakCV', 'simMs', 'realMs', 'pauses', 'sessions'];
  for (var i = 0; i < nums.length; i++) if (!lcIsNum(r[nums[i]])) return 'bad ' + nums[i];
  if (r.finalCV > 1e9 || r.peakCV > 1e9) return 'implausible CV';
  if (r.peakCV < r.finalCV * 0.5) return 'peak below final';
  var maxSim = opts.maxSimMs || 4000000;
  if (r.simMs <= 0 || r.simMs > maxSim) return 'bad run length';
  if (r.realMs < r.simMs * 0.99) return 'clock mismatch';
  if (r.winType === 'monopoly') {
    if (!lcIsNum(r.monopolyMs) || r.monopolyMs <= 0 || r.monopolyMs > r.simMs + 100) return 'bad monopoly time';
    if (opts.minMonopolyMs && r.monopolyMs < opts.minMonopolyMs) return 'implausibly fast';
  } else if (opts.minSponsorMs && r.simMs < opts.minSponsorMs) {
    return 'sponsor before the verdict';
  }
  var s = r.splits || {};
  var order = [s.firstSisterMs, s.thirdSisterMs];
  if (order[0] !== undefined && order[0] !== null && !lcIsNum(order[0])) return 'bad split';
  if (order[1] !== undefined && order[1] !== null && (!lcIsNum(order[1]) || (lcIsNum(order[0]) && order[1] < order[0]))) return 'splits out of order';
  if (lcIsNum(order[1]) && order[1] > r.simMs + 100) return 'split after end';
  return null;
}

/** Stops Sheets from treating a submitted string as a formula. */
function lcSanitizeCell(v) {
  var s = String(v === undefined || v === null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s.slice(0, 80);
}

var RUNS = 'runs';
var HEADERS = ['date', 'runId', 'clientId', 'name', 'homeCity', 'category', 'winType', 'monopolyMs', 'finalCV', 'peakCV',
  'simMs', 'realMs', 'pauses', 'sessions', 'firstSisterMs', 'thirdSisterMs', 'firstNo1Ms', 'seed', 'build', 'contentHash', 'hidden'];
var MIN_MONOPOLY_MS = 8 * 60 * 1000; // faster than any plausible run
var MIN_SPONSOR_MS = 50 * 60 * 1000; // the Year-463 verdict comes ~54 min in

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(RUNS);
  if (!sh) {
    sh = ss.insertSheet(RUNS);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function allowedBuilds_() {
  var raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_BUILDS') || '';
  return raw ? raw.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; }) : [];
}

function doPost(e) {
  var rec;
  try {
    rec = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }
  var bad = lcValidateRecord(rec, { allowedBuilds: allowedBuilds_(), minMonopolyMs: MIN_MONOPOLY_MS, minSponsorMs: MIN_SPONSOR_MS });
  if (bad) return json_({ ok: false, error: bad });

  var cache = CacheService.getScriptCache();
  if (cache.get('client:' + rec.clientId)) return json_({ ok: false, retry: true, error: 'slow down' });
  var minute = 'global:' + Math.floor(Date.now() / 60000);
  var count = Number(cache.get(minute) || 0);
  if (count >= 30) return json_({ ok: false, retry: true, error: 'busy' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json_({ ok: false, retry: true, error: 'the sheet was busy' });
  try {
    if (cache.get('run:' + rec.runId)) return json_({ ok: true, duplicate: true });
    var sh = sheet_();
    var last = sh.getLastRow();
    if (last > 1) {
      var from = Math.max(2, last - 1000);
      var ids = sh.getRange(from, 2, last - from + 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) if (ids[i][0] === rec.runId) return json_({ ok: true, duplicate: true });
    }
    var s = rec.splits || {};
    sh.appendRow([
      new Date().toISOString(), lcSanitizeCell(rec.runId), lcSanitizeCell(rec.clientId), lcSanitizeCell(rec.name), rec.homeCity,
      rec.category, rec.winType, rec.monopolyMs || '', Math.round(rec.finalCV), Math.round(rec.peakCV), Math.round(rec.simMs),
      Math.round(rec.realMs), rec.pauses, rec.sessions, s.firstSisterMs || '', s.thirdSisterMs || '', s.firstNo1Ms || '',
      lcSanitizeCell(rec.seed), lcSanitizeCell(rec.build), lcSanitizeCell(rec.contentHash), '',
    ]);
    cache.put('run:' + rec.runId, '1', 21600);
    cache.put('client:' + rec.clientId, '1', 60);
    cache.put(minute, String(count + 1), 120);
    cache.removeAll(['board:monopoly', 'board:cv']);
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function inCategory_(row, cat) {
  if (cat === 'assisted') return row.category === 'assisted';
  if (cat === 'ngplus') return row.category === 'ngplus';
  if (row.category !== 'standard') return false;
  return cat === 'overall' || row.homeCity === cat;
}

function readRows_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var row = {};
    for (var j = 0; j < HEADERS.length; j++) row[HEADERS[j]] = v[j];
    if (row.hidden) continue;
    out.push(row);
  }
  return out;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var board = p.board === 'cv' ? 'cv' : 'monopoly';
  var cat = ['overall', 'aleforge', 'shanty', 'providence', 'roto', 'assisted', 'ngplus'].indexOf(p.cat) >= 0 ? p.cat : 'overall';
  var n = Math.max(1, Math.min(100, Number(p.n) || 25));
  var cache = CacheService.getScriptCache();
  var key = 'board:' + board + ':' + cat + ':' + n;
  var hit = cache.get(key);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  var rows = readRows_().filter(function (r) { return inCategory_(r, cat) && (board === 'cv' || r.winType === 'monopoly'); });
  rows.sort(function (a, b) {
    if (board === 'monopoly') return (Number(a.monopolyMs) - Number(b.monopolyMs)) || (Number(b.finalCV) - Number(a.finalCV));
    return (Number(b.finalCV) - Number(a.finalCV)) || (Number(a.simMs) - Number(b.simMs));
  });
  var out = rows.slice(0, n).map(function (r, i) {
    return { rank: i + 1, name: String(r.name), homeCity: r.homeCity, value: Number(board === 'monopoly' ? r.monopolyMs : r.finalCV), winType: r.winType, date: String(r.date).slice(0, 10) };
  });
  var text = JSON.stringify({ rows: out });
  cache.put(key, text, 60);
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}
