export const parseTargetBrandResultsFromHtml = (html) => {
  const empty = {
    resultCount: null,
    resultText: "",
    hasResults: null,
    parseMethod: "none",
  };

  if (!html || typeof html !== "string") return empty;

  const lowerHtml = html.toLowerCase();
  if (lowerHtml.includes("no results found")) {
    return {
      resultCount: 0,
      resultText: "No results found",
      hasResults: false,
      parseMethod: "string:no-results-found",
    };
  }

  const anchoredCountMatch = html.match(
    /data-test=["']lp-resultsCount["'][\s\S]*?<span[^>]*>\s*([\d,]+)\s+results?\s*<\/span>/i
  );
  if (anchoredCountMatch?.[1]) {
    const n = parseInt(anchoredCountMatch[1].replace(/,/g, ""), 10);
    if (!Number.isNaN(n)) {
      return {
        resultCount: n,
        resultText: `${n} Results`,
        hasResults: n > 0,
        parseMethod: "html:lp-resultsCount",
      };
    }
  }

  return {
    ...empty,
    parseMethod: "unknown",
  };
};

