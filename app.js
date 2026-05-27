(function () {
  let currentGamePk = null;
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

  async function guarded(action) {
    clearError();
    try { await action(); }
    catch (error) {
      showError(error.message || String(error));
      console.error(error);
    }
  }

  async function loadGames() {
    const data = await window.MLBApi.getSchedule($("dateInput").value, $("teamInput").value);
    renderGames(data.dates?.[0]?.games || []);
    setLastUpdated();
  }

  function renderGames(games) {
    const container = $("gamesList");
    if (!games.length) {
      container.innerHTML = "No MLB games found for that date/filter.";
      return;
    }

    container.innerHTML = games.map(game => {
      const away = game.teams.away.team.name;
      const home = game.teams.home.team.name;
      const state = game.status.detailedState;
      const hasScore = Number.isFinite(game.teams.away.score);
      const score = hasScore ? `${game.teams.away.score} - ${game.teams.home.score}` : "Not started";
      const start = game.gameDate ? new Date(game.gameDate).toLocaleString() : "";
      return `
        <div class="game-card">
          <div>
            <strong>${escapeHtml(away)} at ${escapeHtml(home)}</strong>
            <div class="muted">${escapeHtml(start)}</div>
            <div><span class="pill">${escapeHtml(state)}</span> ${escapeHtml(score)}</div>
          </div>
          <button data-gamepk="${game.gamePk}" class="open-game-btn">Open</button>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".open-game-btn").forEach(button => {
      button.addEventListener("click", () => guarded(() => loadGame(button.dataset.gamepk)));
    });
  }

  async function loadGame(gamePk) {
    currentGamePk = gamePk;
    const data = await window.MLBApi.getLiveFeed(gamePk);
    renderGame(data);
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
    const away = gameData.teams.away;
    const home = gameData.teams.home;
    const linescore = live.linescore;
    const plays = live.plays?.allPlays || [];

    $("gamePanel").hidden = false;
    $("scorecardPanel").hidden = false;
    $("pitchingPanel").hidden = false;
    $("playPanel").hidden = false;

    $("gameTitle").textContent = `${away.name} at ${home.name}`;
    $("gameStatus").textContent = gameData.status.detailedState;
    $("gameMeta").textContent = `${gameData.venue?.name || ""} | ${gameData.datetime?.officialDate || ""}`;

    $("lineScore").innerHTML = renderLineScore(linescore, away.name, home.name);
    $("situation").innerHTML = renderSituation(linescore, live.plays?.currentPlay);

    const scorecards = window.ScorecardEngine.buildScorecards(data);
    $("awayTitle").textContent = `${away.name} Scorecard`;
    $("homeTitle").textContent = `${home.name} Scorecard`;
    $("awayScorecard").innerHTML = renderScorecard(scorecards.away);
    $("homeScorecard").innerHTML = renderScorecard(scorecards.home);
    $("pitchingLines").innerHTML = renderPitchingLines(window.ScorecardEngine.getPitchingLines(data));

    const visiblePlays = showFullLog ? plays : plays.slice(Math.max(0, plays.length - window.MLB_SCORECARD_CONFIG.DEFAULT_RECENT_PLAYS));
    $("playLog").innerHTML = renderPlayLog(visiblePlays);
  }

  function renderLineScore(linescore, awayName, homeName) {
    const innings = linescore.innings || [];
    const maxInnings = Math.max(9, innings.length);
    const headers = Array.from({ length: maxInnings }, (_, i) => `<th class="center">${i + 1}</th>`).join("");
    const awayCells = Array.from({ length: maxInnings }, (_, i) => `<td class="center">${innings[i]?.away?.runs ?? ""}</td>`).join("");
    const homeCells = Array.from({ length: maxInnings }, (_, i) => `<td class="center">${innings[i]?.home?.runs ?? ""}</td>`).join("");

    return `
      <table>
        <thead><tr><th>Team</th>${headers}<th class="center">R</th><th class="center">H</th><th class="center">E</th></tr></thead>
        <tbody>
          <tr><th>${escapeHtml(awayName)}</th>${awayCells}<td class="center">${linescore.teams.away.runs ?? 0}</td><td class="center">${linescore.teams.away.hits ?? 0}</td><td class="center">${linescore.teams.away.errors ?? 0}</td></tr>
          <tr><th>${escapeHtml(homeName)}</th>${homeCells}<td class="center">${linescore.teams.home.runs ?? 0}</td><td class="center">${linescore.teams.home.hits ?? 0}</td><td class="center">${linescore.teams.home.errors ?? 0}</td></tr>
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
    $("findGamesBtn").addEventListener("click", () => guarded(loadGames));
    $("refreshBtn").addEventListener("click", () => guarded(refreshGame));
    $("printBtn").addEventListener("click", () => window.print());
    $("toggleFullLogBtn").addEventListener("click", () => {
      showFullLog = !showFullLog;
      $("toggleFullLogBtn").textContent = showFullLog ? "Show Recent Plays" : "Show Full Log";
      if (currentGamePk) guarded(refreshGame);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
