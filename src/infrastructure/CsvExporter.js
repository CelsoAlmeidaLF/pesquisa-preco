/**
 * Infrastructure / src/infrastructure/CsvExporter.js
 * CSV with semicolons and BOM, the format that spreadsheets in pt-BR open without configuration.
 */
const escapeCell = value => {
  const text = value == null ? '' : typeof value === 'number' ? String(value).replace('.', ',') : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value !== 'number' ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = rows => `﻿${rows.map(row => row.map(escapeCell).join(';')).join('\r\n')}\r\n`;

export function downloadCsv(fileName, rows, doc = document) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = fileName;
  doc.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
