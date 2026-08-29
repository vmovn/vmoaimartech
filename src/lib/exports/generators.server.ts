// Server-only: format DatasetResult into CSV/JSON/Excel/PDF bytes.
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DatasetResult } from "./data-fetchers.server";
import type { ExportFormat } from "./types";

export interface GeneratedFile {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toCsv(result: DatasetResult): Uint8Array {
  const escape = (v: unknown) => {
    const s = stringify(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines: string[] = [];
  lines.push(result.columns.map(escape).join(","));
  for (const row of result.rows) {
    lines.push(result.columns.map((c) => escape(row[c])).join(","));
  }
  return new TextEncoder().encode(lines.join("\n"));
}

function toJson(result: DatasetResult): Uint8Array {
  const payload = {
    title: result.title,
    generated_at: new Date().toISOString(),
    row_count: result.rows.length,
    columns: result.columns,
    rows: result.rows,
  };
  return new TextEncoder().encode(JSON.stringify(payload, null, 2));
}

function toExcel(result: DatasetResult): Uint8Array {
  const rows = result.rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of result.columns) o[c] = r[c] ?? "";
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(rows, { header: result.columns });
  ws["!cols"] = result.columns.map((c) => ({
    wch: Math.min(48, Math.max(c.length + 2, ...rows.slice(0, 100).map((r) => stringify(r[c]).length + 2))),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, result.title.slice(0, 30) || "Export");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buf as ArrayBuffer);
}

async function toPdf(result: DatasetResult, meta: { workspaceName?: string; generatedBy?: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageW = 842, pageH = 595; // A4 landscape (pt)
  const margin = 36;
  const maxCols = Math.min(result.columns.length, 8);
  const shownCols = result.columns.slice(0, maxCols);
  const colWidth = (pageW - margin * 2) / maxCols;
  const rowHeight = 16;
  const brand = rgb(0.11, 0.31, 0.85);
  const muted = rgb(0.45, 0.45, 0.5);
  const border = rgb(0.85, 0.85, 0.9);

  const drawHeader = (page: import("pdf-lib").PDFPage) => {
    page.drawRectangle({ x: 0, y: pageH - 60, width: pageW, height: 60, color: brand });
    page.drawText(result.title, { x: margin, y: pageH - 38, size: 18, font: bold, color: rgb(1, 1, 1) });
    page.drawText(`${result.rows.length.toLocaleString()} rows • Generated ${new Date().toLocaleString()}`, {
      x: margin, y: pageH - 55, size: 9, font, color: rgb(0.9, 0.92, 1),
    });
    if (meta.workspaceName) {
      const w = font.widthOfTextAtSize(meta.workspaceName, 10);
      page.drawText(meta.workspaceName, { x: pageW - margin - w, y: pageH - 38, size: 10, font, color: rgb(1, 1, 1) });
    }
    // Table header row
    const y = pageH - 80;
    page.drawRectangle({ x: margin, y: y - 2, width: pageW - margin * 2, height: rowHeight + 4, color: rgb(0.96, 0.97, 1) });
    shownCols.forEach((c, i) => {
      page.drawText(c, { x: margin + i * colWidth + 4, y: y + 4, size: 9, font: bold, color: rgb(0.15, 0.17, 0.25) });
    });
    return y - rowHeight;
  };

  const drawFooter = (page: import("pdf-lib").PDFPage, pageNum: number, totalPages: number) => {
    const text = `Page ${pageNum} of ${totalPages}${meta.generatedBy ? ` • ${meta.generatedBy}` : ""}`;
    page.drawText(text, { x: margin, y: 18, size: 8, font, color: muted });
    page.drawLine({ start: { x: margin, y: 30 }, end: { x: pageW - margin, y: 30 }, thickness: 0.5, color: border });
  };

  const rowsPerPage = Math.floor((pageH - 130) / rowHeight);
  const pages = Math.max(1, Math.ceil(result.rows.length / rowsPerPage));
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([pageW, pageH]);
    let y = drawHeader(page);
    const slice = result.rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    slice.forEach((row, ri) => {
      if (ri % 2 === 1) {
        page.drawRectangle({ x: margin, y: y - 2, width: pageW - margin * 2, height: rowHeight, color: rgb(0.98, 0.98, 1) });
      }
      shownCols.forEach((c, i) => {
        let text = stringify(row[c]);
        const maxChars = Math.floor(colWidth / 5);
        if (text.length > maxChars) text = text.slice(0, maxChars - 1) + "…";
        page.drawText(text, { x: margin + i * colWidth + 4, y: y + 3, size: 8, font, color: rgb(0.2, 0.22, 0.3) });
      });
      y -= rowHeight;
    });
    drawFooter(page, p + 1, pages);
  }
  if (result.rows.length === 0) {
    const page = doc.getPage(0);
    page.drawText("No rows returned for the selected filters.", { x: margin, y: pageH / 2, size: 12, font, color: muted });
  }
  return await doc.save();
}

export async function generate(
  result: DatasetResult,
  format: ExportFormat,
  meta: { workspaceName?: string; generatedBy?: string } = {},
): Promise<GeneratedFile> {
  switch (format) {
    case "csv": return { bytes: toCsv(result), contentType: "text/csv", extension: "csv" };
    case "json": return { bytes: toJson(result), contentType: "application/json", extension: "json" };
    case "excel": return { bytes: toExcel(result), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" };
    case "pdf": return { bytes: await toPdf(result, meta), contentType: "application/pdf", extension: "pdf" };
  }
}
