let appData = null;
let selectedMatchId = null;
let selectedTeamKey = null;
let predictionHistory = null;
let gamesView = "groups";
const DATA_REFRESH_MS = 1000 * 60 * 2;

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

const fallbackData = {
  source: "fallback",
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

const sameCalendarDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const matchDate = (match) => (match?.timestamp ? new Date(match.timestamp * 1000) : null);

const matchDisplayDay = (match) => {
  const date = matchDate(match);
  if (!date) return match.day || "";

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (sameCalendarDay(date, today)) return "Hoje";
  if (sameCalendarDay(date, tomorrow)) return "Amanhã";

  return new Intl.DateTimeFormat("pt-BR", {
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const currentTargetMatch = () => {
  const datedMatches = appData.matches.filter((match) => match.timestamp && isGroupStageMatch(match));
  if (!datedMatches.length) return appData.matches[0];

  const now = new Date();
  const todayMatches = datedMatches.filter((match) => sameCalendarDay(new Date(match.timestamp * 1000), now));
  const liveMatch = todayMatches.find(isLive);
  if (liveMatch) return liveMatch;

  const nextTodayMatch = todayMatches.find((match) => new Date(match.timestamp * 1000) >= now);
  if (nextTodayMatch) return nextTodayMatch;

  const lastTodayMatch = todayMatches[todayMatches.length - 1];
  if (lastTodayMatch) return lastTodayMatch;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const nextMatch = datedMatches.find((match) => new Date(match.timestamp * 1000) >= todayStart);

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
  const players = team.players || [];

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
            <td class="team-cell">
              <span class="standing-position">${team.position}</span>
              ${teamMark(team)}
              <span>${team.name}</span>
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
    <section class="details-card">
      <h3>Últimas avaliações</h3>
      ${evaluatedMatches.length ? renderEvaluatedMatches(evaluatedMatches) : "<p>Nenhum jogo com premonição anterior foi finalizado ainda.</p>"}
    </section>
    ${renderCalibration(predictionHistory.calibration)}
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

const predictionForEvaluation = (match) => match?.evaluatedPrediction || match?.latestPrediction || match?.initialPrediction || null;

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
  const round32 = rounds.find((round) => round.key === "round32")?.matches || [];
  const round16 = rounds.find((round) => round.key === "round16")?.matches || [];
  const quarters = rounds.find((round) => round.key === "quarterfinal")?.matches || [];
  const semis = rounds.find((round) => round.key === "semifinal")?.matches || [];
  const thirdPlace = rounds.find((round) => round.key === "thirdPlace")?.matches?.[0];
  const final = rounds.find((round) => round.key === "Final")?.matches?.[0];

  const leftRounds = [
    { name: "16 avos de final", matches: round32.slice(0, 8) },
    { name: "Oitavas de final", matches: round16.slice(0, 4) },
    { name: "Quartas de final", matches: quarters.slice(0, 2) },
    { name: "Semifinal", matches: semis.slice(0, 1) },
  ];
  const rightRounds = [
    { name: "Semifinal", matches: semis.slice(1, 2) },
    { name: "Quartas de final", matches: quarters.slice(2, 4) },
    { name: "Oitavas de final", matches: round16.slice(4, 8) },
    { name: "16 avos de final", matches: round32.slice(8, 16) },
  ];

  container.innerHTML = `
    <div class="bracket-instructions">Clique em um confronto para ver a premonição.</div>
    <div class="bracket-scroll">
      <div class="bracket-board bracket-board-split">
        <div class="bracket-wing left-wing">
          ${leftRounds.map((round, index) => renderBracketColumn(round, "left", index)).join("")}
        </div>
        <div class="bracket-center">
          <div class="center-main">
            ${final ? renderCenterMatch("Final", final, "final-match") : ""}
          </div>
          ${thirdPlace ? renderCenterMatch("3º lugar", thirdPlace, "third-place-match") : ""}
        </div>
        <div class="bracket-wing right-wing">
          ${rightRounds.map((round, index) => renderBracketColumn(round, "right", index)).join("")}
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll(".bracket-match").forEach((card) => {
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

const renderBracketColumn = (round, side, index) => `
  <section class="bracket-column ${side} level-${index + 1}">
    <h3>${round.name}</h3>
    <div class="bracket-column-matches">
      ${round.matches.map((match) => renderBracketMatch(match, side)).join("")}
    </div>
  </section>
`;

const renderCenterMatch = (label, match, extraClass = "") => `
  <section class="center-match-block ${extraClass}">
    <h3>${label}</h3>
    ${renderBracketMatch(match, "center")}
  </section>
`;

const renderBracketMatch = (match, side = "") => {
  const home = appData.teams[match.home];
  const away = appData.teams[match.away];
  const score = scoreFor(match);

  return `
    <article class="bracket-match ${side}" data-match-id="${match.id}">
      <div class="bracket-team">
        ${teamMark(home)}
        <span>${home.name}</span>
        <strong>${score.home}</strong>
      </div>
      <div class="bracket-team">
        ${teamMark(away)}
        <span>${away.name}</span>
        <strong>${score.away}</strong>
      </div>
      <small>${matchDisplayDay(match)} - ${isFinished(match) ? "Finalizado" : matchDisplayTime(match)}</small>
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
    renderApp();

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
      matches: [],
    };
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
