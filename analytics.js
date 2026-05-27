(function () {
  function parseCsv(csv) {
    const text = String(csv || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i++;
        row.push(cell);
        if (row.some(value => value !== "")) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }

    if (!rows.length) return [];
    const headers = rows.shift().map(header => header.trim());
    return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function average(values) {
    const clean = values.filter(value => Number.isFinite(value));
    if (!clean.length) return null;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
  }

  function percentage(value) {
    return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a";
  }

  function decimal(value, digits = 3) {
    return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
  }

  function scoreMetric(value, low, high) {
    if (!Number.isFinite(value)) return 0.5;
    return Math.max(0, Math.min(1, (value - low) / (high - low)));
  }

  function summarizeSavant(csv, label) {
    const rows = parseCsv(csv);
    const events = rows.filter(row => row.events);
    const battedBalls = events.filter(row => number(row.launch_speed) !== null);
    const xwobas = events.map(row => number(row.estimated_woba_using_speedangle)).filter(value => Number.isFinite(value));
    const exitVelos = battedBalls.map(row => number(row.launch_speed));
    const launchAngles = battedBalls.map(row => number(row.launch_angle));
    const barrels = battedBalls.filter(row => number(row.launch_speed_angle) === 6).length;
    const hardHits = battedBalls.filter(row => number(row.launch_speed) >= 95).length;
    const sweetSpot = battedBalls.filter(row => {
      const angle = number(row.launch_angle);
      return angle !== null && angle >= 8 && angle <= 32;
    }).length;
    const hits = events.filter(row => ["single", "double", "triple", "home_run"].includes(row.events)).length;
    const homers = events.filter(row => row.events === "home_run").length;
    const strikeouts = events.filter(row => row.events === "strikeout").length;
    const walks = events.filter(row => row.events === "walk").length;
    const atBats = events.filter(row => !["walk", "hit_by_pitch", "sac_fly", "sac_bunt", "catcher_interf"].includes(row.events)).length;
    const pa = new Set(rows.map(row => `${row.game_pk}-${row.at_bat_number}`).filter(Boolean)).size || events.length;
    const avgExitVelocity = average(exitVelos);
    const avgLaunchAngle = average(launchAngles);
    const xwoba = average(xwobas);
    const hardHitRate = battedBalls.length ? hardHits / battedBalls.length : null;
    const barrelRate = battedBalls.length ? barrels / battedBalls.length : null;
    const sweetSpotRate = battedBalls.length ? sweetSpot / battedBalls.length : null;
    const battingAverage = atBats ? hits / atBats : null;
    const strikeoutRate = pa ? strikeouts / pa : null;
    const walkRate = pa ? walks / pa : null;
    const powerIndex = scoreMetric(xwoba, 0.285, 0.385) * 0.45
      + scoreMetric(hardHitRate, 0.28, 0.48) * 0.35
      + scoreMetric(barrelRate, 0.04, 0.13) * 0.20;

    return {
      label,
      rows,
      pa,
      battedBalls: battedBalls.length,
      avgExitVelocity,
      avgLaunchAngle,
      xwoba,
      hardHitRate,
      barrelRate,
      sweetSpotRate,
      battingAverage,
      strikeoutRate,
      walkRate,
      homers,
      powerIndex
    };
  }

  function getLiveContact(data) {
    const plays = data.liveData?.plays?.allPlays || [];
    const batted = plays.map(play => ({
      side: play.about?.isTopInning ? "away" : "home",
      event: play.result?.event || "",
      exitVelocity: number(play.hitData?.launchSpeed),
      launchAngle: number(play.hitData?.launchAngle),
      distance: number(play.hitData?.totalDistance)
    })).filter(item => item.exitVelocity !== null || item.launchAngle !== null);

    const summarize = side => {
      const sideRows = batted.filter(item => item.side === side);
      const hardHits = sideRows.filter(item => item.exitVelocity >= 95).length;
      return {
        battedBalls: sideRows.length,
        hardHits,
        hardHitRate: sideRows.length ? hardHits / sideRows.length : null,
        avgExitVelocity: average(sideRows.map(item => item.exitVelocity)),
        avgLaunchAngle: average(sideRows.map(item => item.launchAngle))
      };
    };

    return { away: summarize("away"), home: summarize("home") };
  }

  function buildProjection(data, awayTrend, homeTrend) {
    const linescore = data.liveData?.linescore || {};
    const awayRuns = linescore.teams?.away?.runs ?? 0;
    const homeRuns = linescore.teams?.home?.runs ?? 0;
    const awayHits = linescore.teams?.away?.hits ?? 0;
    const homeHits = linescore.teams?.home?.hits ?? 0;
    const inning = Number(linescore.currentInning || 1);
    const inningsLeft = Math.max(0, 9 - inning);
    const awayTrendScore = awayTrend?.powerIndex ?? 0.5;
    const homeTrendScore = homeTrend?.powerIndex ?? 0.5;
    const runDiff = awayRuns - homeRuns;
    const hitDiff = awayHits - homeHits;
    const trendDiff = awayTrendScore - homeTrendScore;
    const awayWin = Math.max(0.05, Math.min(0.95, 0.5 + runDiff * 0.10 + hitDiff * 0.015 + trendDiff * 0.20));
    const awayRemaining = inningsLeft * (0.38 + awayTrendScore * 0.25);
    const homeRemaining = inningsLeft * (0.40 + homeTrendScore * 0.25);

    return {
      awayWin,
      homeWin: 1 - awayWin,
      awayProjectedRuns: awayRuns + awayRemaining,
      homeProjectedRuns: homeRuns + homeRemaining,
      lean: awayWin >= 0.54 ? "away" : awayWin <= 0.46 ? "home" : "coin flip",
      confidence: Math.abs(awayWin - 0.5) < 0.08 ? "low" : Math.abs(awayWin - 0.5) < 0.18 ? "medium" : "high"
    };
  }

  window.AnalyticsEngine = {
    parseCsv,
    summarizeSavant,
    getLiveContact,
    buildProjection,
    percentage,
    decimal
  };
})();
