let appData = null;
let selectedMatchId = null;
let selectedTeamKey = null;
let predictionHistory = null;
let gamesView = "groups";
let simulationView = "qualified";
let simulationData = null;
let simulationLoading = false;
let simulationError = "";
let systemHealth = null;
let knockoutSimulationCache = null;
const DATA_REFRESH_MS = 1000 * 60 * 2;
const KNOCKOUT_SIMULATION_RUNS = 30000;
const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

const fallbackData = {
  source: "fallback",
  timeZone: DEFAULT_TIME_ZONE,
  updatedAt: new Date().toISOString(),
  teams: {
    portugal: {
      name: "Portugal",
      logo: "",
      fifaRank: 6,
      weight: 78.6,
      form: 1.4,
      lastMatch: "Dados locais temporários até o servidor carregar a API.",
    },
    congo: {
      name: "RD Congo",
      logo: "",
      fifaRank: 60,
      weight: 51.9,
      form: 0.5,
      lastMatch: "Dados locais temporários até o servidor carregar a API.",
    },
    england: {
      name: "Inglaterra",
      logo: "",
      fifaRank: 4,
      weight: 83.7,
      form: 2.2,
      lastMatch: "Dados locais temporários até o servidor carregar a API.",
    },
    croatia: {
      name: "Croácia",
      logo: "",
      fifaRank: 10,
      weight: 70.6,
      form: 0.2,
      lastMatch: "Dados locais temporários até o servidor carregar a API.",
    },
  },
  matches: [
    {
      id: 1,
      group: "Grupo K",
      day: "Hoje",
      time: "Finalizado",
      status: "FT",
      home: "portugal",
      away: "congo",
      actualScore: { home: 1, away: 1 },
      prediction: null,
    },
    {
      id: 2,
      group: "Grupo D",
      day: "Hoje",
      time: "Finalizado",
      status: "FT",
      home: "england",
      away: "croatia",
      actualScore: { home: 4, away: 2 },
      prediction: null,
    },
  ],
  groups: [],
};

const teamMark = (team) => {
  if (team?.flagCode) {
    return `<img class="team-logo flag-logo" src="https://flagcdn.com/w40/${team.flagCode}.png" alt="" />`;
  }

  if (team?.logo) {
    return `<img class="team-logo" src="${team.logo}" alt="" />`;
  }

  return `<span class="flag"></span>`;
};

const isFinished = (match) => ["FT", "AET", "PEN"].includes(match.status);
const isLive = (match) => ["LIVE", "1H", "2H", "HT", "ET", "P"].includes(match.status);

const scoreFor = (match) => {
  if (isLive(match) && match.actualScore) {
    return {
      home: match.actualScore.home,
      away: match.actualScore.away,
      label: "Placar ao vivo",
      chance: "Placar",
      kind: "live",
    };
  }

  if (isFinished(match) && match.actualScore) {
    return {
      home: match.actualScore.home,
      away: match.actualScore.away,
      label: "Final",
      chance: "Placar",
      kind: "real",
    };
  }

  return {
    home: match.prediction?.homeGoals ?? "-",
    away: match.prediction?.awayGoals ?? "-",
    label: "Premonição",
    chance: `${match.prediction?.favoriteChance ?? 0}%`,
    kind: "prediction",
  };
};

const setDataStatus = (message, kind = "neutral") => {
  const status = document.querySelector("#dataStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
};

const showScreen = (screenName) => {
  document.querySelectorAll("[data-screen]").forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === screenName);
  });

  document.querySelectorAll("[data-screen-target]").forEach((button) => {
    button.classList.toggle("active", button.dataset.screenTarget === screenName);
  });
};

const appTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;

const datePartsInTimeZone = (date, timeZone = appTimeZone()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
};

const calendarKey = (date, timeZone = appTimeZone()) => {
  const parts = datePartsInTimeZone(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const sameCalendarDay = (a, b, timeZone = appTimeZone()) => calendarKey(a, timeZone) === calendarKey(b, timeZone);

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const matchDate = (match) => (match?.timestamp ? new Date(match.timestamp * 1000) : null);

const matchDisplayDay = (match) => {
  const date = matchDate(match);
  if (!date) return match.day || "";

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const timeZone = appTimeZone();

  if (sameCalendarDay(date, today, timeZone)) return "Hoje";
  if (sameCalendarDay(date, tomorrow, timeZone)) return "Amanhã";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
    .format(date)
    .replace(".", "");
};

const matchDisplayTime = (match) => {
  if (isFinished(match)) return "Finalizado";
  if (isLive(match)) return "Ao vivo";

  const date = matchDate(match);
  if (!date) return match.time || "";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: appTimeZone(),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const currentTargetMatch = () => {
  const datedMatches = appData.matches.filter((match) => match.timestamp && isGroupStageMatch(match));
  if (!datedMatches.length) return appData.matches[0];

  const now = new Date();
  const timeZone = appTimeZone();
  const todayMatches = datedMatches.filter((match) => sameCalendarDay(new Date(match.timestamp * 1000), now, timeZone));
  const liveMatch = todayMatches.find(isLive);
  if (liveMatch) return liveMatch;

  const nextTodayMatch = todayMatches.find((match) => new Date(match.timestamp * 1000) >= now);
  if (nextTodayMatch) return nextTodayMatch;

  const lastTodayMatch = todayMatches[todayMatches.length - 1];
  if (lastTodayMatch) return lastTodayMatch;

  const nextMatch = datedMatches.find((match) => new Date(match.timestamp * 1000) >= now);

  return nextMatch || datedMatches[datedMatches.length - 1];
};

const scrollToCurrentMatch = () => {
  const currentMatch = document.querySelector('.match-card[data-current-match="true"]');
  if (currentMatch) {
    currentMatch.scrollIntoView({ behavior: "auto", block: "start" });
    return;
  }

  const currentGroup = document.querySelector('.day-group[data-current-day="true"]');
  if (!currentGroup) return;

  currentGroup.scrollIntoView({ behavior: "auto", block: "start" });
};

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: "auto" });
};

const endpointFor = (path) => {
  const base = window.location.protocol === "file:" ? "http://127.0.0.1:3000" : "";
  return `${base}${path}`;
};

const renderWeights = () => {
  const container = document.querySelector("#teamWeights");
  const teams = Object.entries(appData.teams)
    .filter(([, team]) => !team.placeholder)
    .map(([key, team]) => ({ key, ...team }))
    .sort((a, b) => b.weight - a.weight);

  const midpoint = Math.ceil(teams.length / 2);
  const columns = [teams.slice(0, midpoint), teams.slice(midpoint)];

  const rows = columns
    .map((column, columnIndex) => {
      const columnRows = column
        .map((team, index) => {
          const rank = columnIndex === 0 ? index + 1 : midpoint + index + 1;
          const selected = selectedTeamKey === team.key;
          return `
            <article class="weight-row${selected ? " selected" : ""}" data-team-key="${team.key}" role="button" tabindex="0">
              <div class="weight-rank">
                <span>${rank}</span>
                ${rankingMovement(team)}
              </div>
              <div class="weight-name">
                ${teamMark(team)}
                <strong>${team.name}</strong>
              </div>
              <span class="weight-value">${team.weight.toFixed(1)}</span>
              <div class="weight-meta">Ranking FIFA #${team.fifaRank} - base ${formatMetaNumber(team.strength?.base)} - amostra ${Math.round((team.strength?.sampleConfidence || 0) * 100)}% - contra base ${team.weightDelta > 0 ? "+" : ""}${Number(team.weightDelta || 0).toFixed(1)}</div>
            </article>
          `;
        })
        .join("");

      return `
        <div class="weight-column">${columnRows}</div>
      `;
    })
    .join("");

  container.innerHTML = `
    ${rows}
  `;

  document.querySelectorAll(".weight-row[data-team-key]").forEach((row) => {
    const selectTeam = () => {
      selectedTeamKey = row.dataset.teamKey;
      renderWeights();
      openTeamPlayersModal(appData.teams[selectedTeamKey]);
    };

    row.addEventListener("click", selectTeam);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectTeam();
      }
    });
  });
};

const teamPlayersContent = (team) => {
  if (!team) return "";
  const players = (team.players || []).filter((player) => Number(player.games || 0) > 0);

  if (!players.length) {
    return `
      <section class="team-player-panel">
        <header>
          <h3 id="teamPlayersTitle">Jogadores - ${team.name}</h3>
          <span>Sem estatísticas individuais suficientes ainda</span>
        </header>
        <p>Assim que a fonte devolver dados individuais dessa seleção, a média dos jogadores aparece aqui.</p>
      </section>
    `;
  }

  return `
    <section class="team-player-panel">
      <header>
        <h3 id="teamPlayersTitle">Jogadores - ${team.name}</h3>
        <span>Média por jogo e total acumulado</span>
      </header>
      <div class="player-score-list">
        ${players
          .map(
            (player, index) => `
              <article class="player-score-row">
                <strong>${index + 1}. ${player.name}</strong>
                <span>${player.games || 0} jogo${player.games === 1 ? "" : "s"}</span>
                <span>G ${player.goals || 0} / A ${player.assists || 0}</span>
                <span>Média ${Number(player.average || 0).toFixed(2)}</span>
                <span>Total ${Number(player.total || 0).toFixed(2)}</span>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
};

const openTeamPlayersModal = (team) => {
  const modal = document.querySelector("#teamPlayersModal");
  const content = document.querySelector("#teamPlayersContent");
  if (!modal || !content) return;

  content.innerHTML = teamPlayersContent(team);
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  modal.querySelector("[data-close-team-modal]")?.focus();
};

const closeTeamPlayersModal = () => {
  const modal = document.querySelector("#teamPlayersModal");
  if (!modal) return;

  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
};

const formatMetaNumber = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "-");

const rankingMovement = (team) => {
  const weightDelta = Number(team.weightDelta || 0);
  if (!team.previousPosition || team.positionDelta === 0) {
    return `<small class="rank-move same">=</small>`;
  }

  const direction = team.positionDelta > 0 ? "up" : "down";
  const signal = team.positionDelta > 0 ? "&uarr;" : "&darr;";
  const positionLabel =
    team.positionDelta > 0
      ? `subiu ${team.positionDelta}`
      : team.positionDelta < 0
        ? `caiu ${Math.abs(team.positionDelta)}`
        : "mesma posição";
  const weightLabel = weightDelta ? `peso ${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}` : "peso estável";
  const basisLabel = team.movementBasis === "base-ranking" ? "Base FIFA da Copa" : "Antes do último jogo";

  return `<small class="rank-move ${direction}" title="${basisLabel}: ${team.previousPosition}º lugar; ${weightLabel}"><span class="rank-arrow">${signal}</span><span class="rank-number">${Math.abs(team.positionDelta)}</span><span class="sr-detail">${positionLabel}; ${weightLabel}</span></small>`;
};

const renderGroups = () => {
  const container = document.querySelector("#groupsGrid");
  if (!container) return;

  const groups = appData.groups || [];
  if (!groups.length) {
    container.innerHTML = `
      <article class="details-card">
        <h3>Grupos indisponíveis</h3>
        <p>A fonte ainda não retornou jogos com identificação de grupo.</p>
      </article>
    `;
    return;
  }

  container.innerHTML = groups
    .map((group) => {
      const rows = group.teams
        .map((team) => `
          <tr>
            <td>
              <div class="team-cell">
                <span class="standing-position">${team.position}</span>
                ${teamMark(team)}
                <span>${team.name}</span>
              </div>
            </td>
            <td>${team.played}</td>
            <td>${team.wins}</td>
            <td>${team.draws}</td>
            <td>${team.losses}</td>
            <td>${team.goalsFor}</td>
            <td>${team.goalsAgainst}</td>
            <td>${team.goalDifference}</td>
            <td><strong>${team.points}</strong></td>
          </tr>
        `)
        .join("");

      return `
        <article class="group-card">
          <h3>${group.name}</h3>
          <table class="group-table">
            <thead>
              <tr>
                <th>Selecao</th>
                <th>J</th>
                <th>V</th>
                <th>E</th>
                <th>D</th>
                <th>GP</th>
                <th>GC</th>
                <th>SG</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </article>
      `;
    })
    .join("");
};

const percent = (value, total) => {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
};

const renderPredictionStats = () => {
  const container = document.querySelector("#predictionStats");
  if (!container) return;

  if (!predictionHistory) {
    container.innerHTML = `
      <article class="details-card">
        <h3>Histórico carregando</h3>
        <p>As estatísticas aparecem quando o servidor devolver o histórico das premonições.</p>
      </article>
    `;
    return;
  }

  const { total, awaitingResult, resultWithoutPrediction, matches } = predictionHistory;
  const historyMatches = (matches || []).map(normalizeHistoryEvaluation);
  const allEvaluatedMatches = historyMatches
    .filter((match) => match.evaluation && predictionForEvaluation(match) && match.result)
    .sort((a, b) => (b.date || 0) - (a.date || 0));
  const evaluatedMatches = allEvaluatedMatches.slice(0, 8);
  const evaluated = allEvaluatedMatches.length || predictionHistory.evaluated || 0;
  const summary = allEvaluatedMatches.length ? summarizeEvaluations(allEvaluatedMatches) : predictionHistory.summary;

  container.innerHTML = `
    <section class="stats-overview">
      ${statCard("Premonições guardadas", total)}
      ${statCard("Avaliadas", evaluated)}
      ${statCard("Aguardando resultado", awaitingResult)}
      ${statCard("Erro médio de gols", formatStatDecimal(summary.averageGoalError))}
    </section>
    <section class="accuracy-grid">
      ${accuracyCard("Placar exato", summary.exactScore, evaluated)}
      ${accuracyCard("Acerto geral do resultado", summary.direction, evaluated)}
      ${accuracyCard("Vencedor", summary.winner, evaluated)}
      ${accuracyCard("Empate", summary.draw, evaluated)}
    </section>
    ${renderProbabilityBuckets(predictionHistory.probabilityBuckets)}
    ${renderAccuracyByGameType(predictionHistory.accuracyByGameType)}
    ${renderModelVersionStats(predictionHistory.modelVersions)}
    <section class="details-card">
      <h3>Últimas avaliações</h3>
      ${evaluatedMatches.length ? renderEvaluatedMatches(evaluatedMatches) : "<p>Nenhum jogo com premonição anterior foi finalizado ainda.</p>"}
    </section>
    ${renderCalibration(predictionHistory.calibration)}
    ${renderHealthStatus()}
  `;
};

const normalizeHistoryEvaluation = (match) => {
  const evaluatedPrediction = predictionForEvaluation(match);
  if (!evaluatedPrediction || !match.result) return match;

  return {
    ...match,
    evaluatedPrediction,
    evaluation: {
      ...evaluateHistoryPrediction(evaluatedPrediction, match.result),
      ...(match.evaluation || {}),
    },
  };
};

const predictionForEvaluation = (match) => match?.initialPrediction || match?.evaluatedPrediction || match?.latestPrediction || null;

const historyDirection = (homeGoals, awayGoals) => {
  if (homeGoals > awayGoals) return "home";
  if (awayGoals > homeGoals) return "away";
  return "draw";
};

const evaluateHistoryPrediction = (prediction, result) => {
  const predictedWinner = prediction.winner || historyDirection(prediction.homeGoals, prediction.awayGoals);
  const actualWinner = result.winner || historyDirection(result.homeGoals, result.awayGoals);
  const homeGoalError = Math.abs(prediction.homeGoals - result.homeGoals);
  const awayGoalError = Math.abs(prediction.awayGoals - result.awayGoals);
  const expectedHome = Number(prediction.expectedGoals?.home);
  const expectedAway = Number(prediction.expectedGoals?.away);

  return {
    exactScore: prediction.homeGoals === result.homeGoals && prediction.awayGoals === result.awayGoals,
    winner: predictedWinner === actualWinner && actualWinner !== "draw",
    draw: predictedWinner === "draw" && actualWinner === "draw",
    loser: predictedWinner === actualWinner && actualWinner !== "draw",
    direction: predictedWinner === actualWinner,
    homeGoalError,
    awayGoalError,
    totalGoalError: homeGoalError + awayGoalError,
    totalGoalsError: Math.abs(prediction.homeGoals + prediction.awayGoals - result.homeGoals - result.awayGoals),
    expectedGoalError:
      Number.isFinite(expectedHome) && Number.isFinite(expectedAway)
        ? Number((Math.abs(expectedHome - result.homeGoals) + Math.abs(expectedAway - result.awayGoals)).toFixed(2))
        : null,
  };
};

const summarizeEvaluations = (matches) => {
  const summary = matches.reduce(
    (acc, match) => {
      acc.exactScore += match.evaluation.exactScore ? 1 : 0;
      acc.winner += match.evaluation.winner ? 1 : 0;
      acc.draw += match.evaluation.draw ? 1 : 0;
      acc.direction += match.evaluation.direction ? 1 : 0;
      acc.totalGoalError += Number(match.evaluation.totalGoalError || 0);
      acc.totalGoalsError += Number(match.evaluation.totalGoalsError || 0);
      acc.expectedGoalError += Number(match.evaluation.expectedGoalError || 0);
      return acc;
    },
    { exactScore: 0, winner: 0, draw: 0, direction: 0, totalGoalError: 0, totalGoalsError: 0, expectedGoalError: 0 }
  );

  summary.averageGoalError = matches.length ? Number((summary.totalGoalError / matches.length).toFixed(2)) : 0;
  summary.averageTotalGoalsError = matches.length ? Number((summary.totalGoalsError / matches.length).toFixed(2)) : 0;
  summary.averageExpectedGoalError = matches.length ? Number((summary.expectedGoalError / matches.length).toFixed(2)) : 0;

  return summary;
};

const formatStatDecimal = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
};

const renderProbabilityBuckets = (buckets = []) => {
  if (!buckets.length) return "";

  return `
    <section class="details-card probability-buckets">
      <h3>Calibração por chance</h3>
      <div class="bucket-list">
        ${buckets
          .map(
            (bucket) => `
              <div class="bucket-row">
                <span>${bucket.label}</span>
                <strong>${bucket.rate}%</strong>
                <small>${bucket.hits}/${bucket.total}</small>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
};

const renderAccuracyByGameType = (rows = []) => {
  if (!rows.length) return "";

  return `
    <section class="details-card">
      <h3>Acerto por tipo de jogo</h3>
      <div class="model-stat-list">
        ${rows
          .map(
            (row) => `
              <div class="model-stat-row">
                <span>${row.label}</span>
                <strong>${row.rate || 0}%</strong>
                <small>${row.hits || 0}/${row.total || 0} geral</small>
                <small>${row.exactRate || 0}% placar exato</small>
                <small>${formatStatDecimal(row.averageGoalError)} erro gols</small>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
};

const renderModelVersionStats = (rows = []) => {
  if (!rows.length) return "";

  return `
    <section class="details-card">
      <h3>Versões do modelo</h3>
      <div class="model-stat-list">
        ${rows
          .map(
            (row) => `
              <div class="model-stat-row">
                <span>${row.label}</span>
                <strong>${row.rate || 0}%</strong>
                <small>${row.hits || 0}/${row.total || 0} geral</small>
                <small>${row.exactRate || 0}% placar exato</small>
                <small>${formatStatDecimal(row.averageGoalError)} erro gols</small>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
};

const renderHealthStatus = () => {
  if (!systemHealth) return "";

  return `
    <section class="details-card health-card">
      <h3>Status do backend</h3>
      <div class="health-grid">
        ${calibrationItem("Estado", systemHealth.status || "-")}
        ${calibrationItem("Histórico", systemHealth.historyStorage || "-")}
        ${calibrationItem("Simulações", systemHealth.simulationHistoryStorage || "-")}
        ${calibrationItem("Snapshots", systemHealth.simulationSnapshots || 0)}
        ${calibrationItem("Última Copa", formatHistoryDate(systemHealth.worldCupUpdatedAt))}
        ${calibrationItem("Simulação", formatHistoryDate(systemHealth.simulationGeneratedAt))}
      </div>
    </section>
  `;
};

const statCard = (label, value) => `
  <article class="stat-card">
    <strong>${value ?? 0}</strong>
    <span>${label}</span>
  </article>
`;

const renderCalibration = (calibration) => {
  if (!calibration) return "";

  return `
    <section class="details-card">
      <h3>Ajuste automático do modelo</h3>
      <div class="calibration-grid">
        ${calibrationItem("Jogos avaliados", calibration.evaluated)}
        ${calibrationItem("Força da amostra", `${Math.round((calibration.confidenceFactor || 0) * 100)}%`)}
        ${calibrationItem("Peso da forma", calibration.formMultiplier)}
        ${calibrationItem("Impacto jogadores", calibration.playerImpactMultiplier)}
        ${calibrationItem("Agressividade", calibration.diffMultiplier)}
        ${calibrationItem("Ajuste de gols", calibration.goalVolumeMultiplier || 1)}
        ${calibrationItem("Viés de gols", formatSignedDecimal(calibration.goalBias))}
        ${calibrationItem("Tendência a empate", calibration.drawBias > 0 ? `+${calibration.drawBias}` : calibration.drawBias)}
      </div>
      <p>Esses parâmetros mudam conforme as premonições são avaliadas. O ajuste de gols usa o erro médio para reduzir ou aumentar levemente o volume dos placares.</p>
    </section>
  `;
};

const formatSignedDecimal = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0.00";
  return number > 0 ? `+${number.toFixed(2)}` : number.toFixed(2);
};

const calibrationItem = (label, value) => `
  <div class="calibration-item">
    <strong>${value}</strong>
    <span>${label}</span>
  </div>
`;

const accuracyCard = (label, value, total) => `
  <article class="accuracy-card">
    <div>
      <strong>${percent(value, total)}</strong>
      <span>${label}</span>
    </div>
    <div class="accuracy-track"><span style="width: ${percent(value, total)}"></span></div>
    <small>${value || 0}/${total || 0}</small>
  </article>
`;

const renderEvaluatedMatches = (matches) => `
  <div class="history-list">
    ${matches
      .map((match) => `
        <article class="history-row">
          <strong>${match.home} x ${match.away}</strong>
          <span>Premonição avaliada: ${predictionForEvaluation(match).homeGoals}-${predictionForEvaluation(match).awayGoals}</span>
          <span>Placar: ${match.result.homeGoals}-${match.result.awayGoals}</span>
          <small class="${match.evaluation.direction ? "hit" : "miss"}">${match.evaluation.exactScore ? "Placar exato" : match.evaluation.direction ? "Acerto geral" : "Errou"}</small>
        </article>
      `)
      .join("")}
  </div>
`;

const liveIndicator = () => `
  <span class="live-inline" aria-label="Jogo ao vivo">
    <span></span>
    <span></span>
    <span></span>
    <em>Ao vivo</em>
  </span>
`;

const renderMatches = () => {
  const container = document.querySelector("#matchGrid");
  const targetMatch = currentTargetMatch();
  const activeDay = targetMatch ? matchDisplayDay(targetMatch) : null;
  const visibleMatches = appData.matches.filter(isGroupStageMatch);
  const activeMatchId = selectedMatchId ?? targetMatch?.id ?? visibleMatches[0]?.id;

  if (!visibleMatches.length) {
    container.innerHTML = `
      <article class="details-card match-empty">
        <h3>Nenhum jogo de fase de grupos</h3>
        <p>A fonte ainda não retornou os confrontos dessa fase.</p>
      </article>
    `;
    return;
  }

  const matchesByDay = visibleMatches.reduce((days, match) => {
    const day = matchDisplayDay(match);
    days[day] = days[day] || [];
    days[day].push(match);
    return days;
  }, {});

  container.innerHTML = Object.entries(matchesByDay)
    .map(([day, dayMatches], dayIndex) => {
      const cards = dayMatches
        .map((match) => {
          const home = appData.teams[match.home];
          const away = appData.teams[match.away];
          const score = scoreFor(match);
          const active = activeMatchId === match.id;
          const live = isLive(match);
          const footerStatus = live ? liveIndicator() : isFinished(match) ? "Finalizado" : `${matchDisplayTime(match)} - ${score.label}`;

          return `
            <article class="match-card${active ? " active" : ""}${live ? " live" : ""}" data-match-id="${match.id}" data-current-match="${match.id === targetMatch?.id}">
              <div class="chance-pill ${score.kind}">${score.chance}</div>
              <div class="match-group">${match.group}</div>
              <div class="team-line">
                <div class="team-label">
                  ${teamMark(home)}
                  <span>${home.name}</span>
                </div>
                <span class="predicted-score">${score.home}</span>
              </div>
              <div class="team-line">
                <div class="team-label">
                  ${teamMark(away)}
                  <span>${away.name}</span>
                </div>
                <span class="predicted-score">${score.away}</span>
              </div>
              <footer class="match-footer">
                <span>${footerStatus}</span>
                <span class="confidence-bar" title="Confiança da premonição">
                  <span style="width: ${match.prediction?.confidence ?? 100}%"></span>
                </span>
              </footer>
            </article>
          `;
        })
        .join("");

      return `
        <section class="day-group" data-current-day="${day === activeDay}">
          <header class="day-heading">Fase de grupos - ${day}</header>
          <div class="day-match-grid">${cards}</div>
        </section>
      `;
    })
    .join("");

  document.querySelectorAll(".match-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedMatchId = Number(card.dataset.matchId);
      renderMatches();
      renderDetails(selectedMatchId);
      showScreen("details");
    });
  });
};

const isGroupStageMatch = (match) => /(Group|Grupo)\s+[A-Z]/i.test(match.group || "");

const isKnockoutMatch = (match) => !isGroupStageMatch(match);

const extractGroupName = (groupText) => {
  const match = /(Group|Grupo)\s+([A-Z])/i.exec(groupText || "");
  return match ? `Grupo ${match[2].toUpperCase()}` : null;
};

const simulationCacheKey = () =>
  [
    appData?.updatedAt || "",
    appData?.matches
      .map((match) => {
        const actual = match.actualScore ? `${match.actualScore.home}-${match.actualScore.away}` : "";
        const prediction = match.prediction ? `${match.prediction.homeGoals}-${match.prediction.awayGoals}-${match.prediction.homeChance}-${match.prediction.drawChance}-${match.prediction.awayChance}` : "";
        return `${match.id}:${match.status}:${actual}:${prediction}`;
      })
      .join("|") || "",
  ].join("::");

const hashString = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));
const goalDistributionCache = new Map();

const ensureProjectionTeam = (table, groupName, teamKey) => {
  if (table[groupName][teamKey]) return table[groupName][teamKey];

  const team = appData.teams[teamKey] || {};
  table[groupName][teamKey] = {
    teamKey,
    groupName,
    name: team.name || "Seleção",
    logo: team.logo || "",
    flagCode: team.flagCode || "",
    weight: Number(team.weight || team.strength?.overall || 50),
    fifaRank: Number(team.fifaRank || 999),
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };

  return table[groupName][teamKey];
};

const applyProjectionResult = (home, away, homeScore, awayScore) => {
  home.played += 1;
  away.played += 1;
  home.goalsFor += homeScore;
  home.goalsAgainst += awayScore;
  away.goalsFor += awayScore;
  away.goalsAgainst += homeScore;
  home.goalDifference = home.goalsFor - home.goalsAgainst;
  away.goalDifference = away.goalsFor - away.goalsAgainst;

  if (homeScore > awayScore) {
    home.wins += 1;
    away.losses += 1;
    home.points += 3;
  } else if (awayScore > homeScore) {
    away.wins += 1;
    home.losses += 1;
    away.points += 3;
  } else {
    home.draws += 1;
    away.draws += 1;
    home.points += 1;
    away.points += 1;
  }
};

const sortProjectionRows = (a, b) =>
  b.points - a.points ||
  b.goalDifference - a.goalDifference ||
  b.goalsFor - a.goalsFor ||
  b.weight - a.weight ||
  a.fifaRank - b.fifaRank ||
  a.name.localeCompare(b.name, "pt-BR");

const fallbackScoreByStrength = (match) => {
  const home = appData.teams[match.home] || {};
  const away = appData.teams[match.away] || {};
  const diff = Number(home.weight || 50) - Number(away.weight || 50);

  if (Math.abs(diff) < 4) return { home: 1, away: 1, source: "fallback" };
  if (diff > 16) return { home: 2, away: 0, source: "fallback" };
  if (diff > 6) return { home: 2, away: 1, source: "fallback" };
  if (diff < -16) return { home: 0, away: 2, source: "fallback" };
  if (diff < -6) return { home: 1, away: 2, source: "fallback" };
  return diff > 0 ? { home: 1, away: 0, source: "fallback" } : { home: 0, away: 1, source: "fallback" };
};

const deterministicProjectionScore = (match) => {
  if ((isFinished(match) || isLive(match)) && match.actualScore) {
    return {
      home: Number(match.actualScore.home || 0),
      away: Number(match.actualScore.away || 0),
      source: isLive(match) ? "live" : "real",
    };
  }

  if (match.prediction) {
    return {
      home: Number(match.prediction.homeGoals || 0),
      away: Number(match.prediction.awayGoals || 0),
      source: "prediction",
    };
  }

  return fallbackScoreByStrength(match);
};

const normalizedOutcomeProbabilities = (match) => {
  if (match.prediction) {
    const home = Number(match.prediction.homeChance || 0);
    const draw = Number(match.prediction.drawChance || 0);
    const away = Number(match.prediction.awayChance || 0);
    const total = home + draw + away || 1;
    return { home: home / total, draw: draw / total, away: away / total };
  }

  const home = appData.teams[match.home] || {};
  const away = appData.teams[match.away] || {};
  const diff = Number(home.weight || 50) - Number(away.weight || 50);
  const draw = clampNumber(0.28 - Math.abs(diff) * 0.003, 0.14, 0.32);
  const homeChance = clampNumber((1 - draw) * (0.5 + diff * 0.008), 0.08, 0.84);
  const awayChance = Math.max(0.06, 1 - draw - homeChance);
  const total = homeChance + draw + awayChance;

  return { home: homeChance / total, draw: draw / total, away: awayChance / total };
};

const projectionExpectedGoals = (match) => {
  const base = match.prediction || fallbackScoreByStrength(match);
  const fallbackHome = Number(base.homeGoals ?? base.home ?? 1);
  const fallbackAway = Number(base.awayGoals ?? base.away ?? 1);
  const homeBase = Number(base.expectedGoals?.home ?? fallbackHome);
  const awayBase = Number(base.expectedGoals?.away ?? fallbackAway);

  return {
    home: clampNumber(homeBase, 0.15, 4.8),
    away: clampNumber(awayBase, 0.15, 4.8),
  };
};

const goalDistributionFor = (lambda, max = 6) => {
  const safeLambda = clampNumber(lambda, 0.05, max);
  const key = `${safeLambda.toFixed(2)}:${max}`;
  if (goalDistributionCache.has(key)) return goalDistributionCache.get(key);

  const distribution = [];
  let probability = Math.exp(-safeLambda);
  let cumulative = probability;
  distribution.push(cumulative);

  for (let goals = 1; goals < max; goals += 1) {
    probability *= safeLambda / goals;
    cumulative += probability;
    distribution.push(cumulative);
  }

  distribution.push(1);
  goalDistributionCache.set(key, distribution);
  return distribution;
};

const samplePoissonGoals = (lambda, rng, max = 6) => {
  const distribution = goalDistributionFor(lambda, max);
  const roll = rng();

  for (let goals = 0; goals < distribution.length; goals += 1) {
    if (roll <= distribution[goals]) return goals;
  }

  return max;
};

const scoreDirection = (home, away) => {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
};

const forceOutcomeScore = (expected, outcome, rng) => {
  if (outcome === "draw") {
    const goals = samplePoissonGoals((expected.home + expected.away) / 2, rng, 5);
    return { home: goals, away: goals, source: "prediction" };
  }

  if (outcome === "home") {
    const away = samplePoissonGoals(expected.away * 0.85, rng, 4);
    const home = clampNumber(Math.max(away + 1, samplePoissonGoals(expected.home * 1.08, rng, 6)), 1, 6);
    return { home, away, source: "prediction" };
  }

  const home = samplePoissonGoals(expected.home * 0.85, rng, 4);
  const away = clampNumber(Math.max(home + 1, samplePoissonGoals(expected.away * 1.08, rng, 6)), 1, 6);
  return { home, away, source: "prediction" };
};

const scoreForOutcome = (match, outcome, rng) => {
  const expected = projectionExpectedGoals(match);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const home = samplePoissonGoals(expected.home, rng, 6);
    const away = samplePoissonGoals(expected.away, rng, 6);
    if (scoreDirection(home, away) === outcome) {
      return { home, away, source: "prediction" };
    }
  }

  return forceOutcomeScore(expected, outcome, rng);
};

const randomProjectionScore = (match, rng) => {
  if ((isFinished(match) || isLive(match)) && match.actualScore) {
    return {
      home: Number(match.actualScore.home || 0),
      away: Number(match.actualScore.away || 0),
      source: isLive(match) ? "live" : "real",
    };
  }

  const probabilities = normalizedOutcomeProbabilities(match);
  const roll = rng();
  if (roll < probabilities.home) return scoreForOutcome(match, "home", rng);
  if (roll < probabilities.home + probabilities.draw) return scoreForOutcome(match, "draw", rng);
  return scoreForOutcome(match, "away", rng);
};

const buildProjectionTables = (matches, scoreBuilder) => {
  const table = {};
  const sources = { real: 0, live: 0, prediction: 0, fallback: 0 };

  matches.forEach((match) => {
    const groupName = extractGroupName(match.group);
    if (!groupName || !match.home || !match.away) return;

    table[groupName] = table[groupName] || {};
    const home = ensureProjectionTeam(table, groupName, match.home);
    const away = ensureProjectionTeam(table, groupName, match.away);
    const score = scoreBuilder(match);
    sources[score.source] = (sources[score.source] || 0) + 1;
    applyProjectionResult(home, away, score.home, score.away);
  });

  const groups = Object.entries(table)
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([name, rows]) => ({
      name,
      teams: Object.values(rows)
        .sort(sortProjectionRows)
        .map((row, index) => ({ ...row, projectedPosition: index + 1 })),
    }));

  return { groups, sources };
};

const evaluateSimulationScenario = (groups, counts) => {
  const thirdRows = [];

  groups.forEach((group) => {
    const rows = group.teams;
    if (rows[0]) {
      counts[rows[0].teamKey].first += 1;
      counts[rows[0].teamKey].qualified += 1;
    }
    if (rows[1]) {
      counts[rows[1].teamKey].second += 1;
      counts[rows[1].teamKey].qualified += 1;
    }
    if (rows[2]) thirdRows.push(rows[2]);
  });

  thirdRows.sort(sortProjectionRows).slice(0, 8).forEach((row) => {
    counts[row.teamKey].third += 1;
    counts[row.teamKey].qualified += 1;
  });

  return thirdRows.sort(sortProjectionRows).map((row, index) => ({
    ...row,
    thirdPlaceRank: index + 1,
    projectedThirdQualified: index < 8,
  }));
};

const buildRound32Simulation = () => {
  if (simulationData) return simulationData;
  return {
    runs: 0,
    groups: [],
    thirdRows: [],
    championRows: [],
    sources: {},
    history: [],
  };
};

const renderSimulationState = () => {
  if (simulationLoading) {
    return `
      <section class="round32-simulation">
        <article class="details-card simulation-loading-card">
          <h3>Calculando simulação</h3>
          <p>O backend está processando 30 mil cenários e preparando as probabilidades.</p>
          <div class="loading-bar"><span></span></div>
        </article>
      </section>
    `;
  }

  if (simulationError) {
    return `
      <section class="round32-simulation">
        <article class="details-card">
          <h3>Simulação indisponível</h3>
          <p>${simulationError}</p>
        </article>
      </section>
    `;
  }

  return `
    <section class="round32-simulation">
      <article class="details-card">
        <h3>Simulação aguardando dados</h3>
        <p>A simulação será carregada pelo backend assim que os dados da Copa terminarem de atualizar.</p>
      </article>
    </section>
  `;
};

const renderRound32Simulation = () => {
  const simulation = buildRound32Simulation();

  if (!simulation.groups.length) {
    return renderSimulationState();
  }

  return `
    <section class="round32-simulation">
      ${renderSimulationSummary(simulation)}
      <div class="qualification-grid">
        ${simulation.groups.map(renderQualificationGroup).join("")}
      </div>
      ${renderThirdPlaceSimulation(simulation.thirdRows)}
    </section>
  `;
};

const renderSimulationSummary = (simulation) => `
  <div class="simulation-head">
    <h3>${simulationTitle()}</h3>
    <div class="simulation-kpis">
      ${simulationKpi("Cenários", simulation.runs)}
      ${simulationKpi("Vagas diretas", 24)}
      ${simulationKpi("Melhores terceiros", 8)}
      ${simulationKpi("Favorito ao título", simulation.championRows[0] ? `${simulation.championRows[0].name} ${simulation.championRows[0].probabilities.champion}%` : "-")}
    </div>
  </div>
  <div class="simulation-metrics" aria-label="Métricas da simulação">
    <span>Tabela real</span>
    <span>Força atual</span>
    <span>Probabilidades</span>
    <span>Cenários</span>
    <span>Desempates</span>
    <span>Campeão</span>
  </div>
`;

const simulationTitle = () => {
  if (simulationView === "bracket") return "Chave simulada";
  if (simulationView === "champion") return "Favoritos ao título";
  if (simulationView === "evolution") return "Evolução dos favoritos ao título";
  return "Classificados projetados";
};

const simulationKpi = (label, value) => `
  <article class="simulation-kpi">
    <strong>${value}</strong>
    <span>${label}</span>
  </article>
`;

const renderChampionSimulation = (teams) => `
  <article class="champion-simulation">
    <h3>Favoritos ao título</h3>
    <table class="qualification-table">
      <thead>
        <tr>
          <th>Seleção</th>
          <th>Campeão</th>
          <th>Final</th>
          <th>Semifinal</th>
          <th>16 avos</th>
        </tr>
      </thead>
      <tbody>
        ${teams
          .map(
            (team, index) => `
              <tr class="${index === 0 ? "direct" : ""}">
                <td>
                  <div class="qualification-team">
                    <span class="standing-position">${index + 1}</span>
                    ${teamMark(team)}
                    <span>${team.name}</span>
                  </div>
                </td>
                <td><strong>${team.probabilities.champion || 0}%</strong></td>
                <td>${team.probabilities.final || 0}%</td>
                <td>${team.probabilities.semifinal || 0}%</td>
                <td>${team.probabilities.qualified || 0}%</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  </article>
`;

const renderQualificationGroup = (group) => `
  <article class="qualification-card">
    <h3>${group.name}</h3>
    <table class="qualification-table">
      <thead>
        <tr>
          <th>Seleção</th>
          <th>Pts</th>
          <th>SG</th>
          <th>GP</th>
          <th>Vaga</th>
          <th>%</th>
        </tr>
      </thead>
      <tbody>
        ${group.teams.map(renderQualificationRow).join("")}
      </tbody>
    </table>
  </article>
`;

const renderQualificationRow = (team) => {
  const slotClass = team.projectedSlot === "Direto" ? "direct" : team.projectedSlot === "Melhor 3º" ? "third" : "out";

  return `
    <tr class="${slotClass}">
      <td>
        <div class="qualification-team">
          <span class="standing-position">${team.projectedPosition}</span>
          ${teamMark(team)}
          <span>${team.name}</span>
        </div>
      </td>
      <td>${team.points}</td>
      <td>${team.goalDifference}</td>
      <td>${team.goalsFor}</td>
      <td><span class="qualification-pill ${slotClass}">${team.projectedSlot}</span></td>
      <td><strong>${team.probabilities.qualified || 0}%</strong></td>
    </tr>
  `;
};

const renderThirdPlaceSimulation = (thirdRows) => `
  <article class="third-place-simulation">
    <h3>Melhores terceiros simulados</h3>
    <table class="qualification-table">
      <thead>
        <tr>
          <th>Seleção</th>
          <th>Grupo</th>
          <th>Pts</th>
          <th>SG</th>
          <th>GP</th>
          <th>Via 3º</th>
        </tr>
      </thead>
      <tbody>
        ${thirdRows
          .map(
            (team) => `
              <tr class="${team.projectedThirdQualified ? "third" : "out"}">
                <td>
                  <div class="qualification-team">
                    <span class="standing-position">${team.thirdPlaceRank}</span>
                    ${teamMark(team)}
                    <span>${team.name}</span>
                  </div>
                </td>
                <td>${team.groupName.replace("Grupo ", "")}</td>
                <td>${team.points}</td>
                <td>${team.goalDifference}</td>
                <td>${team.goalsFor}</td>
                <td><strong>${team.probabilities.third || 0}%</strong></td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  </article>
`;

const renderChampionSimulationView = () => {
  const simulation = buildRound32Simulation();

  if (!simulation.groups.length) {
    return renderSimulationState();
  }

  return `
    <section class="round32-simulation">
      ${renderSimulationSummary(simulation)}
      ${renderChampionSimulation(simulation.championRows)}
    </section>
  `;
};

const renderSimulationEvolutionView = () => {
  const simulation = buildRound32Simulation();
  const snapshots = [...(simulation.history || [])].reverse();

  if (!snapshots.length) {
    return renderSimulationState();
  }

  return `
    <section class="round32-simulation">
      ${renderSimulationSummary(simulation)}
      <article class="champion-simulation">
        <h3>Evolução dos favoritos ao título</h3>
        <div class="evolution-list">
          ${snapshots.map((snapshot, index) => renderSimulationSnapshot(snapshot, snapshots[index + 1])).join("")}
        </div>
      </article>
    </section>
  `;
};

const renderSimulationSnapshot = (snapshot, previousSnapshot = null) => {
  const favorite = snapshot.favorite;
  const topChampions = (snapshot.topChampions || []).slice(0, 4);
  const previousByName = new Map((previousSnapshot?.topChampions || []).map((team) => [team.name, team]));

  return `
    <article class="evolution-row">
      <header>
        <strong>${formatHistoryDate(snapshot.capturedAt)}</strong>
        <span>${snapshot.runs || 0} cenários</span>
      </header>
      ${
        favorite
          ? `
            <div class="evolution-favorite">
              <span>Favorito</span>
              <strong>${favorite.name}</strong>
              <em>${favorite.champion || 0}% título</em>
            </div>
          `
          : "<p>Sem favorito calculado.</p>"
      }
      <strong class="evolution-subtitle">Top 4 ao título</strong>
      <div class="evolution-bars">
        ${topChampions
          .map(
            (team) => `
              <div class="evolution-bar">
                <span>${team.name}</span>
                <div><i style="width: ${team.champion || 0}%"></i></div>
                <strong>${renderChampionTrend(team, previousByName.get(team.name))}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </article>
  `;
};

const renderChampionTrend = (team, previousTeam) => {
  const current = Number(team?.champion || 0);
  const previous = Number(previousTeam?.champion ?? current);
  const direction = current > previous ? "up" : current < previous ? "down" : "flat";

  return `<span class="chance-trend ${direction}">${previous}% → ${current}%</span>`;
};

const formatHistoryDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: appTimeZone(),
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const roundMatches = (rounds, key) => rounds.find((round) => round.key === key)?.matches || [];

const safeTeamKey = (team) => team?.teamKey || team?.key || team?.sourceId || team?.name;

const knockoutWinChance = (home, away) => {
  const homeWeight = Number(home?.weight || home?.strength?.overall || 50);
  const awayWeight = Number(away?.weight || away?.strength?.overall || 50);
  const rankEdge = (Number(away?.fifaRank || 75) - Number(home?.fifaRank || 75)) * 0.0018;
  const groupEdge =
    (Number(home?.points || 0) - Number(away?.points || 0)) * 0.008 +
    (Number(home?.goalDifference || 0) - Number(away?.goalDifference || 0)) * 0.004;

  return clampNumber(0.5 + (homeWeight - awayWeight) * 0.011 + rankEdge + groupEdge, 0.12, 0.88);
};

const knockoutExpectedGoals = (home, away) => {
  const homeWeight = Number(home?.weight || home?.strength?.overall || 50);
  const awayWeight = Number(away?.weight || away?.strength?.overall || 50);
  const diff = homeWeight - awayWeight;

  return {
    home: clampNumber(1.15 + diff / 38 + Number(home?.goalsFor || 0) * 0.025, 0.25, 3.8),
    away: clampNumber(1.05 - diff / 40 + Number(away?.goalsFor || 0) * 0.025, 0.25, 3.8),
  };
};

const projectedKnockoutScore = (home, away, homeWins, rng = null) => {
  const expected = knockoutExpectedGoals(home, away);
  const generator = rng || seededRandom(hashString(`${safeTeamKey(home)}-${safeTeamKey(away)}`));
  const score = forceOutcomeScore(expected, homeWins ? "home" : "away", generator);
  return { home: score.home, away: score.away };
};

const knockoutResultFor = (match, home, away, rng = null) => {
  if ((isFinished(match) || isLive(match)) && match.actualScore) {
    const homeScore = Number(match.actualScore.home || 0);
    const awayScore = Number(match.actualScore.away || 0);
    const homeWins = homeScore === awayScore ? knockoutWinChance(home, away) >= 0.5 : homeScore > awayScore;
    return {
      home,
      away,
      winner: homeWins ? home : away,
      loser: homeWins ? away : home,
      score: { home: homeScore, away: awayScore },
      source: isLive(match) ? "live" : "real",
    };
  }

  const homeWins = rng ? rng() < knockoutWinChance(home, away) : knockoutWinChance(home, away) >= 0.5;
  return {
    home,
    away,
    winner: homeWins ? home : away,
    loser: homeWins ? away : home,
    score: projectedKnockoutScore(home, away, homeWins, rng),
    source: "simulation",
  };
};

const groupLetterFromName = (groupName) => /Grupo\s+([A-Z])/i.exec(groupName || "")?.[1]?.toUpperCase() || "";

const normalizeSlotText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Â/g, "");

const buildBracketProjectionContext = (rounds, simulation) =>
  simulateFullBracket(rounds, simulation.groups, simulation.thirdRows);

const currentBracketGroups = () =>
  (appData.groups || []).map((group) => {
    const teams = (group.teams || [])
      .map((row) => {
        const team = appData.teams[row.teamKey] || {};

        return {
          ...team,
          ...row,
          teamKey: row.teamKey,
          name: row.name || team.name,
          logo: row.logo || team.logo,
          flagCode: row.flagCode || team.flagCode,
          weight: Number(team.weight || row.weight || 0),
          fifaRank: Number(team.fifaRank || row.fifaRank || 999),
          groupName: group.name,
          currentPosition: Number(row.position || 99),
        };
      })
      .sort((a, b) => a.currentPosition - b.currentPosition)
      .map((row, index) => ({
        ...row,
        projectedPosition: row.currentPosition || index + 1,
      }));

    return {
      ...group,
      teams,
    };
  });

const currentThirdRows = (groups) =>
  groups
    .map((group) => group.teams[2] && { ...group.teams[2], groupName: group.name })
    .filter(Boolean)
    .sort(sortProjectionRows)
    .map((row, index) => ({
      ...row,
      thirdPlaceRank: index + 1,
      projectedThirdQualified: index < 8,
    }));

const currentSlotParticipant = (team) =>
  team
    ? {
        ...team,
        projectedFromSlot: false,
        currentSlotParticipant: true,
      }
    : team;

const buildOpeningRoundContext = (rounds) => {
  const groups = currentBracketGroups();
  const thirdRows = currentThirdRows(groups);
  const context = createBracketContext(groups, thirdRows);

  roundMatches(rounds, "round32").forEach((match) => {
    context.participants[`${match.id}:home`] = currentSlotParticipant(resolveBracketParticipant(match, "home", context));
    context.participants[`${match.id}:away`] = currentSlotParticipant(resolveBracketParticipant(match, "away", context));
  });

  return context;
};

const createBracketContext = (groups, thirdRows) => ({
  participants: {},
  results: {},
  groupsByLetter: Object.fromEntries(groups.map((group) => [groupLetterFromName(group.name), group])),
  thirdRows,
  usedThirdTeams: new Set(),
  roundWinners: {
    round32: {},
    round16: {},
    quarterfinal: {},
    semifinal: {},
  },
  roundLosers: {
    round32: {},
    round16: {},
    quarterfinal: {},
    semifinal: {},
  },
});

const simulateFullBracket = (rounds, groups, thirdRows, options = {}) => {
  const context = {
    ...createBracketContext(groups, thirdRows),
    rng: options.rng || null,
  };

  simulateBracketRound(roundMatches(rounds, "round32"), "round32", "round16", context, options.counts);
  simulateBracketRound(roundMatches(rounds, "round16"), "round16", "quarterfinal", context, options.counts);
  simulateBracketRound(roundMatches(rounds, "quarterfinal"), "quarterfinal", "semifinal", context, options.counts);
  simulateBracketRound(roundMatches(rounds, "semifinal"), "semifinal", "final", context, options.counts);

  const finalMatch = roundMatches(rounds, "Final")[0];
  if (finalMatch) {
    const result = simulateBracketMatch(finalMatch, context);
    if (result?.winner) {
      incrementTournamentCount(options.counts, result.winner, "champion");
      context.champion = result.winner;
      context.runnerUp = result.loser;
    }
  }

  const thirdPlaceMatch = roundMatches(rounds, "thirdPlace")[0];
  if (thirdPlaceMatch) {
    const result = simulateBracketMatch(thirdPlaceMatch, context);
    if (result?.winner) context.thirdPlaceWinner = result.winner;
  }

  return context;
};

const simulateBracketRound = (matches, roundKey, nextCountKey, context, counts) => {
  matches.forEach((match, index) => {
    const result = simulateBracketMatch(match, context);
    if (!result?.winner) return;

    context.roundWinners[roundKey][index + 1] = result.winner;
    context.roundLosers[roundKey][index + 1] = result.loser;
    incrementTournamentCount(counts, result.winner, nextCountKey);
  });
};

const simulateBracketMatch = (match, context) => {
  const home = resolveBracketParticipant(match, "home", context);
  const away = resolveBracketParticipant(match, "away", context);
  if (!home || !away) return null;

  context.participants[`${match.id}:home`] = home;
  context.participants[`${match.id}:away`] = away;

  const result = knockoutResultFor(match, home, away, context.rng);
  context.results[match.id] = result;
  return result;
};

const incrementTournamentCount = (counts, team, key) => {
  const teamKey = safeTeamKey(team);
  if (!counts || !teamKey || !counts[teamKey]) return;
  counts[teamKey][key] = (counts[teamKey][key] || 0) + 1;
};

const resolveBracketParticipant = (match, side, context) => {
  const teamKey = match[side];
  const team = appData.teams[teamKey] || {};
  if (!team.placeholder) return { ...team, teamKey };

  const slot = normalizeSlotText(team.name);
  const advancedTeam = resolveAdvancementSlot(slot, context);
  if (advancedTeam) return advancedTeam;
  const winnerGroup = /Vencedor do Grupo ([A-Z])/i.exec(slot);
  if (winnerGroup) {
    return projectedTeamFromGroup(context, winnerGroup[1], 1, team, `1º Grupo ${winnerGroup[1]}`);
  }

  const runnerUpGroup = /2.*lugar do Grupo ([A-Z])/i.exec(slot);
  if (runnerUpGroup) {
    return projectedTeamFromGroup(context, runnerUpGroup[1], 2, team, `2º Grupo ${runnerUpGroup[1]}`);
  }

  const thirdPlaceGroups = /3.*colocado dos Grupos ([A-Z/]+)/i.exec(slot);
  if (thirdPlaceGroups) {
    return projectedThirdTeam(context, thirdPlaceGroups[1].split("/"), team);
  }

  return { ...team, teamKey };
};

const resolveAdvancementSlot = (slot, context) => {
  const round32Winner = /Vencedor do jogo (\d+) dos 16 avos/i.exec(slot);
  if (round32Winner) return context.roundWinners.round32[Number(round32Winner[1])];

  const round16Winner = /Vencedor do jogo (\d+) das oitavas/i.exec(slot);
  if (round16Winner) return context.roundWinners.round16[Number(round16Winner[1])];

  const quarterWinner = /Vencedor do jogo (\d+) das quartas/i.exec(slot);
  if (quarterWinner) return context.roundWinners.quarterfinal[Number(quarterWinner[1])];

  const semifinalWinner = /Vencedor da semifinal (\d+)/i.exec(slot);
  if (semifinalWinner) return context.roundWinners.semifinal[Number(semifinalWinner[1])];

  const semifinalLoser = /Perdedor da semifinal (\d+)/i.exec(slot);
  if (semifinalLoser) return context.roundLosers.semifinal[Number(semifinalLoser[1])];

  return null;
};

const projectedTeamFromGroup = (context, groupLetter, position, placeholderTeam, projectionSlot) => {
  const group = context.groupsByLetter[groupLetter.toUpperCase()];
  const projected = group?.teams?.[position - 1];
  if (!projected) return placeholderTeam;

  return {
    ...projected,
    projectedFromSlot: true,
    projectionSlot,
  };
};

const projectedThirdTeam = (context, groupLetters, placeholderTeam) => {
  const allowedGroups = new Set(groupLetters.map((letter) => `Grupo ${letter.toUpperCase()}`));
  const qualifiedCandidate = context.thirdRows.find(
    (row) => row.projectedThirdQualified && allowedGroups.has(row.groupName) && !context.usedThirdTeams.has(row.teamKey)
  );
  const fallbackCandidate = context.thirdRows.find(
    (row) => allowedGroups.has(row.groupName) && !context.usedThirdTeams.has(row.teamKey)
  );
  const projected = qualifiedCandidate || fallbackCandidate;

  if (!projected) return placeholderTeam;

  context.usedThirdTeams.add(projected.teamKey);
  return {
    ...projected,
    projectedFromSlot: true,
    projectionSlot: `3º ${projected.groupName}`,
  };
};

const bracketScoreFor = (match, home, away) => {
  if ((isFinished(match) || isLive(match)) && match.actualScore) {
    return scoreFor(match);
  }

  if (home?.projectedFromSlot || away?.projectedFromSlot) {
    const result = knockoutResultFor(match, home, away);
    return { ...result.score, label: "Simulação", chance: "Simulação", kind: "prediction" };
  }

  return scoreFor(match);
};

const renderBracketTeam = (team, score, simulationMode = false, options = {}) => {
  const hasScore = score !== null && score !== undefined && score !== "";
  const showSlot = options.showSlot && team?.projectionSlot;

  return `
  <div class="bracket-team${simulationMode && team?.projectedFromSlot ? " projected" : ""}${hasScore ? "" : " no-score"}">
    ${teamMark(team)}
    <span class="bracket-team-name" title="${team?.name || ""}">
      <span>${team?.name || "A definir"}</span>
      ${showSlot ? `<em>${team.projectionSlot}</em>` : ""}
    </span>
    ${hasScore ? `<strong>${score}</strong>` : ""}
  </div>
`;
};

const renderBracketProbability = (home, away) => {
  const homeTitle = Number(home?.probabilities?.champion || 0);
  const awayTitle = Number(away?.probabilities?.champion || 0);
  const homeWin = Math.round(knockoutWinChance(home, away) * 100);
  const awayWin = 100 - homeWin;

  return `
    <div class="bracket-probability">
      <span>Título ${homeTitle}% / ${awayTitle}%</span>
      <span>Vitória ${homeWin}% / ${awayWin}%</span>
    </div>
  `;
};

const pickMatches = (matches, gameNumbers) => gameNumbers.map((number) => matches[number - 1]).filter(Boolean);

const renderBracketBoard = (rounds, bracketProjectionContext, options = {}) => {
  const round32 = roundMatches(rounds, "round32");
  const round16 = roundMatches(rounds, "round16");
  const quarters = roundMatches(rounds, "quarterfinal");
  const semis = roundMatches(rounds, "semifinal");
  const thirdPlace = roundMatches(rounds, "thirdPlace")[0];
  const final = roundMatches(rounds, "Final")[0];

  const leftRounds = [
    { name: "16 avos de final", matches: pickMatches(round32, [1, 3, 2, 5, 11, 12, 9, 10]) },
    { name: "Oitavas de final", matches: pickMatches(round16, [1, 2, 5, 6]) },
    { name: "Quartas de final", matches: pickMatches(quarters, [1, 2]) },
    { name: "Semifinal", matches: pickMatches(semis, [1]) },
  ];
  const rightRounds = [
    { name: "Semifinal", matches: pickMatches(semis, [2]) },
    { name: "Quartas de final", matches: pickMatches(quarters, [3, 4]) },
    { name: "Oitavas de final", matches: pickMatches(round16, [3, 4, 7, 8]) },
    { name: "16 avos de final", matches: pickMatches(round32, [4, 6, 7, 8, 14, 16, 13, 15]) },
  ];

  return `
    <div class="bracket-scroll">
      <div class="bracket-board bracket-board-split">
        <div class="bracket-wing left-wing">
          ${leftRounds.map((round, index) => renderBracketColumn(round, "left", index, bracketProjectionContext, options)).join("")}
        </div>
        <div class="bracket-center">
          <div class="center-main">
            ${final ? renderCenterMatch("Final", final, "final-match", bracketProjectionContext, options) : ""}
          </div>
          ${thirdPlace ? renderCenterMatch("3º lugar", thirdPlace, "third-place-match", bracketProjectionContext, options) : ""}
        </div>
        <div class="bracket-wing right-wing">
          ${rightRounds.map((round, index) => renderBracketColumn(round, "right", index, bracketProjectionContext, options)).join("")}
        </div>
      </div>
    </div>
  `;
};

const renderSimulationBracketView = () => {
  const simulation = buildRound32Simulation();
  const knockoutMatches = (appData.matches || []).filter(isKnockoutMatch);

  if (!simulation.groups.length) {
    return renderSimulationState();
  }

  if (!knockoutMatches.length) {
    return `
      <section class="round32-simulation">
        ${renderSimulationSummary(simulation)}
        <article class="details-card">
          <h3>Chave indisponível</h3>
          <p>A fonte ainda não retornou os confrontos do mata-mata.</p>
        </article>
      </section>
    `;
  }

  const rounds = groupKnockoutRounds(knockoutMatches);
  const bracketProjectionContext = buildBracketProjectionContext(rounds, simulation);

  return `
    <section class="round32-simulation simulation-bracket-view">
      ${renderSimulationSummary(simulation)}
      <div class="bracket-instructions simulation-note">Chave simulada com os classificados projetados e avanço calculado pela força atual.</div>
      ${renderBracketBoard(rounds, bracketProjectionContext, { mode: "simulation" })}
    </section>
  `;
};

const renderKnockoutBracket = () => {
  const container = document.querySelector("#knockoutBracket");
  if (!container) return;

  const knockoutMatches = appData.matches.filter(isKnockoutMatch);
  if (!knockoutMatches.length) {
    container.innerHTML = `
      <article class="details-card">
        <h3>Eliminatórias indisponíveis</h3>
        <p>A fonte ainda não retornou os confrontos do mata-mata.</p>
      </article>
    `;
    return;
  }

  const rounds = groupKnockoutRounds(knockoutMatches);
  const openingRoundContext = buildOpeningRoundContext(rounds);

  container.innerHTML = `
    <div class="bracket-instructions official-note">Chave preenchida pelas posições atuais dos grupos. Sem placar simulado; se a tabela mudar, os confrontos mudam.</div>
    ${renderBracketBoard(rounds, openingRoundContext, { mode: "official" })}
  `;

  bindBracketCards(container);
};

const renderSimulation = () => {
  const container = document.querySelector("#simulationContent");
  if (!container) return;

  if (simulationView === "bracket") {
    container.innerHTML = renderSimulationBracketView();
    bindBracketCards(container);
    return;
  }

  if (simulationView === "champion") {
    container.innerHTML = renderChampionSimulationView();
    return;
  }

  if (simulationView === "evolution") {
    container.innerHTML = renderSimulationEvolutionView();
    return;
  }

  container.innerHTML = renderRound32Simulation();
};

const bindBracketCards = (root = document) => {
  root.querySelectorAll(".bracket-match").forEach((card) => {
    card.addEventListener("click", () => {
      selectedMatchId = Number(card.dataset.matchId);
      renderDetails(selectedMatchId);
      showScreen("details");
    });
  });
};

const groupKnockoutRounds = (matches) => {
  const roundOrder = [
    { key: "round32", name: "16 avos de final", patterns: ["16 avos de final", "Round of 32"] },
    { key: "round16", name: "Oitavas de final", patterns: ["Oitavas de final", "Round of 16"] },
    { key: "quarterfinal", name: "Quartas de final", patterns: ["Quartas de final", "Quarterfinal"] },
    { key: "semifinal", name: "Semifinais", patterns: ["Semifinal"] },
    { key: "thirdPlace", name: "3º lugar", patterns: ["Disputa de 3º lugar", "3rd Place"] },
    { key: "Final", name: "Final", patterns: ["Final"] },
  ];

  return roundOrder
    .map((round) => {
      const roundMatches = matches.filter((match) => round.patterns.some((pattern) => (match.group || "").includes(pattern)));
      return {
        key: round.key,
        name: round.name,
        matches: roundMatches.sort((a, b) => a.timestamp - b.timestamp),
      };
    })
    .filter((round) => round.matches.length);
};

const renderBracketRound = (round) => `
  <section class="bracket-round">
    <h3>${round.name}</h3>
    <div class="bracket-round-matches">
      ${round.matches.map(renderBracketMatch).join("")}
    </div>
  </section>
`;

const renderBracketColumn = (round, side, index, projectionContext, options = {}) => `
  <section class="bracket-column ${side} level-${index + 1}">
    <h3>${round.name}</h3>
    <div class="bracket-column-matches">
      ${round.matches.map((match) => renderBracketMatch(match, side, projectionContext, options)).join("")}
    </div>
  </section>
`;

const renderCenterMatch = (label, match, extraClass = "", projectionContext, options = {}) => `
  <section class="center-match-block ${extraClass}">
    <h3>${label}</h3>
    ${renderBracketMatch(match, "center", projectionContext, options)}
  </section>
`;

const renderBracketMatch = (match, side = "", projectionContext = null, options = {}) => {
  const projectedHome = projectionContext?.participants?.[`${match.id}:home`];
  const projectedAway = projectionContext?.participants?.[`${match.id}:away`];
  const home = projectedHome || appData.teams[match.home];
  const away = projectedAway || appData.teams[match.away];
  const simulationMode = options.mode === "simulation";
  const officialMode = options.mode === "official";
  const projectedResult = simulationMode ? projectionContext?.results?.[match.id] : null;
  const displayScore =
    officialMode && !(isFinished(match) || isLive(match))
      ? null
      : projectedResult
        ? { ...projectedResult.score, label: "Simulação", chance: "Simulação", kind: "prediction" }
        : bracketScoreFor(match, home, away);
  const projected = simulationMode && Boolean(home?.projectedFromSlot || away?.projectedFromSlot);

  return `
    <article class="bracket-match ${side}${simulationMode ? " simulated" : ""}${projected ? " projected" : ""}" data-match-id="${match.id}">
      ${simulationMode ? `<span class="simulation-badge">Simulado</span>` : ""}
      ${renderBracketTeam(home, displayScore?.home, simulationMode, { showSlot: officialMode })}
      ${renderBracketTeam(away, displayScore?.away, simulationMode, { showSlot: officialMode })}
      <small>${matchDisplayDay(match)} - ${isFinished(match) ? "Finalizado" : matchDisplayTime(match)}</small>
      ${simulationMode ? renderBracketProbability(home, away) : ""}
    </article>
  `;
};

const probabilityRow = (label, value) => `
  <div class="probability-row">
    <span>${label}</span>
    <span class="probability-track"><span style="width: ${value}%"></span></span>
    <strong>${value}%</strong>
  </div>
`;

const statRow = (label, homeValue, awayValue, suffix = "") => `
  <div class="stat-row">
    <strong>${homeValue}${suffix}</strong>
    <span>${label}</span>
    <strong>${awayValue}${suffix}</strong>
  </div>
`;

const renderPredictionSnapshotCard = (title, prediction, home, away, emptyText = "Sem registro salvo para esse momento.") => {
  if (!prediction) {
    return `
      <article class="details-card prediction-snapshot muted-snapshot">
        <h3>${title}</h3>
        <p>${emptyText}</p>
      </article>
    `;
  }

  const expectedGoals = prediction.expectedGoals
    ? `<small>Gols esperados: ${Number(prediction.expectedGoals.home).toFixed(2)} x ${Number(prediction.expectedGoals.away).toFixed(2)}</small>`
    : "";

  return `
    <article class="details-card prediction-snapshot">
      <h3>${title}</h3>
      <div class="snapshot-score">
        <span>${home.name}</span>
        <strong>${prediction.homeGoals}</strong>
        <em>x</em>
        <strong>${prediction.awayGoals}</strong>
        <span>${away.name}</span>
      </div>
      <div class="snapshot-probabilities">
        <span>${home.name}: ${prediction.homeChance ?? 0}%</span>
        <span>Empate: ${prediction.drawChance ?? 0}%</span>
        <span>${away.name}: ${prediction.awayChance ?? 0}%</span>
      </div>
      ${expectedGoals}
    </article>
  `;
};

const renderDetails = (matchId) => {
  const selectedId = matchId ?? selectedMatchId ?? currentTargetMatch()?.id ?? appData.matches[0]?.id;
  const match = appData.matches.find((item) => item.id === selectedId);
  const container = document.querySelector("#predictionDetails");

  if (!match) {
    container.innerHTML = `
      <article class="details-card">
        <h3>Nenhum jogo carregado</h3>
        <p>O servidor ainda não retornou jogos da Copa.</p>
      </article>
    `;
    return;
  }

  const home = appData.teams[match.home];
  const away = appData.teams[match.away];
  const score = scoreFor(match);

  if (isLive(match)) {
    const initialPrediction = match.initialPrediction || match.latestPrediction;
    const currentPrediction = match.livePrediction || match.prediction;

    container.innerHTML = `
      <article class="details-card live-match-details">
        <h3>${home.name} ${score.home} x ${score.away} ${away.name}</h3>
        <p>${liveIndicator()} <span>${score.label}</span></p>
      </article>
      ${renderPredictionSnapshotCard("Premonição inicial", initialPrediction, home, away, "Sem premonição salva antes do início do jogo.")}
      ${renderPredictionSnapshotCard("Premonição atual", currentPrediction, home, away)}
      ${renderMatchStats(match)}
      ${renderPredictionFactors(home, away)}
      ${renderPlayerHighlights(home)}
      ${renderPlayerHighlights(away)}
    `;
    return;
  }

  if (isFinished(match)) {
    container.innerHTML = `
      <article class="details-card">
        <h3>${home.name} ${score.home} x ${score.away} ${away.name}</h3>
        <p>Jogo finalizado.</p>
      </article>
      ${renderMatchStats(match)}
      ${renderPlayerHighlights(home)}
      ${renderPlayerHighlights(away)}
      <article class="details-card">
        <h3>Impacto no ranking</h3>
        <p><strong>${home.name}:</strong> ${home.lastMatch}</p>
        <p><strong>${away.name}:</strong> ${away.lastMatch}</p>
      </article>
    `;
    return;
  }

  container.innerHTML = `
    <article class="details-card">
      <h3>${home.name} ${score.home} x ${score.away} ${away.name}</h3>
      <p>${match.prediction.reason}</p>
      ${match.prediction.expectedGoals ? `<p><strong>Gols esperados:</strong> ${home.name} ${match.prediction.expectedGoals.home.toFixed(2)} x ${match.prediction.expectedGoals.away.toFixed(2)} ${away.name}</p>` : ""}
    </article>
    ${renderPredictionFactors(home, away)}
    <article class="details-card">
      <h3>Probabilidades</h3>
      <div class="probabilities">
        ${probabilityRow(home.name, match.prediction.homeChance)}
        ${probabilityRow("Empate", match.prediction.drawChance)}
        ${probabilityRow(away.name, match.prediction.awayChance)}
      </div>
    </article>
    <article class="details-card">
      <h3>Base da premonição</h3>
      <p><strong>${home.name}:</strong> peso ${home.weight.toFixed(1)} - ${home.lastMatch}</p>
      <p><strong>${away.name}:</strong> peso ${away.weight.toFixed(1)} - ${away.lastMatch}</p>
    </article>
    ${renderPlayerHighlights(home)}
    ${renderPlayerHighlights(away)}
  `;
};

const renderPredictionFactors = (home, away) => {
  const homeStrength = home.strength || {};
  const awayStrength = away.strength || {};
  const factors = [
    {
      label: "Peso atual",
      home: home.weight,
      away: away.weight,
      suffix: "",
      note: "Força final usada na premonição",
    },
    {
      label: "Base FIFA",
      home: homeStrength.base ?? home.weight,
      away: awayStrength.base ?? away.weight,
      suffix: "",
      note: "Ponto de partida estrutural",
    },
    {
      label: "Forma",
      home: homeStrength.form ?? home.form ?? 0,
      away: awayStrength.form ?? away.form ?? 0,
      suffix: "",
      note: "Pontos, saldo e volume ofensivo na Copa",
    },
    {
      label: "Ataque",
      home: homeStrength.attack ?? home.attack ?? 1,
      away: awayStrength.attack ?? away.attack ?? 1,
      suffix: "",
      note: "Gols, chutes, xG quando disponível e jogadores ofensivos",
    },
    {
      label: "Defesa",
      home: homeStrength.defense ?? home.defense ?? 1,
      away: awayStrength.defense ?? away.defense ?? 1,
      suffix: "",
      note: "Gols sofridos, posse, cortes, desarmes e goleiro",
    },
    {
      label: "Jogadores",
      home: homeStrength.players ?? home.playerImpact ?? 0,
      away: awayStrength.players ?? away.playerImpact ?? 0,
      suffix: "",
      note: "Média dos principais jogadores e impacto individual",
    },
    {
      label: "Adversarios",
      home: homeStrength.opponents ?? 0,
      away: awayStrength.opponents ?? 0,
      suffix: "",
      note: "Valor extra por desempenho contra seleções fortes",
    },
  ];

  return `
    <article class="details-card">
      <h3>Por que essa premonição?</h3>
      <div class="factor-list">
        ${factors.map((factor) => renderFactorRow(factor, home.name, away.name)).join("")}
      </div>
    </article>
  `;
};

const renderFactorRow = (factor, homeName, awayName) => {
  const home = Number(factor.home || 0);
  const away = Number(factor.away || 0);
  const lowest = Math.min(home, away, 0);
  const adjustedHome = home - lowest + 0.1;
  const adjustedAway = away - lowest + 0.1;
  const total = adjustedHome + adjustedAway || 1;
  const homeWidth = Math.max(12, Math.round((adjustedHome / total) * 100));
  const awayWidth = Math.max(12, Math.round((adjustedAway / total) * 100));
  const leader = home === away ? "equilibrado" : home > away ? homeName : awayName;

  return `
    <div class="factor-row">
      <div class="factor-head">
        <strong>${factor.label}</strong>
        <span>Vantagem: ${leader}</span>
      </div>
      <div class="factor-bars">
        <span class="factor-bar home ${home < 0 ? "negative" : ""}" style="width: ${homeWidth}%">
          ${homeName}: ${formatFactorValue(home)}
        </span>
        <span class="factor-bar away ${away < 0 ? "negative" : ""}" style="width: ${awayWidth}%">
          ${awayName}: ${formatFactorValue(away)}
        </span>
      </div>
      <small>${factor.note}</small>
    </div>
  `;
};

const formatFactorValue = (value) => {
  const fixed = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
  return value > 0 ? `+${fixed}` : fixed;
};

const renderMatchStats = (match) => {
  const homeStats = match.stats?.home;
  const awayStats = match.stats?.away;
  if (!homeStats || !awayStats) return "";

  return `
    <article class="details-card">
      <h3>Estatísticas reais</h3>
      <div class="match-stats">
        ${statRow("Chutes", homeStats.shots, awayStats.shots)}
        ${statRow("Chutes no gol", homeStats.shotsOnTarget, awayStats.shotsOnTarget)}
        ${statRow("Posse", homeStats.possession, awayStats.possession, "%")}
        ${statRow("Cantos", homeStats.corners, awayStats.corners)}
        ${statRow("Faltas", homeStats.fouls, awayStats.fouls)}
      </div>
    </article>
  `;
};

const renderPlayerHighlights = (team) => {
  if (!team.playerHighlights?.length) return "";

  const highlights = team.playerHighlights
    .map((item) => `<li>${item.player}: ${item.value} em ${item.metric}</li>`)
    .join("");

  return `
    <article class="details-card">
      <h3>Destaques individuais - ${team.name}</h3>
      <ul class="player-highlights">${highlights}</ul>
    </article>
  `;
};

const renderApp = () => {
  renderWeights();
  renderGroups();
  renderPredictionStats();
  renderMatches();
  renderKnockoutBracket();
  renderSimulation();
  renderDetails();
};

const loadBackendData = async ({ preserveSelection = false, silent = false } = {}) => {
  const previousSelectedMatchId = selectedMatchId;

  if (!silent) {
    setDataStatus("Atualizando dados reais da Copa...");
  }

  try {
    const response = await fetch(endpointFor("/api/worldcup"));
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Backend não conseguiu carregar a API.");
    }

    appData = data;
    selectedMatchId =
      preserveSelection && data.matches?.some((match) => String(match.id) === String(previousSelectedMatchId))
        ? previousSelectedMatchId
        : null;
    await loadPredictionHistory();
    await loadHealthData();
    renderApp();
    loadSimulationData({ silent });

    if (!silent) {
      setDataStatus("Dados atualizados.", "ok");
      requestAnimationFrame(scrollToCurrentMatch);
    }
  } catch (error) {
    if (silent) {
      console.warn(error);
      return;
    }

    appData = fallbackData;
    selectedMatchId = null;
    renderApp();
    setDataStatus(`${error.message} Usando dados locais temporários.`, "error");
  }
};

const loadSimulationData = async ({ silent = false } = {}) => {
  if (simulationLoading) return;

  simulationLoading = !silent;
  if (!silent) {
    simulationError = "";
    renderSimulation();
  }

  try {
    const response = await fetch(endpointFor("/api/simulation"));
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Backend não conseguiu calcular a simulação.");
    }

    simulationData = data;
    simulationError = "";
  } catch (error) {
    if (!silent) {
      simulationData = null;
      simulationError = error.message || "Simulação indisponível.";
    }
    console.warn(error);
  } finally {
    simulationLoading = false;
    renderSimulation();
  }
};

const loadPredictionHistory = async () => {
  try {
    const response = await fetch(endpointFor("/api/prediction-history"));
    if (!response.ok) throw new Error("Histórico indisponível.");
    predictionHistory = await response.json();
  } catch (error) {
    predictionHistory = {
      total: 0,
      evaluated: 0,
      awaitingResult: 0,
      resultWithoutPrediction: 0,
      summary: { exactScore: 0, winner: 0, draw: 0, direction: 0 },
      probabilityBuckets: [],
      accuracyByGameType: [],
      modelVersions: [],
      matches: [],
    };
  }
};

const loadHealthData = async () => {
  try {
    const response = await fetch(endpointFor("/api/health"));
    if (!response.ok) throw new Error("Saúde do backend indisponível.");
    systemHealth = await response.json();
  } catch (error) {
    systemHealth = null;
  }
};

document.querySelectorAll("[data-screen-target]").forEach((button) => {
  button.addEventListener("click", () => {
    showScreen(button.dataset.screenTarget);
    if (button.dataset.screenTarget === "matches") {
      requestAnimationFrame(scrollToCurrentMatch);
    } else if (button.dataset.screenTarget === "weights") {
      requestAnimationFrame(scrollToTop);
    } else if (button.dataset.screenTarget === "groups") {
      requestAnimationFrame(scrollToTop);
    } else if (button.dataset.screenTarget === "simulation") {
      renderSimulation();
      requestAnimationFrame(scrollToTop);
    } else if (button.dataset.screenTarget === "stats") {
      requestAnimationFrame(scrollToTop);
    }
  });
});

document.querySelectorAll("[data-games-view]").forEach((button) => {
  button.addEventListener("click", () => {
    gamesView = button.dataset.gamesView;
    document.querySelectorAll("[data-games-view]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".games-view").forEach((view) => view.classList.toggle("active", view.id === `${gamesView === "groups" ? "groupStage" : "knockout"}View`));

    if (gamesView === "groups") {
      renderMatches();
      requestAnimationFrame(scrollToCurrentMatch);
    } else {
      renderKnockoutBracket();
      requestAnimationFrame(scrollToTop);
    }
  });
});

document.querySelectorAll("[data-simulation-view]").forEach((button) => {
  button.addEventListener("click", () => {
    simulationView = button.dataset.simulationView;
    document.querySelectorAll("[data-simulation-view]").forEach((item) => item.classList.toggle("active", item === button));
    renderSimulation();
    requestAnimationFrame(scrollToTop);
  });
});

document.querySelector("#teamPlayersModal")?.addEventListener("click", (event) => {
  if (event.target.id === "teamPlayersModal" || event.target.closest("[data-close-team-modal]")) {
    closeTeamPlayersModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTeamPlayersModal();
  }
});

loadBackendData();
setInterval(() => loadBackendData({ preserveSelection: true, silent: true }), DATA_REFRESH_MS);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error) => console.warn(error));
  });
}
