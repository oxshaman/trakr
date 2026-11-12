/**
 * trakr sync script. It turns a Google Sheet into the backend for the trakr app.
 *
 * Setup:
 *   1. Create a Google Sheet. Open Extensions > Apps Script.
 *   2. Replace the editor contents with this file.
 *   3. Change SECRET below to a long passphrase of your own.
 *   4. Deploy > New deployment > type "Web app".
 *      Execute as: Me. Who has access: Anyone.
 *   5. Copy the web app URL. In trakr, open Settings and paste the URL and the secret.
 *
 * The URL plus the secret work like a password. Anyone who has both can read
 * and change this sheet through the script, so do not share them.
 *
 * After editing this file, use Deploy > Manage deployments > Edit > New version
 * so the URL keeps working with the new code.
 *
 * How it works: the app POSTs its changed records and the last revision number
 * it has seen. The script writes those records into one tab per data type, then
 * answers with every row that changed after that revision. When two devices
 * edit the same record, the one with the newer updatedAt wins.
 */

var SECRET = 'change-me';

// One tab per data type. The first row of each tab holds these column names.
var TABS = {
  weights: ['id', 'date', 'kg', 'updatedAt', 'deleted', 'rev'],
  measurements: ['id', 'date', 'type', 'cm', 'updatedAt', 'deleted', 'rev'],
  exercises: ['id', 'name', 'updatedAt', 'deleted', 'rev'],
  routines: ['id', 'name', 'color', 'position', 'exerciseIds', 'updatedAt', 'deleted', 'rev'],
  workouts: ['id', 'date', 'name', 'routineId', 'color', 'startedAt', 'finishedAt', 'exerciseIds', 'updatedAt', 'deleted', 'rev'],
  sets: ['id', 'date', 'exercise', 'n', 'kg', 'reps', 'rpe', 'done', 'workoutId', 'exerciseId', 'updatedAt', 'deleted', 'rev'],
  settings: ['id', 'value', 'updatedAt', 'deleted', 'rev']
};

// Column types: s = text, n = number, b = true/false, d = date (yyyy-MM-dd), j = JSON.
var KIND = {
  id: 's', name: 's', type: 's', color: 's', routineId: 's', workoutId: 's', exerciseId: 's', exercise: 's', value: 's',
  date: 'd',
  kg: 'n', cm: 'n', n: 'n', reps: 'n', rpe: 'n', position: 'n', startedAt: 'n', finishedAt: 'n', updatedAt: 'n', rev: 'n',
  deleted: 'b', done: 'b',
  exerciseIds: 'j'
};

function doGet() {
  return json_({ ok: true, app: 'trakr', message: 'The script is deployed. trakr talks to it with POST requests.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return json_({ ok: false, error: 'The sheet is busy. Try again in a moment.' });
  }
  try {
    var body = JSON.parse(e.postData.contents);
    if (SECRET === 'change-me') return json_({ ok: false, error: 'Set SECRET in the script, then deploy a new version.' });
    if (body.secret !== SECRET) return json_({ ok: false, error: 'Wrong secret.' });

    var props = PropertiesService.getScriptProperties();
    var current = Number(props.getProperty('rev')) || 0;
    var next = current + 1;
    var since = Number(body.since) || 0;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone();
    var incoming = body.changes || {};
    var out = {};
    var wrote = false;

    for (var name in TABS) {
      var result = syncTab_(ss, name, TABS[name], incoming[name] || [], since, next, tz);
      if (result.wrote) wrote = true;
      if (result.rows.length) out[name] = result.rows;
    }

    // The revision only moves forward when something was written.
    if (wrote) props.setProperty('rev', String(next));
    return json_({ ok: true, rev: wrote ? next : current, changes: out });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

// Applies incoming records to one tab and returns the rows changed after `since`.
function syncTab_(ss, name, cols, incoming, since, rev, tz) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  ensureHeader_(sheet, cols);

  var last = sheet.getLastRow();
  var values = last > 1 ? sheet.getRange(2, 1, last - 1, cols.length).getValues() : [];
  var updCol = cols.indexOf('updatedAt');
  var revCol = cols.indexOf('rev');

  var index = {};
  for (var i = 0; i < values.length; i++) {
    var id = String(values[i][0]);
    if (id !== '') index[id] = i;
  }

  var wrote = false;
  for (var k = 0; k < incoming.length; k++) {
    var rec = incoming[k];
    if (!rec || !rec.id) continue;
    var at = index[rec.id];
    // Keep the row already in the sheet unless the incoming record is newer.
    if (at !== undefined && Number(values[at][updCol]) >= (Number(rec.updatedAt) || 0)) continue;
    var row = [];
    for (var c = 0; c < cols.length; c++) row.push(cols[c] === 'rev' ? rev : toCell_(cols[c], rec[cols[c]]));
    if (at === undefined) {
      index[rec.id] = values.length;
      values.push(row);
    } else {
      values[at] = row;
    }
    wrote = true;
  }

  if (wrote) {
    var needed = values.length + 1 - sheet.getMaxRows();
    if (needed > 0) sheet.insertRowsAfter(sheet.getMaxRows(), needed);
    sheet.getRange(2, 1, values.length, cols.length).setValues(values);
  }

  var rows = [];
  for (var r = 0; r < values.length; r++) {
    if (String(values[r][0]) === '') continue;
    if (Number(values[r][revCol]) > since) rows.push(fromRow_(cols, values[r], tz));
  }
  return { wrote: wrote, rows: rows };
}

// Writes the column names and formats text columns as plain text, so Sheets
// does not turn a name like "10-12" into a date.
function ensureHeader_(sheet, cols) {
  var header = sheet.getRange(1, 1, 1, cols.length).getValues()[0];
  if (header.join('|') === cols.join('|')) return;
  sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
  sheet.setFrozenRows(1);
  for (var c = 0; c < cols.length; c++) {
    var kind = KIND[cols[c]];
    if (kind === 's' || kind === 'j') sheet.getRange(1, c + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  }
}

function toCell_(col, v) {
  var kind = KIND[col];
  if (kind === 'b') return v === true;
  if (v === undefined || v === null || v === '') return '';
  if (kind === 'j') return JSON.stringify(v);
  if (kind === 'n') {
    var n = Number(v);
    return isNaN(n) ? '' : n;
  }
  return String(v);
}

function fromRow_(cols, row, tz) {
  var rec = {};
  for (var c = 0; c < cols.length; c++) {
    var v = fromCell_(cols[c], row[c], tz);
    if (v !== undefined) rec[cols[c]] = v;
  }
  return rec;
}

function fromCell_(col, v, tz) {
  var kind = KIND[col];
  if (kind === 'b') return v === true || String(v).toLowerCase() === 'true';
  if (v === '' || v === null || v === undefined) return undefined;
  if (kind === 'd') {
    // Sheets stores a typed date as a Date object. Send it back as plain text.
    return Object.prototype.toString.call(v) === '[object Date]' ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v);
  }
  if (kind === 'n') {
    var n = Number(v);
    return isNaN(n) ? undefined : n;
  }
  if (kind === 'j') {
    try {
      return JSON.parse(v);
    } catch (err) {
      return [];
    }
  }
  return String(v);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
