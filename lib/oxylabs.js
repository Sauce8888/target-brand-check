const OXYLABS_ENDPOINT = "https://realtime.oxylabs.io/v1/queries";

export const checkBrandInTarget = async (brandName) => {
  const OXYLABS_USERNAME = process.env.OXYLABS_USERNAME;
  const OXYLABS_PASSWORD = process.env.OXYLABS_PASSWORD;

  if (!OXYLABS_USERNAME || !OXYLABS_PASSWORD) {
    throw new Error(
      "Missing Oxylabs credentials. Set OXYLABS_USERNAME and OXYLABS_PASSWORD environment variables."
    );
  }

  const credentials = Buffer.from(
    `${OXYLABS_USERNAME}:${OXYLABS_PASSWORD}`
  ).toString("base64");

  const response = await fetch(OXYLABS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      source: "target_search",
      query: brandName,
      parse: true,
      render: "html",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      const parsed = (() => {
        try {
          return JSON.parse(errorText);
        } catch {
          return {};
        }
      })();
      const msg =
        parsed.message ||
        "Rate limit reached. Oxylabs is limiting requests. Please wait a few minutes and try again.";
      const err = new Error(msg);
      err.statusCode = 429;
      throw err;
    }
    throw new Error(`Oxylabs API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data;
};
