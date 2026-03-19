#!/usr/bin/env node
import "dotenv/config";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { fetchTargetBrandPageHtml } from "../lib/oxylabs-results.js";
import { parseTargetBrandResultsFromHtml } from "../lib/results-parser.js";

const DEFAULT_INPUT = "resultsinput.csv";
const DEFAULT_OUTPUT = "resultsoutput.csv";

const DEFAULT_CONCURRENCY = 10;
const RATE_LIMIT_RETRY_DELAY_MS = 60000;
const MAX_RETRIES = 5;
const CHECKPOINT_SAVE_INTERVAL = 10;
const OUTPUT_COLUMNS = ["resultCount", "resultText", "error"];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const parseCsvRows = (filePath) => {
  const content = fs.readFileSync(filePath, "utf-8");
  const results = Papa.parse(content, {
    header: true,
    delimiter: ",",
    skipEmptyLines: true,
  });
  const rows = results.data || [];
  if (rows.length === 0) throw new Error("CSV is empty");
  const inputColumns = results.meta?.fields?.length
    ? [...results.meta.fields]
    : Object.keys(rows[0]);

  const firstRow = rows[0];
  const keys = Object.keys(firstRow);
  const urlKey =
    keys.find((k) => k.toLowerCase().trim() === "input_url") || "INPUT_URL";
  const brandKey =
    keys.find((k) => k.toLowerCase().trim() === "brand_name") || "BRAND_NAME";

  const items = rows
    .map((r) => ({
      inputUrl: String(r[urlKey] ?? "").trim(),
      brandName: String(r[brandKey] ?? "").trim(),
      sourceRow: r,
    }))
    .filter((x) => x.inputUrl);

  return { items, inputColumns, urlKey, brandKey, rowCount: rows.length };
};

const getCheckpointPath = (outputPath) => {
  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  return path.join(dir, `${base}.checkpoint.json`);
};

const loadCheckpoint = (checkpointPath) => {
  if (!fs.existsSync(checkpointPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(checkpointPath, "utf-8"));
    return Array.isArray(data.results) ? data.results : null;
  } catch {
    return null;
  }
};

const saveCheckpoint = (checkpointPath, results) => {
  fs.writeFileSync(
    checkpointPath,
    JSON.stringify({ results, updatedAt: new Date().toISOString() }),
    "utf-8"
  );
};

const writeOutputCsv = (outputPath, results, inputColumns) => {
  const rows = results.map((r) => {
    const baseRow = {};
    for (const col of inputColumns) {
      if (r.sourceRow && Object.prototype.hasOwnProperty.call(r.sourceRow, col)) {
        baseRow[col] = r.sourceRow[col];
        continue;
      }
      if (col.toLowerCase().trim() === "input_url") {
        baseRow[col] = r.inputUrl ?? "";
        continue;
      }
      if (col.toLowerCase().trim() === "brand_name") {
        baseRow[col] = r.brandName ?? "";
        continue;
      }
      baseRow[col] = "";
    }
    return {
      ...baseRow,
      resultCount: r.resultCount ?? "",
      resultText: r.resultText ?? "",
      error: r.error ?? "",
    };
  });
  const csv = Papa.unparse(rows, { columns: [...inputColumns, ...OUTPUT_COLUMNS] });
  fs.writeFileSync(outputPath, csv, "utf-8");
};

const processOneUrl = async (item, retries = 0) => {
  try {
    const { html } = await fetchTargetBrandPageHtml(item.inputUrl);
    const parsed = parseTargetBrandResultsFromHtml(html);
    return {
      ...item,
      resultCount: parsed.resultCount,
      resultText: parsed.resultText,
      hasResults: parsed.hasResults,
      parseMethod: parsed.parseMethod,
      error: null,
    };
  } catch (err) {
    if (err.statusCode === 429 && retries < MAX_RETRIES) {
      const waitMs = RATE_LIMIT_RETRY_DELAY_MS * Math.pow(2, retries);
      console.error(
        `  Rate limited. Waiting ${Math.round(waitMs / 1000)}s before retry ${retries + 1}/${MAX_RETRIES}...`
      );
      await delay(waitMs);
      return processOneUrl(item, retries + 1);
    }
    return {
      ...item,
      resultCount: null,
      resultText: "",
      hasResults: null,
      parseMethod: "error",
      error: err.message,
    };
  }
};

let shutdownRequested = false;

const runBatch = async (
  items,
  inputColumns,
  concurrency,
  checkpointPath,
  outputPath,
  pauseAfter = null
) => {
  const checkpoint = loadCheckpoint(checkpointPath);
  const processedSet = new Set(
    checkpoint ? checkpoint.map((r) => String(r.inputUrl).toLowerCase()) : []
  );
  const results = checkpoint ? [...checkpoint] : [];
  const queue = items.filter(
    (x) => !processedSet.has(String(x.inputUrl).toLowerCase())
  );

  if (queue.length === 0) {
    console.log("All URLs already processed. Writing final output.");
    writeOutputCsv(outputPath, results, inputColumns);
    if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
    return;
  }

  console.log(
    `Resuming: ${results.length} done, ${queue.length} remaining (${items.length} total)`
  );

  let lastSaveCount = results.length;
  let processedThisRun = 0;

  const runWorker = async () => {
    while (queue.length > 0 && !shutdownRequested) {
      if (pauseAfter != null && processedThisRun >= pauseAfter) break;

      const item = queue.shift();
      const r = await processOneUrl(item);
      results.push(r);
      processedThisRun++;

      const pct = ((results.length / items.length) * 100).toFixed(1);
      const status = r.error
        ? "error"
        : typeof r.resultCount === "number"
          ? `${r.resultCount}`
          : "unknown";
      console.log(
        `  [${results.length}/${items.length}] (${pct}%) ${r.brandName}: ${status}`
      );

      if (
        results.length - lastSaveCount >= CHECKPOINT_SAVE_INTERVAL ||
        queue.length === 0 ||
        shutdownRequested ||
        (pauseAfter != null && processedThisRun >= pauseAfter)
      ) {
        saveCheckpoint(checkpointPath, results);
        writeOutputCsv(outputPath, results, inputColumns);
        lastSaveCount = results.length;
      }
    }
  };

  await Promise.all(
    Array(Math.min(concurrency, queue.length))
      .fill(null)
      .map(() => runWorker())
  );

  if (shutdownRequested) {
    saveCheckpoint(checkpointPath, results);
    writeOutputCsv(outputPath, results, inputColumns);
    console.log("Graceful shutdown. Progress saved. Run again to resume.");
    return;
  }

  if (pauseAfter != null && processedThisRun >= pauseAfter) {
    console.log(
      `Paused after ${processedThisRun} URLs. Progress saved. Run again to resume.`
    );
    return;
  }

  if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
  console.log(`Done. Results written to ${outputPath}`);
};

const printUsage = () => {
  console.error(`
Usage: node scripts/run-results-batch.js [input.csv] [output.csv] [options]

Defaults:
  input.csv  = ${DEFAULT_INPUT}
  output.csv = ${DEFAULT_OUTPUT}

Input CSV:
  Must include columns: INPUT_URL, BRAND_NAME

Output CSV columns:
  all input columns + resultCount, resultText, error

Options:
  --concurrency=N   Parallel requests (default: ${DEFAULT_CONCURRENCY})
  --dry-run         Parse CSV and report stats without calling Oxylabs
  --pause-after=N   Stop after processing N URLs (useful for controlled runs)
  --fresh           Ignore checkpoint and start from the beginning (deletes existing checkpoint/output)
`);
};

const main = () => {
  const args = process.argv.slice(2);
  const hasHelp = args.includes("--help") || args.includes("-h");
  if (hasHelp) {
    printUsage();
    process.exit(0);
  }

  const positional = args.filter((a) => !a.startsWith("--"));
  const inputPath = positional[0] || DEFAULT_INPUT;
  const outputPath = positional[1] || DEFAULT_OUTPUT;

  let concurrency = DEFAULT_CONCURRENCY;
  let dryRun = false;
  let pauseAfter = null;
  let fresh = false;

  const concArg = args.find((a) => a.startsWith("--concurrency="));
  if (concArg) {
    const n = parseInt(concArg.split("=")[1], 10);
    if (!isNaN(n) && n >= 1 && n <= 50) concurrency = n;
  }
  if (args.includes("--dry-run")) dryRun = true;
  if (args.includes("--fresh")) fresh = true;
  const pauseArg = args.find((a) => a.startsWith("--pause-after="));
  if (pauseArg) {
    const n = parseInt(pauseArg.split("=")[1], 10);
    if (!isNaN(n) && n >= 1) pauseAfter = n;
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  if (
    !dryRun &&
    (!process.env.OXYLABS_NEW_USER || !process.env.OXYLABS_NEW_PASS)
  ) {
    console.error("Set OXYLABS_NEW_USER and OXYLABS_NEW_PASS in .env");
    process.exit(1);
  }

  const { items, inputColumns, urlKey, brandKey, rowCount } = parseCsvRows(inputPath);

  if (dryRun) {
    console.log("Dry run (no Oxylabs calls):");
    console.log(`  Input file: ${inputPath}`);
    console.log(`  Rows: ${rowCount}`);
    console.log(`  URL column: "${urlKey}"`);
    console.log(`  Brand column: "${brandKey}"`);
    console.log(`  Items: ${items.length}`);
    console.log("  Sample:");
    items.slice(0, 5).forEach((x, i) => {
      console.log(`    ${i + 1}. ${x.brandName} -> ${x.inputUrl}`);
    });
    if (items.length > 5) console.log(`    ... and ${items.length - 5} more`);
    return;
  }

  const checkpointPath = getCheckpointPath(outputPath);

  if (fresh) {
    if (fs.existsSync(checkpointPath)) {
      fs.unlinkSync(checkpointPath);
      console.log("Removed checkpoint (--fresh). Starting from beginning.");
    }
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  }

  process.on("SIGINT", () => {
    shutdownRequested = true;
  });

  console.log(
    `Processing ${items.length} URLs (concurrency: ${concurrency})`
  );
  runBatch(
    items,
    inputColumns,
    concurrency,
    checkpointPath,
    outputPath,
    pauseAfter
  ).catch(
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
};

main();

