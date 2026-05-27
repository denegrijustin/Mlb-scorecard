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

  window.ScorecardEngine = { buildScorecards, makeNotation, getPitchingLines };
})();
