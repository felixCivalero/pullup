// Robust parser for "dump your data from <brand>" files. The legacy
// csvImportService.parseCsv is comma-only, splits on raw newlines (breaking
// quoted multiline fields), and silently skips ragged rows — fine for the
// old CRM tool, fatal for an importer that promises its counts always
// reconcile against the file. This one:
//
//   - strips a UTF-8 BOM
//   - honors + skips Excel's "sep=;" hint line
//   - auto-detects the delimiter (, ; or tab — Swedish Excel exports CSVs
//     with semicolons, so this is not exotic)
//   - is a real state machine: quoted fields may contain delimiters,
//     escaped quotes ("") and NEWLINES
//   - never silently drops a row: short rows are padded, overlong rows are
//     returned as skipped entries with line numbers and reasons
//   - dedupes duplicate headers ("Email", "Email (2)") and names blank ones
//
// Returns { headers, rows, skipped, delimiter }.

export function parseDump(text) {
  let src = String(text || "");
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // BOM

  // Excel delimiter hint line: "sep=;" (optionally CRLF-terminated)
  let sepHint = null;
  const sepMatch = src.match(/^sep=(.)\r?\n/i);
  if (sepMatch) {
    sepHint = sepMatch[1];
    src = src.slice(sepMatch[0].length);
  }

  const delimiter = sepHint || detectDelimiter(src);

  // State machine over the whole text — records are NOT lines.
  const records = [];
  let record = [], field = "", inQuotes = false, line = 1, recordStartLine = 1;
  const pushField = () => { record.push(field); field = ""; };
  const pushRecord = () => {
    // Skip records that are entirely empty (blank lines).
    if (record.length === 1 && record[0].trim() === "") { record = []; return; }
    records.push({ cells: record, line: recordStartLine });
    record = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      pushField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      line++;
      pushField();
      pushRecord();
      recordStartLine = line;
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length) { pushField(); pushRecord(); }

  if (!records.length) return { headers: [], rows: [], skipped: [], delimiter };

  // Headers: trim, name blanks, dedupe duplicates.
  const seen = new Map();
  const headers = records[0].cells.map((h, i) => {
    let name = String(h).trim() || `Column ${i + 1}`;
    const n = seen.get(name) || 0;
    seen.set(name, n + 1);
    return n ? `${name} (${n + 1})` : name;
  });

  const rows = [];
  const skipped = [];
  for (let r = 1; r < records.length; r++) {
    const { cells, line: ln } = records[r];
    if (cells.length > headers.length) {
      skipped.push({ line: ln, reason: `${cells.length} columns, expected ${headers.length}` });
      continue;
    }
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
    rows.push(row);
  }

  return { headers, rows, skipped, delimiter };
}

// Pick the delimiter that appears most in the first data line, counted
// OUTSIDE quotes so "Storgatan 1, Stockholm" doesn't vote for comma.
function detectDelimiter(src) {
  const firstLine = src.slice(0, src.indexOf("\n") === -1 ? src.length : src.indexOf("\n"));
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ",";
}
