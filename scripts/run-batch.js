#!/usr/bin/env node
import "dotenv/config";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { checkBrandInTarget } from "../lib/oxylabs.js";
import { extractBrandResults } from "../lib/parser.js";

const BRAND_COLUMN_KEYS = ["brand", "brand_name", "brand name", "name", "product"];
const DEFAULT_CONCURRENCY = 10;
const RATE_LIMIT_RETRY_DELAY_MS = 60000;
const MAX_RETRIES = 5;
const CHECKPOINT_SAVE_INTERVAL = 10;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const parseCsvBrands = (filePath) => {
  const content = fs.readFileSync(filePath, "utf-8");
  const results = Papa.parse(content, {
    header: true,
    delimiter: ",",
    skipEmptyLines: true,
  });
  const rows = results.data || [];
  if (rows.length === 0) {
    throw new Error("CSV is empty");
  }
  const firstRow = rows[0];
  const keys = Object.keys(firstRow);
  const brandKey =
    keys.find((k) => BRAND_COLUMN_KEYS.includes(k.toLowerCase().trim())) ||
    keys[0];
  const brands = rows
    .map((r) => r[brandKey])
    .filter((v) => v != null && String(v).trim())
    .map((v) => String(v).trim());
  return [...new Set(brands)];
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

const writeOutputCsv = (outputPath, results) => {
  const rows = results.map((r) => ({
    brand: r.brand,
    isStocked: r.isStocked,
    matchCount: r.matchCount,
    matchedBrand: r.products?.[0]?.brand ?? "",
    error: r.error ?? "",
  }));
  const csv = Papa.unparse(rows);
  fs.writeFileSync(outputPath, csv, "utf-8");
};

const processOneBrand = async (brand, retries = 0) => {
  try {
    const oxylabsResponse = await checkBrandInTarget(brand);
    const result = extractBrandResults(oxylabsResponse, brand);
    return { brand, ...result, error: null };
  } catch (err) {
    if (err.statusCode === 429 && retries < MAX_RETRIES) {
      const waitMs = RATE_LIMIT_RETRY_DELAY_MS * Math.pow(2, retries);
      console.error(`  Rate limited. Waiting ${Math.round(waitMs / 1000)}s before retry ${retries + 1}/${MAX_RETRIES}...`);
      await delay(waitMs);
      return processOneBrand(brand, retries + 1);
    }
    return {
      brand,
      isStocked: false,
      matchCount: 0,
      products: [],
      error: err.message,
    };
  }
};

const runBatch = async (brands, concurrency, checkpointPath, outputPath) => {
  const checkpoint = loadCheckpoint(checkpointPath);
  const processedSet = new Set(
    checkpoint ? checkpoint.map((r) => r.brand.toLowerCase()) : []
  );
  const results = checkpoint ? [...checkpoint] : [];
  const queue = brands.filter((b) => !processedSet.has(b.toLowerCase()));

  if (queue.length === 0) {
    console.log("All brands already processed. Writing final output.");
    writeOutputCsv(outputPath, results);
    if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
    return;
  }

  console.log(
    `Resuming: ${results.length} done, ${queue.length} remaining (${brands.length} total)`
  );

  let lastSaveCount = results.length;

  const runWorker = async () => {
    while (queue.length > 0) {
      const brand = queue.shift();
      const r = await processOneBrand(brand);
      results.push(r);
      const pct = ((results.length / brands.length) * 100).toFixed(1);
      const status = r.error ? "error" : r.isStocked ? "stocked" : "not found";
      console.log(`  [${results.length}/${brands.length}] (${pct}%) ${r.brand}: ${status}`);

      if (
        results.length - lastSaveCount >= CHECKPOINT_SAVE_INTERVAL ||
        queue.length === 0
      ) {
        saveCheckpoint(checkpointPath, results);
        writeOutputCsv(outputPath, results);
        lastSaveCount = results.length;
      }
    }
  };

  await Promise.all(
    Array(Math.min(concurrency, queue.length))
      .fill(null)
      .map(() => runWorker())
  );

  if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
  console.log(`Done. Results written to ${outputPath}`);
};

const main = () => {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(`
Usage: node scripts/run-batch.js <input.csv> <output.csv> [--concurrency=N]

  input.csv   CSV with brand column (Brand, Brand Name, or Name)
  output.csv  Where to write results (brand, isStocked, matchCount, matchedBrand, error)
  --concurrency=N  Parallel requests (default: ${DEFAULT_CONCURRENCY}). Lower if you hit rate limits.

Examples:
  npm run batch brands.csv results.csv
  node scripts/run-batch.js brands.csv results.csv --concurrency=2

Run in background:
  nohup npm run batch brands.csv results.csv > batch.log 2>&1 &
`);
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];
  let concurrency = DEFAULT_CONCURRENCY;
  const concArg = args.find((a) => a.startsWith("--concurrency="));
  if (concArg) {
    const n = parseInt(concArg.split("=")[1], 10);
    if (!isNaN(n) && n >= 1 && n <= 50) concurrency = n;
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  if (!process.env.OXYLABS_USERNAME || !process.env.OXYLABS_PASSWORD) {
    console.error("Set OXYLABS_USERNAME and OXYLABS_PASSWORD in .env");
    process.exit(1);
  }

  const brands = parseCsvBrands(inputPath);
  const checkpointPath = getCheckpointPath(outputPath);

  console.log(`Processing ${brands.length} brands (concurrency: ${concurrency})`);
  runBatch(brands, concurrency, checkpointPath, outputPath).catch((err) => {
    console.error(err);
    process.exit(1);
  });
};

main();
