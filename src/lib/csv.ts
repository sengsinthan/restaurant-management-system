/** Minimal RFC 4180 CSV writer — quotes anything containing a delimiter,
 *  quote or newline, and prefixes the BOM so Excel reads UTF-8 correctly. */

export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined };

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => escapeCell(c.header)).join(","),
    ...rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(",")),
  ];
  return `﻿${lines.join("\r\n")}`;
}

/** Triggers a browser download of the given CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
