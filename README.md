# Target Brand Check

Check if a brand is stocked at Target using the [Oxylabs](https://oxylabs.io) Web Scraper API.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure Oxylabs credentials**

   Create a `.env` file in the project root (or export variables):

   ```bash
   OXYLABS_USERNAME=your_username
   OXYLABS_PASSWORD=your_password
   ```

   Or run with inline env vars:

   ```bash
   OXYLABS_USERNAME=user OXYLABS_PASSWORD=pass npm run dev
   ```

3. **Run the app**

   ```bash
   npm run dev
   ```

   - Frontend: http://localhost:5173  
   - Backend: http://localhost:3001  

## Usage

### Web UI

1. Open http://localhost:5173
2. Enter a brand name (e.g. Nike, Apple, Good & Gather)
3. Click **Check** to see if the brand appears in Target search results

### Batch processing (large CSV files)

For large lists (thousands of brands), use the batch script. It processes brands in parallel, saves progress for resume, and writes results to CSV.

```bash
npm run batch -- input.csv output.csv
```

**Options:**

- `--concurrency=N` — Parallel requests (default: 13)
- `--dry-run` — Parse CSV and report stats without calling Oxylabs (useful for proofing)
- `--pause-after=N` — Stop after processing N brands (useful for controlled runs)
- `--fresh` — Ignore checkpoint and start from the beginning

**Examples:**

```bash
npm run batch -- brands.csv results.csv
npm run batch -- brands.csv results.csv --fresh
npm run batch -- brands.csv results.csv --concurrency=13
npm run batch -- brands.csv results.csv --dry-run
npm run batch -- brands.csv results.csv --pause-after=1000
```

**Resume:** If the script stops (Ctrl+C, crash, rate limit), run the same command again. It resumes from the last checkpoint. Ctrl+C triggers a graceful shutdown that saves progress.

**Background run:**

```bash
nohup npm run batch -- brands.csv results.csv > batch.log 2>&1 &
```

**Input CSV:** Use a column named `Brand`, `Brand Name`, or `Name`. The first column is used if none match.

**Output CSV columns:** `brand`, `isStocked`, `matchedBrand`, `error`

## API

### `POST /api/check-brand`

**Body:** `{ "brand": "Brand Name" }`

**Response:**

```json
{
  "brand": "Nike",
  "isStocked": true,
  "products": [
    {
      "title": "Product Title",
      "brand": "Nike",
      "price": "$29.99",
      "url": "https://..."
    }
  ]
}
```

## Tech Stack

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** Node.js, Express
- **Scraping:** Oxylabs Web Scraper API (`target_search` source)
