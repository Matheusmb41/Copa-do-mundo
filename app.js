let appData = null;
let selectedMatchId = null;
let predictionHistory = null;
let matchFilter = "current";

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
      lastMatch: "Dados locais temporarios ate o backend carregar a API.",
    },
    congo: {
      name: "RD Congo",
      logo: "",
      fifaRank: 60,
      weight: 51.9,
      form: 0.5,
      lastMatch: "Dados locais temporarios ate o backend carregar a API.",
    },
    england: {
      name: "Inglaterra",
      logo: "",
      fifaRank: 4,
      weight: 83.7,
      form: 2.2,
      lastMatch: "Dados locais temporarios ate o backend carregar a API.",
    },
    croatia: {
      name: "Croacia",
      logo: "",
      fifaRank: 10,
      weight: 70.6,
      form: 0.2,
      lastMatch: "Dados locais temporarios ate o backend carregar a API.",
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
  if (team?.logo) {
    return `<img class="team-logo" src="${team.logo}" alt="" />`;
  }

  return `<span class="flag"></span>`;
};

const isFinished = (match) => ["FT", "AET", "PEN"].includes(match.status);
const isLive = (match) => match.status === "LIVE";

const scoreFor = (match) => {
  if (isFinished(match) && match.actualScore) {
    return {
      home: match.actualScore.home,
      away: match.actualScore.away,
      label: "Final",
      chance: "Placar",
    };
  }

  return {
    home: match.prediction?.homeGoals ?? "-",
    away: match.prediction?.awayGoals ?? "-",
    label: "Premonicao",
    chance: `${match.prediction?.favoriteChance ?? 0}%`,
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

const currentTargetMatch = () => {
  const datedMatches = appData.matches.filter((match) => match.timestamp);
  if (!datedMatches.length) return appData.matches[0];

  const now = new Date();
  const todayMatches = datedMatches.filter((match) => sameCalendarDay(new Date(match.timestamp * 1000), now));
  const liveMatch = todayMatches.find((match) => match.status === "LIVE");
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
  const teams = Object.values(appData.teams)
    .filter((team) => !team.placeholder)
    .sort((a, b) => b.weight - a.weight);

  const midpoint = Math.ceil(teams.length / 2);
  const columns = [teams.slice(0, midpoint), teams.slice(midpoint)];

  const rows = columns
    .map((column, columnIndex) => {
      const columnRows = column
        .map((team, index) => {
          const rank = columnIndex === 0 ? index + 1 : midpoint + index + 1;
          return `
            <article class="weight-row">
              <div class="weight-rank">
                <span>${rank}</span>
                ${rankingMovement(team)}
              </div>
              <div class="weight-name">
                ${teamMark(team)}
                <strong>${team.name}</strong>
              </div>
              <span class="weight-value">${team.weight.toFixed(1)}</span>
              <div class="weight-meta">Ranking FIFA #${team.fifaRank} - forma ${team.form >= 0 ? "+" : ""}${team.form}</div>
            </article>
          `;
        })
        .join("");

      return `
        <div class="weight-column">${columnRows}</div>
      `;
    })
    .join("");

  container.innerHTML = rows;
};

const rankingMovement = (team) => {
  if (!team.previousPosition || team.positionDelta === 0) {
    return `<small class="rank-move same">=</small>`;
  }

  const direction = team.positionDelta > 0 ? "up" : "down";
  const signal = team.positionDelta > 0 ? "+" : "-";
  const label = team.positionDelta > 0 ? `subiu ${team.positionDelta}` : `caiu ${Math.abs(team.positionDelta)}`;

  return `<small class="rank-move ${direction}" title="Antes do ultimo jogo: ${team.previousPosition}o lugar">${signal} ${Math.abs(team.positionDelta)}<span>${label}</span></small>`;
};

const renderGroups = () => {
  const container = document.querySelector("#groupsGrid");
  if (!container) return;

  const groups = appData.groups || [];
  if (!groups.length) {
    container.innerHTML = `
      <article class="details-card">
        <h3>Grupos indisponiveis</h3>
        <p>A fonte ainda nao retornou jogos com identificacao de grupo.</p>
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
              ${team.logo ? `<img class="team-logo" src="${team.logo}" alt="" />` : ""}
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
        <h3>Historico carregando</h3>
        <p>As estatisticas aparecem quando o backend devolver o historico das premonicoes.</p>
      </article>
    `;
    return;
  }

  const { total, evaluated, awaitingResult, resultWithoutPrediction, summary, matches } = predictionHistory;
  const evaluatedMatches = (matches || []).filter((match) => match.evaluation).slice(-8).reverse();

  container.innerHTML = `
    <section class="stats-overview">
      ${statCard("Premonicoes guardadas", total)}
      ${statCard("Avaliadas", evaluated)}
      ${statCard("Aguardando resultado", awaitingResult)}
      ${statCard("Sem previsao anterior", resultWithoutPrediction)}
    </section>
    <section class="accuracy-grid">
      ${accuracyCard("Placar exato", summary.exactScore, evaluated)}
      ${accuracyCard("Direcao correta", summary.direction, evaluated)}
      ${accuracyCard("Vencedor", summary.winner, evaluated)}
      ${accuracyCard("Empate", summary.draw, evaluated)}
    </section>
    <section class="details-card">
      <h3>Ultimas avaliacoes</h3>
      ${evaluatedMatches.length ? renderEvaluatedMatches(evaluatedMatches) : "<p>Nenhum jogo com premonicao anterior foi finalizado ainda.</p>"}
    </section>
  `;
};

const statCard = (label, value) => `
  <article class="stat-card">
    <strong>${value ?? 0}</strong>
    <span>${label}</span>
  </article>
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
          <span>Premonicao: ${match.initialPrediction.homeGoals}-${match.initialPrediction.awayGoals}</span>
          <span>Placar: ${match.result.homeGoals}-${match.result.awayGoals}</span>
          <small>${match.evaluation.exactScore ? "Placar exato" : match.evaluation.direction ? "Direcao correta" : "Errou direcao"}</small>
        </article>
      `)
      .join("")}
  </div>
`;

const renderMatches = () => {
  const container = document.querySelector("#matchGrid");
  const targetMatch = currentTargetMatch();
  const activeDay = targetMatch?.day;
  const visibleMatches = filteredMatches(targetMatch);

  if (!visibleMatches.length) {
    container.innerHTML = `
      <article class="details-card match-empty">
        <h3>Nenhum jogo neste filtro</h3>
        <p>Use outro filtro para ver mais confrontos.</p>
      </article>
    `;
    return;
  }

  const matchesByDay = visibleMatches.reduce((days, match) => {
    days[match.day] = days[match.day] || [];
    days[match.day].push(match);
    return days;
  }, {});

  container.innerHTML = Object.entries(matchesByDay)
    .map(([day, dayMatches], dayIndex) => {
      const cards = dayMatches
        .map((match, matchIndex) => {
          const home = appData.teams[match.home];
          const away = appData.teams[match.away];
          const score = scoreFor(match);
          const active = (selectedMatchId ?? appData.matches[0]?.id) === match.id;
          const initialActive = selectedMatchId === null && dayIndex === 0 && matchIndex === 0;

          return `
            <article class="match-card${active || initialActive ? " active" : ""}" data-match-id="${match.id}" data-current-match="${match.id === targetMatch?.id}">
              <div class="chance-pill ${isFinished(match) ? "real" : ""}">${score.chance}</div>
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
                <span>${isFinished(match) ? "Finalizado" : `${match.time} - ${score.label}`}</span>
                <span class="confidence-bar" title="Confianca da premonicao">
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

const filteredMatches = (targetMatch) => {
  const now = new Date();
  const today = (match) => match.timestamp && sameCalendarDay(new Date(match.timestamp * 1000), now);

  if (matchFilter === "today") {
    return appData.matches.filter(today);
  }

  if (matchFilter === "live") {
    return appData.matches.filter(isLive);
  }

  if (matchFilter === "next") {
    return appData.matches.filter((match) => !isFinished(match) && new Date(match.timestamp * 1000) >= now);
  }

  if (matchFilter === "current") {
    if (!targetMatch) return appData.matches;
    return appData.matches.filter((match) => match.day === targetMatch.day);
  }

  return appData.matches;
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

const renderDetails = (matchId) => {
  const selectedId = matchId ?? selectedMatchId ?? appData.matches[0]?.id;
  const match = appData.matches.find((item) => item.id === selectedId);
  const container = document.querySelector("#predictionDetails");

  if (!match) {
    container.innerHTML = `
      <article class="details-card">
        <h3>Nenhum jogo carregado</h3>
        <p>O backend ainda nao retornou jogos da Copa.</p>
      </article>
    `;
    return;
  }

  const home = appData.teams[match.home];
  const away = appData.teams[match.away];
  const score = scoreFor(match);

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
      <h3>Base da premonicao</h3>
      <p><strong>${home.name}:</strong> peso ${home.weight.toFixed(1)} - ${home.lastMatch}</p>
      <p><strong>${away.name}:</strong> peso ${away.weight.toFixed(1)} - ${away.lastMatch}</p>
    </article>
    ${renderPlayerHighlights(home)}
    ${renderPlayerHighlights(away)}
  `;
};

const renderPredictionFactors = (home, away) => {
  const factors = [
    {
      label: "Peso atual",
      home: home.weight,
      away: away.weight,
      suffix: "",
      note: "Ranking + desempenho + jogadores",
    },
    {
      label: "Forma",
      home: home.form || 0,
      away: away.form || 0,
      suffix: "",
      note: "Pontos, saldo e volume recente",
    },
    {
      label: "Ataque",
      home: home.attack || 1,
      away: away.attack || 1,
      suffix: "",
      note: "Gols, remates e impacto ofensivo",
    },
    {
      label: "Jogadores",
      home: home.playerImpact || 0,
      away: away.playerImpact || 0,
      suffix: "",
      note: "Destaques individuais",
    },
  ];

  return `
    <article class="details-card">
      <h3>Por que essa premonicao?</h3>
      <div class="factor-list">
        ${factors.map((factor) => renderFactorRow(factor, home.name, away.name)).join("")}
      </div>
    </article>
  `;
};

const renderFactorRow = (factor, homeName, awayName) => {
  const home = Number(factor.home || 0);
  const away = Number(factor.away || 0);
  const total = Math.abs(home) + Math.abs(away) || 1;
  const homeWidth = Math.max(8, Math.round((Math.abs(home) / total) * 100));
  const awayWidth = Math.max(8, Math.round((Math.abs(away) / total) * 100));
  const leader = home === away ? "equilibrado" : home > away ? homeName : awayName;

  return `
    <div class="factor-row">
      <div class="factor-head">
        <strong>${factor.label}</strong>
        <span>${leader}</span>
      </div>
      <div class="factor-bars">
        <span class="factor-bar home" style="width: ${homeWidth}%">${formatFactorValue(home)}</span>
        <span class="factor-bar away" style="width: ${awayWidth}%">${formatFactorValue(away)}</span>
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
      <h3>Estatisticas reais</h3>
      <div class="match-stats">
        ${statRow("Remates", homeStats.shots, awayStats.shots)}
        ${statRow("Remates a baliza", homeStats.shotsOnTarget, awayStats.shotsOnTarget)}
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
  renderDetails();
};

const loadBackendData = async () => {
  setDataStatus("Atualizando dados reais da Copa...");

  try {
    const response = await fetch(endpointFor("/api/worldcup"));
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Backend nao conseguiu carregar a API.");
    }

    appData = data;
    selectedMatchId = data.matches[0]?.id ?? null;
    await loadPredictionHistory();
    renderApp();
    setDataStatus("Dados atualizados.", "ok");
    requestAnimationFrame(scrollToCurrentMatch);
  } catch (error) {
    appData = fallbackData;
    selectedMatchId = fallbackData.matches[0]?.id ?? null;
    renderApp();
    setDataStatus(`${error.message} Usando dados locais temporarios.`, "error");
  }
};

const loadPredictionHistory = async () => {
  try {
    const response = await fetch(endpointFor("/api/prediction-history"));
    if (!response.ok) throw new Error("Historico indisponivel.");
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

document.querySelectorAll("[data-match-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    matchFilter = button.dataset.matchFilter;
    document.querySelectorAll("[data-match-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderMatches();
    requestAnimationFrame(scrollToCurrentMatch);
  });
});

loadBackendData();
