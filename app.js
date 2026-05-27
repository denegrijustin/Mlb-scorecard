(function () {
  let currentGamePk = null;
  let currentGameData = null;
  let currentTrends = null;
  let showFullLog = false;
  const $ = id => document.getElementById(id);

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function showError(message) {
    const box = $("errorBox");
    box.hidden = false;
    box.innerHTML = `<strong>Error:</strong> ${escapeHtml(message)}`;
  }

  function clearError() {
    const box = $("errorBox");
    box.hidden = true;
    box.innerHTML = "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setLastUpdated() {
    $("lastUpdated").textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  }

  function setApiStatus(status, message) {
    const statusEl = $("apiStatus");
    statusEl.className = `api-status ${status}`;
    $("apiStatusText").textContent = message;
  }

  async function guarded(action) {
    clearError();
    try { await action(); }
    catch (error) {
      showError(error.message || String(error));
      console.error(error);
    }
  }

  async function loadGames() {
    const date = $("dateInput").value;
    if (!date) throw new Error("Choose a game date before searching.");

    const data = await window.MLBApi.getSchedule(date, $("teamInput").value);
    renderGames(data.dates?.[0]?.games || []);
    setLastUpdated();
  }

  function renderGames(games) {
    const container = $("gamesList");
    if (!games.length) {
      container.innerHTML = `<div class="empty-state">No MLB games found for that date and team filter.</div>`;
      return;
    }

    container.innerHTML = games.map(game => {
      const away = game.teams.away.team.name;
      const home = game.teams.home.team.name;
      const state = game.status.detailedState;
      const hasScore = Number.isFinite(game.teams.away.score);
      const score = hasScore ? `${game.teams.away.score} - ${game.teams.home.score}` : "Not started";
      const start = game.gameDate ? new Date(game.gameDate).toLocaleString() : "";
      const venue = game.venue?.name || "";
      return `
        <div class="game-card">
          <div class="game-card-main">
            <div class="matchup">
              <span>${escapeHtml(away)}</span>
              <strong>${escapeHtml(score)}</strong>
              <span>${escapeHtml(home)}</span>
            </div>
            <div class="game-details">${escapeHtml(start)}${venue ? ` · ${escapeHtml(venue)}` : ""}</div>
          </div>
          <div class="game-actions">
            <span class="pill">${escapeHtml(state)}</span>
            <button data-gamepk="${game.gamePk}" class="open-game-btn">Open</button>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".open-game-btn").forEach(button => {
      button.addEventListener("click", () => guarded(() => loadGame(button.dataset.gamepk)));
    });
  }

  async function loadGame(gamePk) {
    currentGamePk = gamePk;
    currentTrends = null;
    const data = await window.MLBApi.getLiveFeed(gamePk);
    renderGame(data);
    loadSavantTrends().catch(error => {
      $("trendDashboard").innerHTML = `<div class="empty-state">Baseball Savant trends are unavailable right now: ${escapeHtml(error.message || error)}</div>`;
      console.warn(error);
    });
    setLastUpdated();
  }

  async function refreshGame() {
    if (!currentGamePk) {
      showError("Open a game first.");
      return;
    }
    await loadGame(currentGamePk);
  }

  function renderGame(data) {
    const gameData = data.gameData;
    const live = data.liveData;
    if (!gameData || !live) {
      throw new Error("The live feed did not include game data. Try another game or refresh in a moment.");
    }
    const away = gameData.teams.away;
    const home = gameData.teams.home;
    const linescore = live.linescore || {};
    const plays = live.plays?.allPlays || [];
    currentGameData = data;

    $("gamePanel").hidden = false;
    $("dashboardPanel").hidden = false;
    $("scorecardPanel").hidden = false;
    $("pitchingPanel").hidden = false;
    $("playPanel").hidden = false;

    $("gameTitle").textContent = `${away.name} at ${home.name}`;
    $("gameStatus").textContent = gameData.status.detailedState;
    $("gameMeta").textContent = `${gameData.venue?.name || ""} | ${gameData.datetime?.officialDate || ""}`;

    $("lineScore").innerHTML = renderLineScore(linescore, away.name, home.name);
    $("situation").innerHTML = renderSituation(linescore, live.plays?.currentPlay);
    $("officialScorecard").innerHTML = window.ScorecardEngine.renderOfficialSvg(data);
    renderDashboard(data, currentTrends);

    const scorecards = window.ScorecardEngine.buildScorecards(data);
    $("awayTitle").textContent = `${away.name} Scorecard`;
    $("homeTitle").textContent = `${home.name} Scorecard`;
    $("awayScorecard").innerHTML = renderScorecard(scorecards.away);
    $("homeScorecard").innerHTML = renderScorecard(scorecards.home);
    $("pitchingLines").innerHTML = renderPitchingLines(window.ScorecardEngine.getPitchingLines(data));

    const visiblePlays = showFullLog ? plays : plays.slice(Math.max(0, plays.length - window.MLB_SCORECARD_CONFIG.DEFAULT_RECENT_PLAYS));
    $("playLog").innerHTML = renderPlayLog(visiblePlays);
  }

  async function loadSavantTrends() {
    if (!currentGameData) {
      showError("Open a game before loading trends.");
      return;
    }

    const away = currentGameData.gameData.teams.away;
    const home = currentGameData.gameData.teams.home;
    const awayAbbr = teamAbbr(away.id);
    const homeAbbr = teamAbbr(home.id);
    if (!awayAbbr || !homeAbbr) {
      throw new Error("Could not map one of these MLB teams to a Baseball Savant abbreviation.");
    }
    const endDate = $("dateInput").value || currentGameData.gameData.datetime?.officialDate || todayIso();
    const startDate = addDays(endDate, -window.MLB_SCORECARD_CONFIG.SAVANT_LOOKBACK_DAYS);

    $("trendDashboard").innerHTML = `<div class="empty-state">Loading Baseball Savant trends for ${escapeHtml(awayAbbr)} and ${escapeHtml(homeAbbr)}...</div>`;

    const [awayCsv, homeCsv] = await Promise.all([
      window.MLBApi.getSavantTeamCsv(awayAbbr, startDate, endDate, "batter"),
      window.MLBApi.getSavantTeamCsv(homeAbbr, startDate, endDate, "batter")
    ]);

    currentTrends = {
      startDate,
      endDate,
      away: window.AnalyticsEngine.summarizeSavant(awayCsv, away.name),
      home: window.AnalyticsEngine.summarizeSavant(homeCsv, home.name)
    };
    renderDashboard(currentGameData, currentTrends);
  }

  function teamAbbr(teamId) {
    return window.MLB_SCORECARD_CONFIG.TEAM_ABBR_BY_ID[String(teamId)] || "";
  }

  function addDays(isoDate, days) {
    const date = new Date(`${isoDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function renderDashboard(data, trends) {
    const away = data.gameData.teams.away;
    const home = data.gameData.teams.home;
    const liveContact = window.AnalyticsEngine.getLiveContact(data);
    const projection = window.AnalyticsEngine.buildProjection(data, trends?.away, trends?.home);
    const leanName = projection.lean === "away" ? away.name : projection.lean === "home" ? home.name : "No clear lean";

    $("predictionSummary").innerHTML = `
      <div class="insight-card">
        <span class="label">Projection</span>
        <strong>${escapeHtml(leanName)}</strong>
        <span>${escapeHtml(projection.confidence)} confidence</span>
      </div>
      <div class="insight-card">
        <span class="label">${escapeHtml(away.name)} Win Lean</span>
        <strong>${window.AnalyticsEngine.percentage(projection.awayWin)}</strong>
        <span>transparent heuristic, not a betting line</span>
      </div>
      <div class="insight-card">
        <span class="label">Projected Final</span>
        <strong>${Math.round(projection.awayProjectedRuns)} - ${Math.round(projection.homeProjectedRuns)}</strong>
        <span>${escapeHtml(away.name)} at ${escapeHtml(home.name)}</span>
      </div>
    `;

    $("trendDashboard").innerHTML = `
      ${renderTrendCards(away.name, home.name, trends)}
      <div class="trend-card">
        <h4>Live Contact Quality</h4>
        <div class="metric-row"><span>${escapeHtml(away.name)} hard-hit rate</span><strong>${window.AnalyticsEngine.percentage(liveContact.away.hardHitRate)}</strong></div>
        <div class="metric-row"><span>${escapeHtml(home.name)} hard-hit rate</span><strong>${window.AnalyticsEngine.percentage(liveContact.home.hardHitRate)}</strong></div>
        <div class="metric-row"><span>${escapeHtml(away.name)} avg EV</span><strong>${window.AnalyticsEngine.decimal(liveContact.away.avgExitVelocity, 1)} mph</strong></div>
        <div class="metric-row"><span>${escapeHtml(home.name)} avg EV</span><strong>${window.AnalyticsEngine.decimal(liveContact.home.avgExitVelocity, 1)} mph</strong></div>
      </div>
      <div class="trend-card">
        <h4>Model Inputs</h4>
        <p class="muted">Projection blends current score, hit differential, inning context, and Baseball Savant recent contact quality when available.</p>
      </div>
    `;
  }

  function renderTrendCards(awayName, homeName, trends) {
    if (!trends) {
      return `
        <div class="trend-card">
          <h4>Baseball Savant Trends</h4>
          <p class="muted">Open a game to load recent Statcast contact quality through the Worker proxy.</p>
        </div>
      `;
    }

    return [trends.away, trends.home].map(team => `
      <div class="trend-card">
        <h4>${escapeHtml(team.label)}</h4>
        <div class="metric-row"><span>Recent PA</span><strong>${team.pa}</strong></div>
        <div class="metric-row"><span>xwOBA on contact</span><strong>${window.AnalyticsEngine.decimal(team.xwoba)}</strong></div>
        <div class="metric-row"><span>Hard-hit rate</span><strong>${window.AnalyticsEngine.percentage(team.hardHitRate)}</strong></div>
        <div class="metric-row"><span>Barrel rate</span><strong>${window.AnalyticsEngine.percentage(team.barrelRate)}</strong></div>
        <div class="metric-row"><span>Avg exit velocity</span><strong>${window.AnalyticsEngine.decimal(team.avgExitVelocity, 1)} mph</strong></div>
        <div class="metric-row"><span>HR in window</span><strong>${team.homers}</strong></div>
      </div>
    `).join("");
  }

  function renderLineScore(linescore, awayName, homeName) {
    const innings = linescore.innings || [];
    const maxInnings = Math.max(9, innings.length);
    const headers = Array.from({ length: maxInnings }, (_, i) => `<th class="center">${i + 1}</th>`).join("");
    const awayCells = Array.from({ length: maxInnings }, (_, i) => `<td class="center">${innings[i]?.away?.runs ?? ""}</td>`).join("");
    const homeCells = Array.from({ length: maxInnings }, (_, i) => `<td class="center">${innings[i]?.home?.runs ?? ""}</td>`).join("");
    const totals = linescore.teams || { away: {}, home: {} };

    return `
      <table>
        <thead><tr><th>Team</th>${headers}<th class="center">R</th><th class="center">H</th><th class="center">E</th></tr></thead>
        <tbody>
          <tr><th>${escapeHtml(awayName)}</th>${awayCells}<td class="center total">${totals.away.runs ?? 0}</td><td class="center total">${totals.away.hits ?? 0}</td><td class="center total">${totals.away.errors ?? 0}</td></tr>
          <tr><th>${escapeHtml(homeName)}</th>${homeCells}<td class="center total">${totals.home.runs ?? 0}</td><td class="center total">${totals.home.hits ?? 0}</td><td class="center total">${totals.home.errors ?? 0}</td></tr>
        </tbody>
      </table>
    `;
  }

  function renderSituation(linescore, currentPlay) {
    const offense = linescore.offense || {};
    const defense = linescore.defense || {};
    const boxes = [
      ["Inning", `${linescore.inningHalf || ""} ${linescore.currentInningOrdinal || ""}`],
      ["Outs", linescore.outs ?? ""],
      ["Batter", currentPlay?.matchup?.batter?.fullName || offense.batter?.fullName || ""],
      ["Pitcher", currentPlay?.matchup?.pitcher?.fullName || defense.pitcher?.fullName || ""],
      ["On First", offense.first?.fullName || ""],
      ["On Second", offense.second?.fullName || ""],
      ["On Third", offense.third?.fullName || ""]
    ];

    return boxes.map(([label, value]) => `
      <div class="situation-box"><span class="label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
    `).join("");
  }

  function renderScorecard(rows) {
    if (!rows.length) return `<div class="empty-state">No batting data is available yet.</div>`;
    const inningHeaders = Array.from({ length: 12 }, (_, i) => `<th class="center">${i + 1}</th>`).join("");
    return `
      <table>
        <thead><tr><th>Slot</th><th>Player</th><th>Pos</th>${inningHeaders}<th class="center">R</th><th class="center">H</th><th class="center">RBI</th><th class="center">BB</th><th class="center">K</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td class="center">${row.slot}</td><td>${escapeHtml(row.name)}</td><td class="center">${escapeHtml(row.pos)}</td>
              ${row.innings.map(cell => `<td class="scorecell">${cell.map(item => `<strong>${escapeHtml(item.primary)}</strong><span class="play-desc">${escapeHtml(item.description)}</span>`).join("<hr>")}</td>`).join("")}
              <td class="center">${row.r}</td><td class="center">${row.h}</td><td class="center">${row.rbi}</td><td class="center">${row.bb}</td><td class="center">${row.k}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderPitchingLines(rows) {
    if (!rows.length) return `<div class="empty-state">No pitching data is available yet.</div>`;
    return `
      <table>
        <thead><tr><th>Team</th><th>Pitcher</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>K</th><th>HR</th><th>Pitches</th></tr></thead>
        <tbody>
          ${rows.map(row => `<tr><td>${escapeHtml(row.team)}</td><td>${escapeHtml(row.pitcher)}</td><td>${escapeHtml(row.ip)}</td><td>${row.h}</td><td>${row.r}</td><td>${row.er}</td><td>${row.bb}</td><td>${row.k}</td><td>${row.hr}</td><td>${escapeHtml(row.pitches)}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  function renderPlayLog(plays) {
    if (!plays.length) return `<div class="empty-state">No play-by-play is available yet.</div>`;
    return `
      <table>
        <thead><tr><th>#</th><th>Inning</th><th>Batter</th><th>Pitcher</th><th>Event</th><th>Description</th><th>Score</th></tr></thead>
        <tbody>
          ${plays.map((play, index) => `
            <tr>
              <td>${index + 1}</td><td>${escapeHtml(play.about?.halfInning || "")} ${escapeHtml(play.about?.inning || "")}</td>
              <td>${escapeHtml(play.matchup?.batter?.fullName || "")}</td><td>${escapeHtml(play.matchup?.pitcher?.fullName || "")}</td>
              <td>${escapeHtml(play.result?.event || "")}</td><td>${escapeHtml(play.result?.description || "")}</td><td>${play.result?.awayScore ?? ""}-${play.result?.homeScore ?? ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function init() {
    $("apiInput").value = window.MLB_SCORECARD_CONFIG.API_BASE;
    $("dateInput").value = todayIso();
    $("teamInput").value = window.MLB_SCORECARD_CONFIG.DEFAULT_TEAM_ID;
    guarded(checkApiStatus);
    $("findGamesBtn").addEventListener("click", () => guarded(loadGames));
    $("refreshBtn").addEventListener("click", () => guarded(refreshGame));
    $("apiInput").addEventListener("change", () => guarded(checkApiStatus));
    $("printBtn").addEventListener("click", () => window.print());
    $("loadTrendsBtn").addEventListener("click", () => guarded(loadSavantTrends));
    $("toggleFullLogBtn").addEventListener("click", () => {
      showFullLog = !showFullLog;
      $("toggleFullLogBtn").textContent = showFullLog ? "Show Recent Plays" : "Show Full Log";
      if (currentGamePk) guarded(refreshGame);
    });
  }

  async function checkApiStatus() {
    setApiStatus("checking", "API Status: checking...");
    try {
      const connected = await window.MLBApi.checkStatus();
      if (!connected) throw new Error("The API proxy responded, but no MLB teams were returned.");
      setApiStatus("connected", `API Status: connected to ${window.MLBApi.getApiBase()}`);
    } catch (error) {
      setApiStatus("error", "API Status: not connected");
      throw error;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
