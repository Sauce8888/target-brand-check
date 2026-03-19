const OXYLABS_ENDPOINT = "https://realtime.oxylabs.io/v1/queries";

const getNewOxylabsCredentials = () => {
  const username = process.env.OXYLABS_NEW_USER;
  const password = process.env.OXYLABS_NEW_PASS;

  if (!username || !password) {
    throw new Error(
      "Missing NEW Oxylabs credentials. Set OXYLABS_NEW_USER and OXYLABS_NEW_PASS environment variables."
    );
  }

  const credentials = Buffer.from(`${username}:${password}`).toString("base64");
  return credentials;
};

export const fetchTargetBrandPageHtml = async (targetBrandUrl) => {
  if (!targetBrandUrl || typeof targetBrandUrl !== "string") {
    throw new Error("Missing targetBrandUrl");
  }

  const credentials = getNewOxylabsCredentials();

  const response = await fetch(OXYLABS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      source: "universal",
      url: targetBrandUrl,
      parse: false,
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
  const html = data?.results?.[0]?.content;
  if (typeof html !== "string" || !html.trim()) {
    return { data, html: "" };
  }
  return { data, html };
};

