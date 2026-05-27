export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const target = buildTargetUrl(url);
    if (!target) {
      return new Response("Unsupported proxy path", {
        status: 404,
        headers: corsHeaders(),
      });
    }

    const response = await fetch(target, {
      method: "GET",
      headers: {
        Accept: url.pathname.startsWith("/savant/") ? "text/csv,*/*" : "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        ...corsHeaders(),
        "Content-Type": response.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  },
};

function buildTargetUrl(url) {
  if (url.pathname.startsWith("/api/")) {
    return `https://statsapi.mlb.com${url.pathname}${url.search}`;
  }

  if (url.pathname.startsWith("/savant/")) {
    const savantPath = url.pathname.replace(/^\/savant/, "");
    return `https://baseballsavant.mlb.com${savantPath}${url.search}`;
  }

  return null;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };
}
