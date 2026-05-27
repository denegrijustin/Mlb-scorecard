(function () {
  function getApiBase() {
    const apiInput = document.getElementById("apiInput");
    const configured = apiInput?.value || window.MLB_SCORECARD_CONFIG.API_BASE;
    return configured.replace(/\/$/, "");
  }

  function toMlbScheduleDate(date) {
    const value = String(date || "").trim();
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
    }
    return value;
  }

  async function fetchJson(path) {
    const url = `${getApiBase()}${path}`;
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
    } catch (error) {
      throw new Error(`Could not reach the MLB API proxy at ${getApiBase()}. Check the API URL and your connection.`);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`MLB API proxy returned ${response.status} for ${path}. ${detail.slice(0, 140)}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(`The MLB API proxy did not return JSON for ${path}. Received: ${text.slice(0, 180)}`);
    }

    return response.json();
  }

  async function fetchText(path) {
    const url = `${getApiBase()}${path}`;
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "text/csv,text/plain,*/*" }
      });
    } catch (error) {
      throw new Error(`Could not reach the data proxy at ${getApiBase()}. Check the API URL and your connection.`);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Data proxy returned ${response.status} for ${path}. ${detail.slice(0, 140)}`);
    }

    return response.text();
  }

  async function getSchedule(date, teamId) {
    const scheduleDate = toMlbScheduleDate(date);
    let path = `/api/v1/schedule?sportId=1&date=${encodeURIComponent(scheduleDate)}&hydrate=team,linescore,probablePitcher`;
    if (teamId) path += `&teamId=${encodeURIComponent(teamId)}`;
    return fetchJson(path);
  }

  async function checkStatus() {
    const data = await fetchJson("/api/v1/teams?sportId=1");
    return Array.isArray(data.teams) && data.teams.length > 0;
  }

  async function getLiveFeed(gamePk) {
    return fetchJson(`/api/v1.1/game/${gamePk}/feed/live`);
  }

  async function getSavantTeamCsv(teamAbbr, startDate, endDate, playerType = "batter") {
    const params = new URLSearchParams({
      all: "true",
      hfGT: "R|PO|S|",
      game_date_gt: startDate,
      game_date_lt: endDate,
      team: teamAbbr,
      player_type: playerType,
      type: "details",
      min_pitches: "0",
      min_results: "0"
    });
    return fetchText(`/savant/statcast_search/csv?${params.toString()}`);
  }

  window.MLBApi = {
    getApiBase,
    fetchJson,
    fetchText,
    toMlbScheduleDate,
    getSchedule,
    checkStatus,
    getLiveFeed,
    getSavantTeamCsv
  };
})();
