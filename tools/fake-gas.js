// A small stand-in for the Google Apps Script services that Code.gs uses.
// It lets the tests run the real script against an in-memory spreadsheet.
//
// The fake copies two Sheets behaviours that matter for the script:
//   - a typed 'yyyy-MM-dd' string becomes a Date unless the column is plain text
//   - writing outside the sheet's row count throws

const pad = (n) => String(n).padStart(2, '0');
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

class FakeRange {
  constructor(sheet, row, col, rows, cols) {
    Object.assign(this, { sheet, row, col, rows, cols });
  }

  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) {
        const v = (this.sheet.cells[this.row + r - 1] || [])[this.col + c - 1];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }

  setValues(values) {
    if (values.length !== this.rows || values.some((line) => line.length !== this.cols)) {
      throw new Error('The number of rows or columns in the data does not match the range.');
    }
    for (let r = 0; r < this.rows; r++) {
      const at = this.row + r - 1;
      if (!this.sheet.cells[at]) this.sheet.cells[at] = [];
      for (let c = 0; c < this.cols; c++) {
        this.sheet.cells[at][this.col + c - 1] = this.sheet.coerce(values[r][c], this.col + c);
      }
    }
    return this;
  }

  setNumberFormat(format) {
    if (format === '@') for (let c = 0; c < this.cols; c++) this.sheet.textCols.add(this.col + c);
    return this;
  }
}

class FakeSheet {
  constructor(name, maxRows) {
    this.name = name;
    this.cells = [];
    this.maxRows = maxRows;
    this.textCols = new Set();
    this.frozen = 0;
  }

  coerce(v, col) {
    if (typeof v !== 'string' || this.textCols.has(col)) return v;
    const m = DATE_RE.exec(v);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (v !== '' && !isNaN(Number(v))) return Number(v);
    if (v === 'true' || v === 'false') return v === 'true';
    return v;
  }

  getLastRow() {
    for (let r = this.cells.length; r > 0; r--) {
      if ((this.cells[r - 1] || []).some((v) => v !== '' && v !== undefined)) return r;
    }
    return 0;
  }

  getMaxRows() {
    return this.maxRows;
  }

  insertRowsAfter(after, count) {
    this.maxRows += count;
    return this;
  }

  getRange(row, col, rows = 1, cols = 1) {
    if (row < 1 || col < 1 || row + rows - 1 > this.maxRows) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    }
    return new FakeRange(this, row, col, rows, cols);
  }

  setFrozenRows(n) {
    this.frozen = n;
  }

  // Test helper: rows as objects keyed by the header row.
  records() {
    const [header, ...rows] = this.cells;
    return rows.filter((r) => r && r[0] !== '' && r[0] !== undefined).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  }
}

export function makeFakeGas({ maxRows = 1000 } = {}) {
  const sheets = new Map();
  const props = new Map();
  const spreadsheet = {
    getSheetByName: (name) => sheets.get(name) || null,
    insertSheet: (name) => {
      const sheet = new FakeSheet(name, maxRows);
      sheets.set(name, sheet);
      return sheet;
    },
    getSpreadsheetTimeZone: () => 'Etc/Fake',
  };
  return {
    sheets,
    props,
    globals: {
      SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (props.has(k) ? props.get(k) : null),
          setProperty: (k, v) => props.set(k, String(v)),
        }),
      },
      ContentService: {
        MimeType: { JSON: 'application/json' },
        createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
      },
      Utilities: {
        formatDate: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      },
    },
  };
}

// Loads Code.gs source text and returns its doPost and doGet bound to the fakes.
export function loadScript(source, gas, secret = 'test-secret') {
  const names = Object.keys(gas.globals);
  const body = `${source}\nSECRET = ${JSON.stringify(secret)};\nreturn { doPost: doPost, doGet: doGet };`;
  return new Function(...names, body)(...names.map((n) => gas.globals[n]));
}

// A transport for the Sync class that calls the script directly instead of over HTTP.
export function scriptTransport(script) {
  return async (url, payload) => JSON.parse(script.doPost({ postData: { contents: JSON.stringify(payload) } }).text);
}
