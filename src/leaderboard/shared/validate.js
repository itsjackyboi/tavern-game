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

if (typeof module !== 'undefined') {
  module.exports = { lcValidateRecord: lcValidateRecord, lcSanitizeCell: lcSanitizeCell, lcEraOf: lcEraOf, LC_CITIES: LC_CITIES, LC_CATEGORIES: LC_CATEGORIES, LC_RESULTS: LC_RESULTS };
}
