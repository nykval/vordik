import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workspace = "/Users/zeliboba/Desktop/vordik";
const outputDir = `${workspace}/outputs/shorts_2026-10-09`;
const outputPath = `${outputDir}/shorts_all_pages.xlsx`;
const previewPath = `${outputDir}/shorts_preview.png`;
const sourceUrl = "https://merchant.streamerce.ru/shorts?order=start-desc&page=1&moderation=0%2C1%2C2";

const records = JSON.parse(await fs.readFile(`${workspace}/shorts_data.json`, "utf8"));
if (!Array.isArray(records) || records.length !== 453) {
  throw new Error(`Expected 453 records, received ${Array.isArray(records) ? records.length : "invalid data"}`);
}

const approved = records.filter((row) => row.status === "Одобрено").length;
const rejected = records.filter((row) => row.status === "Отклонено").length;

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Видео");
sheet.showGridLines = false;
sheet.tabColor = "#1F4E78";

sheet.getRange("A2").values = [["Короткие видео Streamerce"]];
sheet.getRange("A2").format.font = { name: "Arial", size: 14, bold: true, color: "#1F2937" };
sheet.getRange("A3").values = [[`Всего: ${records.length} · Страниц: 31 · Одобрено: ${approved} · Отклонено: ${rejected}`]];
sheet.getRange("A3").format.font = { name: "Arial", size: 10, color: "#4B5563" };
sheet.getRange("A4").values = [["Источник"], ["Примечание"]];
sheet.getRange("B4").values = [[sourceUrl]];
sheet.getRange("B5").values = [["Если к видео привязано несколько товаров, список показывает количество привязок, но отображает только один артикул с названием. В таблицу перенесены видимые данные."]];
sheet.getRange("A4:A5").format.font = { name: "Arial", size: 10, bold: true, color: "#374151" };
sheet.getRange("B4:B5").format.font = { name: "Arial", size: 10, color: "#4B5563" };
sheet.getRange("B4:B5").format.wrapText = false;
sheet.getRange("A4:G4").format.rowHeight = 20;
sheet.getRange("A5:G5").format.rowHeight = 28;

const headers = [
  "Страница",
  "Позиция",
  "ID видео",
  "Описание к видео",
  "Кол-во товаров",
  "Артикул + название товара",
  "Статус",
];
const rows = records.map((row) => [
  row.page,
  row.position,
  row.video_id,
  row.description,
  row.product_count,
  row.product_article_name,
  row.status,
]);

sheet.getRange("A7:G7").values = [headers];
sheet.getRangeByIndexes(7, 0, rows.length, headers.length).values = rows;

const endRow = 7 + rows.length;
const table = sheet.tables.add(`A7:G${endRow}`, true, "ShortsTable");
table.showFilterButton = true;
table.showBandedColumns = false;

sheet.getRange(`A7:G${endRow}`).format.font = { name: "Arial", size: 10, color: "#1F2937" };
sheet.getRange("A7:G7").format = {
  fill: "#1F4E78",
  font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "inside", style: "thin", color: "#FFFFFF" },
};
sheet.getRange(`A8:G${endRow}`).format.verticalAlignment = "top";
sheet.getRange(`A8:B${endRow}`).format.horizontalAlignment = "center";
sheet.getRange(`C8:C${endRow}`).format.horizontalAlignment = "left";
sheet.getRange(`E8:E${endRow}`).format.horizontalAlignment = "right";
sheet.getRange(`G8:G${endRow}`).format.horizontalAlignment = "center";
sheet.getRange(`D8:F${endRow}`).format.wrapText = true;
sheet.getRange(`A8:G${endRow}`).format.rowHeight = 60;
sheet.getRange("A7:G7").format.rowHeight = 32;

sheet.getRange(`A8:A${endRow}`).format.numberFormat = "0";
sheet.getRange(`B8:B${endRow}`).format.numberFormat = "0";
sheet.getRange(`C8:C${endRow}`).format.numberFormat = "@";
sheet.getRange(`E8:E${endRow}`).format.numberFormat = "0";

sheet.getRange("A:A").format.columnWidth = 10;
sheet.getRange("B:B").format.columnWidth = 10;
sheet.getRange("C:C").format.columnWidth = 15;
sheet.getRange("D:D").format.columnWidth = 72;
sheet.getRange("E:E").format.columnWidth = 16;
sheet.getRange("F:F").format.columnWidth = 52;
sheet.getRange("G:G").format.columnWidth = 16;

const statusRange = sheet.getRange(`G8:G${endRow}`);
statusRange.conditionalFormats.add("containsText", {
  text: "Отклонено",
  format: { fill: "#FEE2E2", font: { color: "#B91C1C", bold: true } },
});
statusRange.conditionalFormats.add("containsText", {
  text: "Одобрено",
  format: { fill: "#DCFCE7", font: { color: "#166534" } },
});

sheet.freezePanes.freezeRows(7);
sheet.freezePanes.freezeColumns(3);

workbook.recalculate();

const topCheck = await workbook.inspect({
  kind: "table",
  range: "Видео!A1:G12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 7,
});
console.log(topCheck.ndjson);

const tailCheck = await workbook.inspect({
  kind: "table",
  range: `Видео!A${endRow - 4}:G${endRow}`,
  include: "values,formulas",
  tableMaxRows: 5,
  tableMaxCols: 7,
});
console.log(tailCheck.ndjson);

const rejectedCheck = await workbook.inspect({
  kind: "match",
  searchTerm: "Отклонено",
  options: { maxResults: 20 },
  summary: "rejected status count",
});
console.log(rejectedCheck.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(formulaErrors.ndjson);

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({
  sheetName: "Видео",
  range: "A1:G24",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(JSON.stringify({ outputPath, previewPath, count: records.length, approved, rejected, endRow }));
