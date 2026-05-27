(function () {
  function safe(value, fallback = "") {
    return value === undefined || value === null ? fallback : value;
  }

  function makeNotation(play) {
    const event = play.result?.event || "";
    const desc = play.result?.description || "";
    const rbi = play.result?.rbi ? `, ${play.result.rbi} RBI` : "";

    const eventMap = {
      "Strikeout": "K",
      "Strikeout Double Play": "K-DP",
      "Walk": "BB",
      "Intent Walk": "IBB",
      "Hit By Pitch": "HBP",
      "Single": "1B",
      "Double": "2B",
      "Triple": "3B",
      "Home Run": "HR",
      "Groundout": "GO",
      "Flyout": "FO",
      "Lineout": "LO",
      "Pop Out": "PO",
      "Forceout": "FC",
      "Field Error": "E",
      "Fielders Choice": "FC",
      "Fielders Choice Out": "FC",
      "Grounded Into DP": "GIDP",
      "Double Play": "DP",
      "Sac Fly": "SF",
      "Sac Bunt": "SAC",
      "Catcher Interference": "CI",
      "Runner Out": "RO"
    };

    return {
      primary: `${eventMap[event] || event || "Desc"}${rbi}`,
      description: desc
    };
  }

  function isScorecardPlateAppearance(play) {
    const event = play.result?.event || "";
    return ![
      "Pitching Substitution",
      "Defensive Switch",
      "Defensive Substitution",
      "Offensive Substitution",
      "Mound Visit",
      "Game Advisory"
    ].includes(event);
  }

  function collectBatters(boxTeam) {
    const batterIds = boxTeam.batters || [];
    return batterIds.slice(0, 15).map((id, index) => {
      const player = boxTeam.players?.[`ID${id}`];
      const batting = player?.stats?.batting || {};
      return {
        slot: index + 1,
        id,
        name: player?.person?.fullName || `ID${id}`,
        pos: player?.position?.abbreviation || "",
        innings: Array.from({ length: 12 }, () => []),
        r: safe(batting.runs, 0),
        h: safe(batting.hits, 0),
        rbi: safe(batting.rbi, 0),
        bb: safe(batting.baseOnBalls, 0),
        k: safe(batting.strikeOuts, 0)
      };
    });
  }

  function buildScorecards(data) {
    const box = data.liveData?.boxscore?.teams;
    const plays = data.liveData?.plays?.allPlays || [];
    if (!box) return { away: [], home: [] };

    const awayRows = collectBatters(box.away);
    const homeRows = collectBatters(box.home);

    const findRow = (side, batterId) => {
      const rows = side === "away" ? awayRows : homeRows;
      return rows.find(row => row.id === batterId);
    };

    for (const play of plays) {
      if (!play.about || !play.matchup) continue;
      if (!isScorecardPlateAppearance(play)) continue;
      const inningIndex = (play.about.inning || 1) - 1;
      if (inningIndex < 0 || inningIndex >= 12) continue;

      const side = play.about.isTopInning ? "away" : "home";
      const batterId = play.matchup.batter?.id;
      const row = findRow(side, batterId);
      if (!row) continue;

      row.innings[inningIndex].push(makeNotation(play));
    }

    return { away: awayRows, home: homeRows };
  }

  function getPitchingLines(data) {
    const teams = data.liveData?.boxscore?.teams;
    if (!teams) return [];
    const rows = [];

    for (const side of ["away", "home"]) {
      const teamName = data.gameData?.teams?.[side]?.name || side;
      const pitcherIds = teams[side].pitchers || [];

      for (const id of pitcherIds) {
        const player = teams[side].players?.[`ID${id}`];
        const pitching = player?.stats?.pitching || {};
        rows.push({
          team: teamName,
          pitcher: player?.person?.fullName || `ID${id}`,
          ip: safe(pitching.inningsPitched, ""),
          h: safe(pitching.hits, 0),
          r: safe(pitching.runs, 0),
          er: safe(pitching.earnedRuns, 0),
          bb: safe(pitching.baseOnBalls, 0),
          k: safe(pitching.strikeOuts, 0),
          hr: safe(pitching.homeRuns, 0),
          pitches: safe(pitching.numberOfPitches, "")
        });
      }
    }
    return rows;
  }

  function svgEscape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderOfficialSvg(data) {
    const gameData = data.gameData || {};
    const live = data.liveData || {};
    const awayName = gameData.teams?.away?.name || "Away";
    const homeName = gameData.teams?.home?.name || "Home";
    const venue = gameData.venue?.name || "";
    const date = gameData.datetime?.officialDate || "";
    const scorecards = buildScorecards(data);
    const linescore = live.linescore || {};
    const width = 1760;
    const sectionHeight = 700;
    const height = sectionHeight * 2 + 94;

    return `
      <svg class="official-scorecard" viewBox="0 0 ${width} ${height}" role="img" aria-label="${svgEscape(awayName)} at ${svgEscape(homeName)} official-style scorecard" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="#b8b0a3"/>
        ${renderTeamSheet(scorecards.away, awayName, homeName, "TOP", 0, linescore, "away")}
        ${renderTeamSheet(scorecards.home, homeName, awayName, "BOTTOM", sectionHeight, linescore, "home")}
        <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#111" stroke-width="3"/>
        <text x="${width - 18}" y="${height - 18}" text-anchor="end" font-family="Arial" font-size="18" fill="#123c55">Generated from MLB live feed and Baseball Savant-ready data</text>
        <text x="${width - 18}" y="${height - 42}" text-anchor="end" font-family="Arial" font-size="22" fill="#111">${svgEscape(venue)} ${svgEscape(date)}</text>
      </svg>
    `;
  }

  function renderTeamSheet(rows, battingTeam, opponent, halfLabel, yOffset, linescore, side) {
    const rowHeight = 58;
    const nameWidth = 250;
    const inningWidth = 102;
    const statWidth = 184;
    const headerHeight = 48;
    const tableTop = yOffset + headerHeight;
    const innings = Array.from({ length: 9 }, (_, index) => index + 1);
    const teamTotals = linescore.teams?.[side] || {};
    let svg = "";

    svg += `<rect x="0" y="${yOffset}" width="1760" height="700" fill="#fefcf6" stroke="#111" stroke-width="2"/>`;
    svg += `<rect x="0" y="${yOffset}" width="${nameWidth}" height="${headerHeight}" fill="#eee6d8" stroke="#111"/>`;
    svg += `<text x="${nameWidth / 2}" y="${yOffset + 31}" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700">Batter</text>`;
    innings.forEach((inning, index) => {
      const x = nameWidth + index * inningWidth;
      svg += `<rect x="${x}" y="${yOffset}" width="${inningWidth}" height="${headerHeight}" fill="#eee6d8" stroke="#111"/>`;
      svg += `<text x="${x + inningWidth / 2}" y="${yOffset + 31}" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700">${inning}</text>`;
    });
    svg += `<rect x="${nameWidth + inningWidth * 9}" y="${yOffset}" width="${statWidth}" height="${headerHeight}" fill="#eee6d8" stroke="#111"/>`;
    svg += `<text x="${nameWidth + inningWidth * 9 + 12}" y="${yOffset + 30}" font-family="Arial" font-size="18" font-weight="700">AB  R  H  RBI  BB  K</text>`;

    rows.slice(0, 9).forEach((row, index) => {
      const y = tableTop + index * rowHeight;
      svg += `<rect x="0" y="${y}" width="${nameWidth}" height="${rowHeight}" fill="#fff" stroke="#111"/>`;
      svg += `<text x="12" y="${y + 23}" font-family="Arial" font-size="18" fill="#063c75">${svgEscape(row.name)}</text>`;
      svg += `<text x="12" y="${y + 44}" font-family="Arial" font-size="14" fill="#444">${svgEscape(row.pos)}  Slot ${row.slot}</text>`;

      row.innings.slice(0, 9).forEach((cell, inningIndex) => {
        const x = nameWidth + inningIndex * inningWidth;
        const primary = cell.map(item => item.primary).join(" / ");
        svg += `<rect x="${x}" y="${y}" width="${inningWidth}" height="${rowHeight}" fill="#fff" stroke="#111"/>`;
        svg += `<text x="${x + inningWidth / 2}" y="${y + 34}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700">${svgEscape(primary)}</text>`;
      });

      const statX = nameWidth + inningWidth * 9;
      svg += `<rect x="${statX}" y="${y}" width="${statWidth}" height="${rowHeight}" fill="#fff" stroke="#111"/>`;
      svg += `<text x="${statX + 12}" y="${y + 34}" font-family="Arial" font-size="18">${row.r + row.h + row.bb + row.k === 0 ? "" : `${row.r}   ${row.h}   ${row.rbi}    ${row.bb}   ${row.k}`}</text>`;
    });

    const sideX = nameWidth + inningWidth * 9 + statWidth;
    svg += `<rect x="${sideX}" y="${yOffset}" width="408" height="628" fill="#fff" stroke="#111"/>`;
    svg += `<text x="${sideX + 204}" y="${yOffset + 52}" text-anchor="middle" font-family="Arial" font-size="36" font-weight="800">${halfLabel}</text>`;
    svg += `<text x="${sideX + 204}" y="${yOffset + 126}" text-anchor="middle" font-family="Arial" font-size="30" font-weight="800">${svgEscape(battingTeam)}</text>`;
    svg += `<text x="${sideX + 204}" y="${yOffset + 164}" text-anchor="middle" font-family="Arial" font-size="22">vs ${svgEscape(opponent)}</text>`;
    svg += `<text x="${sideX + 72}" y="${yOffset + 245}" font-family="Arial" font-size="28" font-weight="800">R</text><text x="${sideX + 210}" y="${yOffset + 245}" font-family="Arial" font-size="28">${teamTotals.runs ?? 0}</text>`;
    svg += `<text x="${sideX + 72}" y="${yOffset + 300}" font-family="Arial" font-size="28" font-weight="800">H</text><text x="${sideX + 210}" y="${yOffset + 300}" font-family="Arial" font-size="28">${teamTotals.hits ?? 0}</text>`;
    svg += `<text x="${sideX + 72}" y="${yOffset + 355}" font-family="Arial" font-size="28" font-weight="800">E</text><text x="${sideX + 210}" y="${yOffset + 355}" font-family="Arial" font-size="28">${teamTotals.errors ?? 0}</text>`;
    svg += `<text x="${sideX + 72}" y="${yOffset + 430}" font-family="Arial" font-size="20" fill="#555">Official-style generated sheet</text>`;
    return svg;
  }

  window.ScorecardEngine = { buildScorecards, makeNotation, getPitchingLines, renderOfficialSvg };
})();
