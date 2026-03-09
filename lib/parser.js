export const findAllBrandNames = (obj, acc = [], seen = new Set()) => {
  if (!obj || typeof obj !== "object") return acc;
  if (Array.isArray(obj)) {
    obj.forEach((item) => findAllBrandNames(item, acc, seen));
    return acc;
  }
  const brandStr =
    obj.brand_name ??
    (typeof obj.brand === "string" ? obj.brand : obj.brand?.name) ??
    obj.vendor;
  if (typeof brandStr === "string" && brandStr.trim()) {
    const key = brandStr.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      acc.push(brandStr.trim());
    }
  }
  Object.values(obj).forEach((val) => findAllBrandNames(val, acc, seen));
  return acc;
};

export const normalizeForMatch = (str) => {
  if (!str || typeof str !== "string") return "";
  return str
    .toLowerCase()
    .replace(/[''\-.,]/g, "")
    .replace(/\s+/g, "")
    .trim();
};

const MIN_PARTIAL_BRAND_LEN = 4;

export const brandsMatch = (searchNorm, brandNorm) => {
  if (!searchNorm || !brandNorm) return false;
  if (searchNorm === brandNorm) return true;
  const shorter =
    searchNorm.length <= brandNorm.length ? searchNorm : brandNorm;
  if (shorter.length < MIN_PARTIAL_BRAND_LEN) return false;
  return searchNorm.includes(brandNorm) || brandNorm.includes(searchNorm);
};

const brandStockedByBrandName = (response, searchBrand) => {
  const brandNames = findAllBrandNames(response);
  const searchNorm = normalizeForMatch(searchBrand);
  return brandNames.some(
    (bn) => bn && brandsMatch(searchNorm, normalizeForMatch(bn))
  );
};

const findProductArray = (obj) => {
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    const hasProductShape = obj.some(
      (x) =>
        x && typeof x === "object" && (x.title || x.name || x.product_title)
    );
    return hasProductShape ? obj : null;
  }
  const keys = [
    "results",
    "products",
    "items",
    "product_results",
    "search_results",
    "data",
  ];
  for (const key of keys) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0) {
      const found = findProductArray(val);
      if (found) return found;
      const hasProductShape = val.some(
        (x) =>
          x && typeof x === "object" && (x.title || x.name || x.product_title)
      );
      if (hasProductShape) return val;
    }
  }
  for (const val of Object.values(obj)) {
    const found = findProductArray(val);
    if (found) return found;
  }
  return null;
};

export const normalizeProduct = (item) => {
  const content = item?.content || item;
  const title =
    content?.title ||
    content?.name ||
    content?.product_title ||
    content?.product_name ||
    "";
  const brand =
    content?.brand_name ||
    (typeof content?.brand === "string"
      ? content.brand
      : content?.brand?.name || content?.vendor || "");
  const price =
    content?.price ?? content?.current_price ?? content?.final_price;
  const url = content?.url || content?.link || content?.href || item?.url;
  return { title, brand, price, url };
};

const productMatchesBrand = (normalized, searchBrand) => {
  const productBrand = normalized.brand || "";
  if (!productBrand) return false;
  return brandsMatch(
    normalizeForMatch(searchBrand),
    normalizeForMatch(productBrand)
  );
};

const collectMatchingProducts = (obj, searchBrand, acc = [], seen = new Set()) => {
  if (!obj || typeof obj !== "object") return acc;
  if (Array.isArray(obj)) {
    obj.forEach((item) => collectMatchingProducts(item, searchBrand, acc, seen));
    return acc;
  }
  const brandName = obj.brand_name || (obj.brand?.name ?? obj.brand);
  const brandStr = typeof brandName === "string" ? brandName : "";
  const hasProductData = obj.title || obj.name || obj.product_title;
  if (
    hasProductData &&
    brandsMatch(normalizeForMatch(searchBrand), normalizeForMatch(brandStr))
  ) {
    const key = obj.url || obj.link || obj.title || JSON.stringify(obj).slice(0, 100);
    if (!seen.has(key)) {
      seen.add(key);
      acc.push(normalizeProduct({ content: obj }));
    }
  }
  Object.values(obj).forEach((val) =>
    collectMatchingProducts(val, searchBrand, acc, seen)
  );
  return acc;
};

export const extractBrandResults = (oxylabsResponse, searchBrand) => {
  const resultsArray = oxylabsResponse?.results;
  const results = [];

  const addIfMatches = (normalized) => {
    if (!normalized.title && !normalized.brand) return;
    if (productMatchesBrand(normalized, searchBrand)) {
      results.push(normalized);
    }
  };

  if (Array.isArray(resultsArray)) {
    for (const item of resultsArray) {
      const content = item?.content;
      if (!content) continue;
      if (typeof content === "string") continue;

      const hasProductData =
        content.title || content.name || content.product_title;
      if (hasProductData) {
        addIfMatches(normalizeProduct(item));
      }
    }
  }

  if (results.length === 0) {
    const content = oxylabsResponse?.results?.[0]?.content;
    const nestedArray =
      content && typeof content === "object"
        ? findProductArray(content)
        : null;
    if (Array.isArray(nestedArray)) {
      for (const item of nestedArray) {
        addIfMatches(normalizeProduct(item));
      }
    }
  }

  const stockedByBrandName = brandStockedByBrandName(oxylabsResponse, searchBrand);
  const brandNameProducts =
    results.length === 0 ? collectMatchingProducts(oxylabsResponse, searchBrand) : [];
  const products = results.length > 0 ? results : brandNameProducts;

  return {
    isStocked: results.length > 0 || stockedByBrandName,
    matchCount: products.length,
    products,
  };
};
