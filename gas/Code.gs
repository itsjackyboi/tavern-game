/**
 * Last Call leaderboard: Google Apps Script web app bound to a Sheet.
 * Setup: gas/README.md. This file is generated from gas/Code.template.gs by
 * tools/build-gas.ts (which inlines src/leaderboard/shared/validate.js); edit
 * the template, not Code.gs.
 *
 * Like the Mario board: every run is appended to the `runs` tab, and derived
 * record tabs are redrawn from it, split by era from the game version:
 *   v1.x  -> "Pre Release Records"  (testing phase)
 *   v2.0+ -> "Official Records"
 * Each record tab shows two top tens: Fastest Monopoly (time) and Sponsored
 * the Trials (Company Value). Losses and bankruptcies are logged, never ranked.
 *
 * Endpoints
 *   POST <json RunRecord>        -> {ok:true} | {ok:false, retry?:true, error}
 *   GET  ?era=pre|official       -> {monopoly:[rows], sponsor:[rows]}
 *   GET  ?rebuild=1              -> redraws both record tabs
 *
 * @OnlyCurrentDoc
 */

/* Shared leaderboard validation (ES5 so it also runs inside Google Apps Script).
 * Used by the game client, the mock adapter, the tests, and gas/Code.gs
 * (tools/build-gas.ts inlines this file). Honest-mode checks only: a static
 * site can't stop a determined cheat, but it can stop junk and formula injection. */

var LC_CITIES = ['aleforge', 'shanty', 'providence', 'roto'];
var LC_CATEGORIES = ['standard', 'assisted', 'ngplus'];
var LC_RESULTS = ['monopoly', 'sponsor', 'lost', 'bankrupt'];

function lcIsNum(n) {
  return typeof n === 'number' && isFinite(n) && n >= 0;
}

/** "v1.5" -> 'pre' (testing records); "v2.0" and later -> 'official'. */
function lcEraOf(version) {
  var m = /^v(\d+)\./.exec(String(version || ''));
  return m && Number(m[1]) >= 2 ? 'official' : 'pre';
}

/** Returns null when the record is acceptable, else a short reason. */
function lcValidateRecord(r, opts) {
  opts = opts || {};
  if (!r || typeof r !== 'object') return 'bad payload';
  if (typeof r.runId !== 'string' || !/^[A-Za-z0-9-]{6,64}$/.test(r.runId)) return 'bad runId';
  if (typeof r.clientId !== 'string' || !/^[A-Za-z0-9-]{6,64}$/.test(r.clientId)) return 'bad clientId';
  if (typeof r.name !== 'string' || !/^[A-Za-z0-9 _.'-]{1,16}$/.test(r.name) || !/[A-Za-z0-9]/.test(r.name)) return 'bad name';
  if (typeof r.tavernName !== 'string' || !/^[A-Za-z0-9 _.'&-]{1,28}$/.test(r.tavernName) || !/[A-Za-z0-9]/.test(r.tavernName)) return 'bad tavern name';
  if (LC_CITIES.indexOf(r.homeCity) < 0) return 'bad homeCity';
  if (LC_CATEGORIES.indexOf(r.category) < 0) return 'bad category';
  if (LC_RESULTS.indexOf(r.result) < 0) return 'bad result';
  if (typeof r.version !== 'string' || !/^v\d+\.\d+$/.test(r.version)) return 'bad version';
  if (opts.allowedVersions && opts.allowedVersions.length) {
    var ok = false;
    for (var v = 0; v < opts.allowedVersions.length; v++) if (r.version.indexOf(opts.allowedVersions[v]) === 0) ok = true;
    if (!ok) return 'version not allowed';
  }
  var nums = ['finalCV', 'peakCV', 'simMs', 'realMs', 'pauses', 'sessions'];
  for (var i = 0; i < nums.length; i++) if (!lcIsNum(r[nums[i]])) return 'bad ' + nums[i];
  if (r.finalCV > 1e9 || r.peakCV > 1e9) return 'implausible CV';
  if (r.peakCV < r.finalCV * 0.5) return 'peak below final';
  var maxSim = opts.maxSimMs || 6000000;
  if (r.simMs <= 0 || r.simMs > maxSim) return 'bad run length';
  if (r.realMs < r.simMs * 0.99) return 'clock mismatch';
  if (r.result === 'monopoly') {
    if (!lcIsNum(r.monopolyMs) || r.monopolyMs <= 0 || r.monopolyMs > r.simMs + 100) return 'bad monopoly time';
    if (opts.minMonopolyMs && r.monopolyMs < opts.minMonopolyMs) return 'implausibly fast';
  } else if (r.result === 'sponsor' && opts.minSponsorMs && r.simMs < opts.minSponsorMs) {
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
var TABS = { pre: 'Pre Release Records', official: 'Official Records' };
var TOP_N = 10;
var HEADERS = ['date', 'runId', 'clientId', 'innkeeper', 'tavern', 'homeCity', 'category', 'result', 'monopolyMs', 'finalCV', 'peakCV',
  'simMs', 'realMs', 'pauses', 'sessions', 'firstSisterMs', 'thirdSisterMs', 'firstNo1Ms', 'seed', 'version', 'era', 'contentHash', 'hidden'];
var MIN_MONOPOLY_MS = 8 * 60 * 1000; // faster than any plausible run
var MIN_SPONSOR_MS = 50 * 60 * 1000; // the Year-463 verdict comes ~54 min in

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers) {
      sh.appendRow(headers);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function allowedVersions_() {
  var raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_VERSIONS') || '';
  return raw ? raw.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; }) : [];
}

function doPost(e) {
  var rec;
  try {
    rec = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }
  var bad = lcValidateRecord(rec, { allowedVersions: allowedVersions_(), minMonopolyMs: MIN_MONOPOLY_MS, minSponsorMs: MIN_SPONSOR_MS });
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
    var sh = sheet_(RUNS, HEADERS);
    var last = sh.getLastRow();
    if (last > 1) {
      var from = Math.max(2, last - 1000);
      var ids = sh.getRange(from, 2, last - from + 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) if (ids[i][0] === rec.runId) return json_({ ok: true, duplicate: true });
    }
    var s = rec.splits || {};
    var era = lcEraOf(rec.version);
    sh.appendRow([
      new Date().toISOString(), lcSanitizeCell(rec.runId), lcSanitizeCell(rec.clientId), lcSanitizeCell(rec.name), lcSanitizeCell(rec.tavernName),
      rec.homeCity, rec.category, rec.result, rec.monopolyMs || '', Math.round(rec.finalCV), Math.round(rec.peakCV), Math.round(rec.simMs),
      Math.round(rec.realMs), rec.pauses, rec.sessions, s.firstSisterMs || '', s.thirdSisterMs || '', s.firstNo1Ms || '',
      lcSanitizeCell(rec.seed), lcSanitizeCell(rec.version), era, lcSanitizeCell(rec.contentHash), '',
    ]);
    cache.put('run:' + rec.runId, '1', 21600);
    cache.put('client:' + rec.clientId, '1', 60);
    cache.put(minute, String(count + 1), 120);
    // Invalidate every cached board: the version only ever grows, even after eviction.
    cache.put('boardver', String(Math.max(Number(cache.get('boardver') || 0) + 1, Date.now())), 21600);
    if (rec.result === 'monopoly' || rec.result === 'sponsor') drawRecords_(era);
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function readRuns_() {
  var sh = sheet_(RUNS, HEADERS);
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

function boards_(era) {
  var rows = readRuns_().filter(function (r) { return (r.era || lcEraOf(r.version)) === era; });
  function toRow(r, i, value) {
    return { rank: i + 1, name: String(r.innkeeper), tavern: String(r.tavern), value: Number(value), homeCity: r.homeCity, category: r.category, version: String(r.version), date: String(r.date).slice(0, 10) };
  }
  var mono = rows.filter(function (r) { return r.result === 'monopoly'; })
    .sort(function (a, b) { return (Number(a.monopolyMs) - Number(b.monopolyMs)) || (Number(b.finalCV) - Number(a.finalCV)); })
    .slice(0, TOP_N).map(function (r, i) { return toRow(r, i, r.monopolyMs); });
  var spon = rows.filter(function (r) { return r.result === 'sponsor'; })
    .sort(function (a, b) { return (Number(b.finalCV) - Number(a.finalCV)) || (Number(a.simMs) - Number(b.simMs)); })
    .slice(0, TOP_N).map(function (r, i) { return toRow(r, i, r.finalCV); });
  return { monopoly: mono, sponsor: spon };
}

function clock_(ms) {
  var s = Math.floor(Number(ms) / 1000);
  var m = Math.floor(s / 60);
  var r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

/** Redraws one era's record tab: two top-ten tables side by side. */
function drawRecords_(era) {
  var b = boards_(era);
  var sh = sheet_(TABS[era]);
  sh.clear();
  var head = ['#', 'Innkeeper', 'Tavern', 'Home', 'Version', 'Date'];
  var monoRows = [['Fastest Monopoly', '', '', '', '', '', ''], head.slice(0, 3).concat(['Time']).concat(head.slice(3))];
  b.monopoly.forEach(function (r) { monoRows.push([r.rank, r.name, r.tavern, clock_(r.value), r.homeCity, r.version, r.date]); });
  var sponRows = [['Sponsored the Trials', '', '', '', '', '', ''], head.slice(0, 3).concat(['Company Value']).concat(head.slice(3))];
  b.sponsor.forEach(function (r) { sponRows.push([r.rank, r.name, r.tavern, Math.round(r.value), r.homeCity, r.version, r.date]); });
  sh.getRange(1, 1, monoRows.length, 7).setValues(monoRows);
  sh.getRange(1, 9, sponRows.length, 7).setValues(sponRows);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.rebuild) {
    drawRecords_('pre');
    drawRecords_('official');
    return json_({ ok: true, rebuilt: true });
  }
  var era = p.era === 'official' ? 'official' : 'pre';
  var cache = CacheService.getScriptCache();
  var key = 'boards:' + (cache.get('boardver') || '0') + ':' + era;
  var hit = cache.get(key);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  var text = JSON.stringify(boards_(era));
  cache.put(key, text, 60);
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}
