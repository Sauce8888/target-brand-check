import "dotenv/config";
import express from "express";
import cors from "cors";
import { checkBrandInTarget } from "../lib/oxylabs.js";
import {
  extractBrandResults,
  findAllBrandNames,
} from "../lib/parser.js";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

app.post("/api/check-brand", async (req, res) => {
  try {
    const { brand, brands, debug } = req.body;

    const input = brands ?? brand;
    if (!input || typeof input !== "string") {
      return res.status(400).json({
        error: "Brand name(s) required",
      });
    }

    const brandList = input
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);

    if (brandList.length === 0) {
      return res.status(400).json({
        error: "At least one brand name required",
      });
    }

    const results = [];
    for (let i = 0; i < brandList.length; i++) {
      if (i > 0) await delay(2000);
      const trimmedBrand = brandList[i];
      try {
        const oxylabsResponse = await checkBrandInTarget(trimmedBrand);
        const result = extractBrandResults(oxylabsResponse, trimmedBrand);
        results.push({
          brand: trimmedBrand,
          ...result,
          ...(debug && {
            _rawResponse: oxylabsResponse,
            brandNames: findAllBrandNames(oxylabsResponse),
          }),
        });
      } catch (err) {
        results.push({
          brand: trimmedBrand,
          isStocked: false,
          matchCount: 0,
          products: [],
          error: err.message,
        });
      }
    }

    return res.json({
      results,
      count: results.length,
    });
  } catch (err) {
    console.error("Brand check error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message || "Failed to check brand",
      rateLimited: status === 429,
    });
  }
});

app.get("/api/health", (_req, res) => {
  const OXYLABS_USERNAME = process.env.OXYLABS_USERNAME;
  const OXYLABS_PASSWORD = process.env.OXYLABS_PASSWORD;
  res.json({
    ok: true,
    hasCredentials: !!(OXYLABS_USERNAME && OXYLABS_PASSWORD),
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
