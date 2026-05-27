(function () {
  function getApiBase() {
    const apiInput = document.getElementById("apiInput");
    const configured = apiInput?.value || window.MLB_SCORECARD_CONFIG.API_BASE;
    return configured.replace(/\/$/, "");
  }

  async function fetchJson(path) {
    const url = `${getApiBase()}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`API error ${response.status} from ${url}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(`Expected JSON from ${url}, but received: ${text.slice(0, 180)}`);
    }

    return response.json();
  }

  async function getSchedule(date, teamId) {
    let path = `/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}&hydrate=team,linescore,probablePitcher`;
    if (teamId) path += `&teamId=${encodeURIComponent(teamId)}`;
    return fetchJson(path);
  }

  async function getLiveFeed(gamePk) {
    return fetchJson(`/api/v1.1/game/${gamePk}/feed/live`);
  }

  window.MLBApi = { getApiBase, fetchJson, getSchedule, getLiveFeed };
})();
