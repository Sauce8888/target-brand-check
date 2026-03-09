import { useState } from "react";
import Papa from "papaparse";

const API_BASE = "/api";

const BRAND_COLUMN_KEYS = ["brand", "brand_name", "brand name", "name", "product"];

const parseCsvBrands = (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      delimiter: ",",
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data || [];
        if (results.errors?.length && rows.length === 0) {
          reject(new Error(results.errors[0].message || "CSV parse error"));
          return;
        }
        if (rows.length === 0) {
          reject(new Error("CSV is empty"));
          return;
        }
        const firstRow = rows[0];
        const keys = Object.keys(firstRow);
        const brandKey =
          keys.find((k) =>
            BRAND_COLUMN_KEYS.includes(k.toLowerCase().trim())
          ) || keys[0];
        const brands = rows
          .map((r) => r[brandKey])
          .filter((v) => v != null && String(v).trim())
          .map((v) => String(v).trim());
        resolve([...new Set(brands)]);
      },
    });
  });
};

const checkBrands = async (brandsInput, debug = false) => {
  const res = await fetch(`${API_BASE}/check-brand`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brands: brandsInput, debug }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }

  const data = await res.json();
  return data;
};

const App = () => {
  const [brand, setBrand] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState(false);
  const [showFullResponse, setShowFullResponse] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setShowFullResponse({});

    const trimmed = brand.trim();
    if (!trimmed) {
      setError("Please enter at least one brand name");
      return;
    }

    setLoading(true);
    try {
      const data = await checkBrands(trimmed, debug);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const brands = await parseCsvBrands(file);
      setBrand(brands.join(", "));
    } catch (err) {
      setError(err.message || "Failed to parse CSV");
    }
    e.target.value = "";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <header className="text-center mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            Target Brand Check
          </h1>
          <p className="text-slate-400">
            See if a brand is stocked at Target using Oxylabs
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 mb-8"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nike, Cetaphil, Uncle Harry's (comma-separated)"
              className="flex-1 px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-target-red focus:border-transparent"
              aria-label="Brand names to search (comma-separated)"
              disabled={loading}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-lg bg-target-red hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-target-red focus:ring-offset-2 focus:ring-offset-slate-950"
              aria-label="Check if brand is stocked"
            >
              {loading ? "Checking…" : "Check"}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={debug}
                onChange={(e) => setDebug(e.target.checked)}
                className="rounded border-slate-600"
                aria-label="Enable debug mode"
              />
              Show raw Oxylabs response
            </label>
            <span className="text-slate-600">or</span>
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Upload CSV file"
              />
              <span className="px-3 py-1.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
                Upload CSV
              </span>
            </label>
          </div>
          <p className="text-xs text-slate-500">
            CSV: use a column named Brand, Brand Name, or Name. First column used if none match.
          </p>
        </form>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-lg bg-red-950/50 border border-red-900 text-red-300"
          >
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-6" aria-live="polite">
            {result.results.map((r, idx) => (
              <section
                key={idx}
                className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden"
              >
                <div className="p-6 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                        r.error
                          ? "bg-red-500/20 text-red-400"
                          : r.isStocked
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          r.error ? "bg-red-400" : r.isStocked ? "bg-emerald-400" : "bg-amber-400"
                        }`}
                      />
                      {r.error
                        ? r.error
                        : r.isStocked
                          ? r.matchCount > 0
                            ? `Stocked (${r.matchCount} product${r.matchCount !== 1 ? "s" : ""})`
                            : "Stocked (brand found in search results)"
                          : "Not found"}
                    </span>
                    <span className="text-slate-400">"{r.brand}"</span>
                  </div>
                </div>

                {r._rawResponse && (() => {
                  const brandNames = r.brandNames ?? [];
                  const rawJson = JSON.stringify(r._rawResponse, null, 2);
                  const isLarge = rawJson.length > 500000;
                  const expanded = showFullResponse[idx] ?? false;
                  const toggleFull = () =>
                    setShowFullResponse((prev) => ({ ...prev, [idx]: !prev[idx] }));
                  return (
                    <div className="p-4 bg-slate-800/50 border-b border-slate-800 space-y-4">
                      <div>
                        <p className="font-semibold text-amber-300 mb-2">
                          brand_name values found ({brandNames.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {brandNames.length > 0 ? (
                            brandNames.map((bn, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 rounded bg-slate-700 text-slate-200 text-sm"
                              >
                                {bn}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 text-sm">None</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={toggleFull}
                          className="text-sm text-amber-300/80 hover:text-amber-300 flex items-center gap-2"
                          aria-expanded={expanded}
                        >
                          {expanded ? "Hide" : "Show"} full response ({Math.round(rawJson.length / 1024)} KB)
                        </button>
                        {expanded && (
                          <div className="mt-2">
                            <div className="flex gap-2 mb-2">
                              <button
                                type="button"
                                onClick={() => navigator.clipboard.writeText(rawJson)}
                                className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
                              >
                                Copy
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const blob = new Blob([rawJson], { type: "application/json" });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `oxylabs-${r.brand.replace(/\s+/g, "-")}.json`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                                className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
                              >
                                Download
                              </button>
                            </div>
                            {isLarge ? (
                              <p className="text-sm text-slate-400">
                                Response too large to display. Use Download.
                              </p>
                            ) : (
                              <pre className="text-xs font-mono text-slate-300 overflow-auto p-3 rounded bg-slate-900 h-[200px] w-full whitespace-pre">
                                {rawJson}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {r.products?.length > 0 && (
                  <div className="divide-y divide-slate-800">
                    {r.products.slice(0, 5).map((product, i) => (
                      <div
                        key={i}
                        className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                      >
                        <div>
                          <p className="font-medium text-white">{product.title}</p>
                          {product.brand && (
                            <p className="text-sm text-slate-400">{product.brand}</p>
                          )}
                        </div>
                        {product.price != null && (
                          <span className="text-target-red font-semibold">
                            {typeof product.price === "string"
                              ? product.price
                              : `$${product.price}`}
                          </span>
                        )}
                        {product.url && (
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-sky-400 hover:text-sky-300 underline"
                          >
                            View on Target
                          </a>
                        )}
                      </div>
                    ))}
                    {r.products.length > 5 && (
                      <p className="p-4 text-sm text-slate-400">
                        +{r.products.length - 5} more
                      </p>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
