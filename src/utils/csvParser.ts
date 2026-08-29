
// RFC 4180-aware CSV Parser.
// Parses the WHOLE text char-by-char (not line-by-line) so that a quoted
// field containing a real newline (e.g. multi-line "i./ii./iii." question
// text) stays as ONE field instead of being cut into separate rows/columns
// by a premature line-split. A quoted field may contain: commas, newlines
// (\n or \r\n), and "" as an escaped literal quote.
export const parseCSV = (csvText: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let insideQuote = false;
  const text = csvText.replace(/^\uFEFF/, ''); // strip BOM if present

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (insideQuote) {
      if (char === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        insideQuote = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        insideQuote = true;
      } else if (char === ',') {
        row.push(field.trim());
        field = '';
      } else if (char === '\r') {
        // skip; \n (bare or in \r\n) handles the row break
      } else if (char === '\n') {
        row.push(field.trim());
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
  }
  // flush trailing field/row (file may not end with a newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  const dataRows = rows.filter(r => r.some(v => v.trim() !== ''));
  if (dataRows.length === 0) return [];

  const headers = dataRows[0].map(h => h.trim().toLowerCase());
  const result = [];

  for (let i = 1; i < dataRows.length; i++) {
    const values = dataRows[i];
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    result.push(obj);
  }
  return result;
};
