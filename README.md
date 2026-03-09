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

1. Open http://localhost:5173
2. Enter a brand name (e.g. Nike, Apple, Good & Gather)
3. Click **Check** to see if the brand appears in Target search results

## API

### `POST /api/check-brand`

**Body:** `{ "brand": "Brand Name" }`

**Response:**

```json
{
  "brand": "Nike",
  "isStocked": true,
  "matchCount": 5,
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
