let appData = null;
let selectedMatchId = null;

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

const renderWeights = () => {
  const container = document.querySelector("#teamWeights");
  const teams = Object.values(appData.teams)
    .filter((team) => !team.placeholder)
    .sort((a, b) => b.weight - a.weight)
    .map((team, index) => {
      return `
        <article class="weight-row">
          <div class="weight-rank">${index + 1}</div>
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

  container.innerHTML = teams;
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

const renderMatches = () => {
  const container = document.querySelector("#matchGrid");
  const targetMatch = currentTargetMatch();
  const activeDay = targetMatch?.day;
  const matchesByDay = appData.matches.reduce((days, match) => {
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
  renderMatches();
  renderDetails();
};

const loadBackendData = async () => {
  setDataStatus("Atualizando dados reais da Copa...");

  try {
    const endpoint = window.location.protocol === "file:" ? "http://127.0.0.1:3000/api/worldcup" : "/api/worldcup";
    const response = await fetch(endpoint);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Backend nao conseguiu carregar a API.");
    }

    appData = data;
    selectedMatchId = data.matches[0]?.id ?? null;
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

document.querySelectorAll("[data-screen-target]").forEach((button) => {
  button.addEventListener("click", () => {
    showScreen(button.dataset.screenTarget);
    if (button.dataset.screenTarget === "matches") {
      requestAnimationFrame(scrollToCurrentMatch);
    } else if (button.dataset.screenTarget === "weights") {
      requestAnimationFrame(scrollToTop);
    } else if (button.dataset.screenTarget === "groups") {
      requestAnimationFrame(scrollToTop);
    }
  });
});

loadBackendData();
