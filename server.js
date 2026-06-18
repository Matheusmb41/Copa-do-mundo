const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const HISTORY_FILE = path.join(DATA_DIR, "prediction-history.json");
const API_BASE_URL = "https://v3.football.api-sports.io";
const ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_SEASON = Number(process.env.WORLD_CUP_SEASON || 2026);
const CACHE_MS = Number(process.env.API_CACHE_MS || 1000 * 60 * 10);
const PLAYER_SUMMARY_LIMIT = Number(process.env.PLAYER_SUMMARY_LIMIT || 32);

loadEnvFile();

let cache = {
  expiresAt: 0,
  data: null,
};

let predictionHistory = loadPredictionHistory();

const fifaRankingSeed = {
  argentina: 1,
  france: 2,
  brazil: 5,
  brasil: 5,
  portugal: 6,
  england: 4,
  inglaterra: 4,
  netherlands: 7,
  "paises baixos": 7,
  spain: 8,
  espanha: 8,
  italy: 9,
  italia: 9,
  croatia: 10,
  croacia: 10,
  germany: 16,
  alemanha: 16,
  uruguay: 11,
  uruguai: 11,
  belgium: 3,
  belgica: 3,
  colombia: 13,
  switzerland: 19,
  suica: 19,
  mexico: 14,
  "south korea": 23,
  "coreia do sul": 23,
  panama: 35,
  canada: 49,
  qatar: 53,
  catar: 53,
  "south africa": 56,
  "africa do sul": 56,
  uzbekistan: 58,
  uzbequistao: 58,
  "dr congo": 60,
  "rd congo": 60,
  ghana: 67,
  gana: 67,
  "bosnia and herzegovina": 70,
  "bosnia e herzegovina": 70,
  czechia: 39,
  tchequia: 39,
  usa: 15,
  "united states": 15,
  "estados unidos": 15,
};

const teamNamePtBr = {
  Argentina: "Argentina",
  Australia: "Australia",
  Austria: "Austria",
  Belgium: "Belgica",
  Brazil: "Brasil",
  Canada: "Canada",
  Colombia: "Colombia",
  Croatia: "Croacia",
  Czechia: "Tchequia",
  Denmark: "Dinamarca",
  Ecuador: "Equador",
  England: "Inglaterra",
  France: "Franca",
  Germany: "Alemanha",
  Ghana: "Gana",
  Iran: "Ira",
  Italy: "Italia",
  Japan: "Japao",
  Mexico: "Mexico",
  Morocco: "Marrocos",
  Netherlands: "Paises Baixos",
  "New Zealand": "Nova Zelandia",
  Norway: "Noruega",
  Panama: "Panama",
  Paraguay: "Paraguai",
  Portugal: "Portugal",
  Qatar: "Catar",
  "Saudi Arabia": "Arabia Saudita",
  Scotland: "Escocia",
  Senegal: "Senegal",
  Serbia: "Servia",
  "South Africa": "Africa do Sul",
  "South Korea": "Coreia do Sul",
  Spain: "Espanha",
  Switzerland: "Suica",
  Tunisia: "Tunisia",
  Uruguay: "Uruguai",
  USA: "Estados Unidos",
  "United States": "Estados Unidos",
  Uzbekistan: "Uzbequistao",
  "Bosnia and Herzegovina": "Bosnia e Herzegovina",
  "Bosnia-Herzegovina": "Bosnia e Herzegovina",
  "Congo DR": "RD Congo",
  "DR Congo": "RD Congo",
  "Cape Verde Islands": "Cabo Verde",
  "Ivory Coast": "Costa do Marfim",
  "Republic of Ireland": "Republica da Irlanda",
  "United Arab Emirates": "Emirados Arabes Unidos",
};

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getSeedRank(name, fallback = 75) {
  return fifaRankingSeed[normalizeName(name)] || fallback;
}

function translateTeamName(name) {
  const winnerGroup = /^Winner Group ([A-Z])$/i.exec(name);
  if (winnerGroup) return `Vencedor do Grupo ${winnerGroup[1].toUpperCase()}`;

  const runnerUpGroup = /^Runner-up Group ([A-Z])$/i.exec(name);
  if (runnerUpGroup) return `2o lugar do Grupo ${runnerUpGroup[1].toUpperCase()}`;

  return teamNamePtBr[name] || name;
}

function rankingWeight(rank) {
  return Math.max(48, 100 - Math.log(rank + 1) * 12.8);
}

function currentWeight(team) {
  const base = rankingWeight(team.fifaRank);
  const profile = (team.attack + team.defense - 2) * 9;
  const playerImpact = team.playerImpact || 0;
  return Number((base + team.form * 2.8 + profile + playerImpact).toFixed(1));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function predictMatch(match, teams) {
  const home = teams[match.home];
  const away = teams[match.away];
  const homeWeight = currentWeight(home);
  const awayWeight = currentWeight(away);
  const diff = homeWeight - awayWeight;
  const drawChance = clamp(27 - Math.abs(diff) * 0.55, 9, 29);
  const homeChance = clamp((100 - drawChance) / 2 + diff * 1.15, 7, 84);
  const awayChance = 100 - drawChance - homeChance;
  const homeGoals = clamp(Math.round(1.15 + diff / 18 + (home.attack - away.defense) * 1.6), 0, 5);
  const awayGoals = clamp(Math.round(1.05 - diff / 20 + (away.attack - home.defense) * 1.5), 0, 5);
  const favoriteChance = Math.round(Math.max(homeChance, awayChance));
  const confidence = clamp(Math.round(45 + Math.abs(diff) * 1.35), 42, 88);

  return {
    homeGoals,
    awayGoals,
    homeChance: Math.round(homeChance),
    drawChance: Math.round(drawChance),
    awayChance: Math.round(awayChance),
    favoriteChance,
    confidence,
    reason: buildReason(home, away, diff, homeWeight, awayWeight),
  };
}

function buildReason(home, away, diff, homeWeight, awayWeight) {
  const gap = Math.abs(diff).toFixed(1);
  const stronger = diff >= 0 ? home : away;
  const weaker = diff >= 0 ? away : home;

  if (Math.abs(diff) < 4) {
    return `Jogo equilibrado: ${home.name} tem peso ${homeWeight} e ${away.name} tem peso ${awayWeight}. A premonicao preserva chance relevante de empate porque o ranking e a forma atual nao abriram distancia grande.`;
  }

  return `${stronger.name} aparece acima por ${gap} pontos de peso contra ${weaker.name}. O modelo combina ranking FIFA, desempenho na Copa e perfil ataque/defesa para transformar essa vantagem em placar simples.`;
}

function isFinished(status) {
  return ["FT", "AET", "PEN"].includes(status);
}

function formatMatchDay(isoDate) {
  const date = new Date(isoDate);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Hoje";
  if (sameDay(date, tomorrow)) return "Amanha";

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
    .format(date)
    .replace(".", "");
}

function formatMatchTime(isoDate, status) {
  if (isFinished(status?.short)) return "Finalizado";
  if (["1H", "2H", "HT", "ET", "P"].includes(status?.short)) return "Ao vivo";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

async function apiRequest(pathname) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY nao configurada no backend.");
  }

  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-FOOTBALL respondeu com status ${response.status}.`);
  }

  const data = await response.json();
  if (data.errors && Object.keys(data.errors).length) {
    throw new Error(JSON.stringify(data.errors));
  }

  return data.response || [];
}

async function espnRequest(pathname) {
  const response = await fetch(`${ESPN_BASE_URL}${pathname}`);

  if (!response.ok) {
    throw new Error(`ESPN respondeu com status ${response.status}.`);
  }

  return response.json();
}

async function findWorldCupLeague(season) {
  const leagues = await apiRequest(`/leagues?search=World%20Cup&season=${season}`);
  const exact = leagues.find((item) => normalizeName(item.league.name) === "world cup");
  const loose = leagues.find((item) => normalizeName(item.league.name).includes("world cup"));
  const selected = exact || loose;

  if (!selected) {
    throw new Error(`Nao encontrei World Cup na temporada ${season}.`);
  }

  return selected.league.id;
}

function ensureTeam(teams, apiTeam, standingsTeam) {
  const key = `api_${apiTeam.id}`;
  const existing = teams[key];
  const rankFallback = standingsTeam?.rank ? 40 + standingsTeam.rank * 2 : 75;

  teams[key] = {
    name: apiTeam.name,
    logo: apiTeam.logo || existing?.logo || "",
    fifaRank: existing?.fifaRank || getSeedRank(apiTeam.name, rankFallback),
    form: existing?.form || 0,
    attack: existing?.attack || 1,
    defense: existing?.defense || 1,
    lastMatch: existing?.lastMatch || "Aguardando dados de desempenho na Copa.",
  };

  return key;
}

function applyStandings(teams, standingsResponse) {
  const rows = standingsResponse[0]?.league?.standings?.flat() || [];

  rows.forEach((row) => {
    const key = ensureTeam(teams, row.team, row);
    const played = row.all?.played || 0;
    const goalsFor = row.all?.goals?.for || 0;
    const goalsAgainst = row.all?.goals?.against || 0;
    const goalDiff = goalsFor - goalsAgainst;
    const pointsFactor = played ? row.points / played : 0;

    teams[key] = {
      ...teams[key],
      form: Number((pointsFactor * 0.8 + goalDiff * 0.22).toFixed(2)),
      attack: Number((1 + goalsFor * 0.04).toFixed(2)),
      defense: Number((1 - goalsAgainst * 0.035).toFixed(2)),
      lastMatch: `Grupo: ${row.group || "Copa"} - ${row.points} pts, saldo ${goalDiff}.`,
    };
  });
}

async function buildWorldCupPayload() {
  const now = Date.now();
  if (cache.data && cache.expiresAt > now) {
    return cache.data;
  }

  try {
    const payload = await buildEspnWorldCupPayload();
    cache = {
      expiresAt: now + CACHE_MS,
      data: payload,
    };
    return payload;
  } catch (error) {
    if (!process.env.API_FOOTBALL_KEY) {
      throw error;
    }
  }

  const season = DEFAULT_SEASON;
  const leagueId = await findWorldCupLeague(season);
  const [fixtures, standings] = await Promise.all([
    apiRequest(`/fixtures?league=${leagueId}&season=${season}`),
    apiRequest(`/standings?league=${leagueId}&season=${season}`),
  ]);

  const teams = {};
  applyStandings(teams, standings);

  const matches = fixtures
    .slice()
    .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
    .map((fixture) => {
      const home = ensureTeam(teams, fixture.teams.home);
      const away = ensureTeam(teams, fixture.teams.away);
      const status = fixture.fixture.status?.short || "NS";
      const match = {
        id: fixture.fixture.id,
        group: fixture.league.round || "Fase de grupos",
        day: formatMatchDay(fixture.fixture.date),
        time: formatMatchTime(fixture.fixture.date, fixture.fixture.status),
        timestamp: fixture.fixture.timestamp,
        status,
        home,
        away,
        actualScore: isFinished(status)
          ? {
              home: fixture.goals.home,
              away: fixture.goals.away,
            }
          : null,
      };

      match.prediction = isFinished(status) ? null : predictMatch(match, teams);
      return match;
    });

  Object.values(teams).forEach((team) => {
    team.weight = currentWeight(team);
  });

  const payload = {
    source: "api-football",
    season,
    updatedAt: new Date().toISOString(),
    teams,
    matches,
  };

  cache = {
    expiresAt: now + CACHE_MS,
    data: payload,
  };

  return payload;
}

async function buildEspnWorldCupPayload() {
  const season = DEFAULT_SEASON;
  const data = await espnRequest(`/scoreboard?dates=${season}0611-${season}0719&limit=300`);
  const events = data.events || [];

  if (!events.length) {
    throw new Error(`ESPN nao retornou jogos para a Copa ${season}.`);
  }

  const teams = {};
  const teamRecords = {};
  const statTotals = {};
  const playerImpacts = await buildPlayerImpacts(events);

  events.forEach((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];

    competitors.forEach((competitor) => {
      ensureEspnTeam(teams, competitor.team);
      ensureTeamRecord(teamRecords, competitor.team.id);
      ensureStatTotal(statTotals, competitor.team.id);
    });

    if (!competition?.status?.type?.completed) return;

    const home = competitors.find((item) => item.homeAway === "home");
    const away = competitors.find((item) => item.homeAway === "away");
    if (!home || !away) return;

    applyResult(teamRecords, home.team.id, away.team.id, Number(home.score), Number(away.score));
    applyCompetitorStats(statTotals, home);
    applyCompetitorStats(statTotals, away);
  });

  Object.values(teams).forEach((team) => {
    const record = teamRecords[team.sourceId] || emptyRecord();
    const stats = statTotals[team.sourceId] || emptyStats();
    const playerImpact = playerImpacts[team.sourceId] || emptyPlayerImpact();
    const played = record.played || 0;
    const pointsPerGame = played ? record.points / played : 0;
    const goalDiff = record.goalsFor - record.goalsAgainst;
    const shotsPerGame = played ? stats.totalShots / played : 0;
    const shotsOnTargetPerGame = played ? stats.shotsOnTarget / played : 0;
    const possession = stats.possessionSamples ? stats.possessionTotal / stats.possessionSamples : 50;

    team.form = Number((pointsPerGame * 0.85 + goalDiff * 0.22 + shotsOnTargetPerGame * 0.08).toFixed(2));
    team.attack = Number((1 + record.goalsFor * 0.035 + shotsPerGame * 0.006 + playerImpact.attack * 0.01).toFixed(2));
    team.defense = Number((1 - record.goalsAgainst * 0.035 + (possession - 50) * 0.002 + playerImpact.defense * 0.01).toFixed(2));
    team.playerImpact = Number(clamp(playerImpact.total, -3, 5).toFixed(2));
    team.playerHighlights = playerImpact.highlights.slice(0, 4);
    team.weight = currentWeight(team);
    team.lastMatch = played
      ? `${record.points} pts, ${record.wins}-${record.draws}-${record.losses}, saldo ${goalDiff}; impacto jogadores ${team.playerImpact >= 0 ? "+" : ""}${team.playerImpact}.`
      : "Ainda nao jogou nesta Copa; peso preso ao ranking base.";
    delete team.sourceId;
  });

  const matches = events
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((event) => convertEspnEvent(event, teams));
  const groups = buildGroupStandings(matches, teams);

  updatePredictionHistory(matches, teams);

  return {
    source: "espn-public",
    season,
    updatedAt: new Date().toISOString(),
    teams,
    matches,
    groups,
  };
}

function ensureEspnTeam(teams, apiTeam) {
  const key = `espn_${apiTeam.id}`;
  const originalName = apiTeam.displayName || apiTeam.name;
  const name = translateTeamName(originalName);
  if (!teams[key]) {
    teams[key] = {
      name,
      logo: apiTeam.logo || "",
      fifaRank: getSeedRank(name, getSeedRank(originalName)),
      form: 0,
      attack: 1,
      defense: 1,
      weight: 0,
      lastMatch: "Aguardando dados de desempenho na Copa.",
      sourceId: String(apiTeam.id),
      placeholder: isPlaceholderTeam(originalName),
    };
  }

  return key;
}

function isPlaceholderTeam(name) {
  const normalized = normalizeName(name);
  return (
    normalized.includes("winner") ||
    normalized.includes("runner-up") ||
    normalized.includes("group ") ||
    normalized.includes("to be decided") ||
    normalized === "tbd"
  );
}

function ensureTeamRecord(records, id) {
  const key = String(id);
  if (!records[key]) {
    records[key] = emptyRecord();
  }
}

function ensureStatTotal(stats, id) {
  const key = String(id);
  if (!stats[key]) {
    stats[key] = emptyStats();
  }
}

function emptyRecord() {
  return {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  };
}

function emptyStats() {
  return {
    totalShots: 0,
    shotsOnTarget: 0,
    foulsCommitted: 0,
    wonCorners: 0,
    possessionTotal: 0,
    possessionSamples: 0,
  };
}

function emptyPlayerImpact() {
  return {
    attack: 0,
    defense: 0,
    total: 0,
    highlights: [],
  };
}

async function buildPlayerImpacts(events) {
  const finishedEvents = events
    .filter((event) => event.competitions?.[0]?.status?.type?.completed)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, PLAYER_SUMMARY_LIMIT);

  const impacts = {};
  const summaries = await mapWithConcurrency(finishedEvents, 6, async (event) => {
    try {
      return await espnRequest(`/summary?event=${event.id}`);
    } catch (error) {
      return null;
    }
  });

  summaries.filter(Boolean).forEach((summary) => {
    applyLeaderImpacts(impacts, summary.leaders || []);
    applyRosterImpacts(impacts, summary.rosters || []);
  });

  Object.values(impacts).forEach((impact) => {
    impact.total = clamp(impact.attack + impact.defense, -3, 5);
  });

  return impacts;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function ensureImpact(impacts, teamId) {
  const key = String(teamId);
  if (!impacts[key]) {
    impacts[key] = emptyPlayerImpact();
  }

  return impacts[key];
}

function applyLeaderImpacts(impacts, teamLeaders) {
  teamLeaders.forEach((teamLeader) => {
    const teamId = teamLeader.team?.id;
    if (!teamId) return;

    const impact = ensureImpact(impacts, teamId);
    (teamLeader.leaders || []).forEach((category) => {
      (category.leaders || []).forEach((leader) => {
        const delta = playerMetricDelta(category.name, leader.statistics || []);
        if (!delta.attack && !delta.defense) return;

        impact.attack += delta.attack;
        impact.defense += delta.defense;
        if (impact.highlights.length < 8) {
          impact.highlights.push({
            player: leader.athlete?.displayName || "Jogador",
            metric: translateMetricName(category.name),
            value: leader.displayValue,
          });
        }
      });
    });
  });
}

function applyRosterImpacts(impacts, rosters) {
  rosters.forEach((roster) => {
    const teamId = roster.team?.id;
    if (!teamId) return;

    const impact = ensureImpact(impacts, teamId);
    (roster.roster || []).forEach((player) => {
      const stats = statsObject(player.stats || []);
      const goals = numberStat(stats.totalGoals);
      const assists = numberStat(stats.goalAssists);
      const shotsOnTarget = numberStat(stats.shotsOnTarget);
      const yellowCards = numberStat(stats.yellowCards);
      const redCards = numberStat(stats.redCards);

      impact.attack += goals * 0.18 + assists * 0.12 + shotsOnTarget * 0.03;
      impact.defense -= yellowCards * 0.02 + redCards * 0.25;
    });
  });
}

function playerMetricDelta(metricName, statistics) {
  const stats = statsObject(statistics);
  const attackWeights = {
    totalShots: 0.035,
    shotsOnTarget: 0.09,
    expectedGoals: 0.28,
    accuratePasses: 0.003,
    totalPasses: 0.0015,
    goalAssists: 0.18,
    totalGoals: 0.3,
    chancesCreated: 0.06,
  };
  const defenseWeights = {
    defensiveInterventions: 0.045,
    tacklesWon: 0.06,
    interceptions: 0.05,
    clearances: 0.025,
    saves: 0.07,
  };

  let attack = 0;
  let defense = 0;

  Object.entries(attackWeights).forEach(([name, weight]) => {
    attack += numberStat(stats[name]) * weight;
  });

  Object.entries(defenseWeights).forEach(([name, weight]) => {
    defense += numberStat(stats[name]) * weight;
  });

  if (!attack && !defense) {
    attack += numberStat(stats[metricName]) * (attackWeights[metricName] || 0);
    defense += numberStat(stats[metricName]) * (defenseWeights[metricName] || 0);
  }

  return {
    attack: clamp(attack, 0, 0.75),
    defense: clamp(defense, 0, 0.55),
  };
}

function translateMetricName(metricName) {
  const names = {
    totalShots: "remates",
    shotsOnTarget: "remates a baliza",
    expectedGoals: "xG",
    accuratePasses: "passes certos",
    totalPasses: "passes",
    goalAssists: "assistencias",
    totalGoals: "gols",
    defensiveInterventions: "acoes defensivas",
    tacklesWon: "desarmes",
    interceptions: "interceptacoes",
    clearances: "cortes",
    saves: "defesas",
  };

  return names[metricName] || metricName;
}

function applyResult(records, homeId, awayId, homeScore, awayScore) {
  const home = records[String(homeId)];
  const away = records[String(awayId)];

  home.played += 1;
  away.played += 1;
  home.goalsFor += homeScore;
  home.goalsAgainst += awayScore;
  away.goalsFor += awayScore;
  away.goalsAgainst += homeScore;

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
}

function applyCompetitorStats(statTotals, competitor) {
  const totals = statTotals[String(competitor.team.id)];
  const stats = statsObject(competitor.statistics);
  totals.totalShots += numberStat(stats.totalShots);
  totals.shotsOnTarget += numberStat(stats.shotsOnTarget);
  totals.foulsCommitted += numberStat(stats.foulsCommitted);
  totals.wonCorners += numberStat(stats.wonCorners);

  const possession = numberStat(stats.possessionPct);
  if (possession) {
    totals.possessionTotal += possession;
    totals.possessionSamples += 1;
  }
}

function statsObject(statistics = []) {
  return statistics.reduce((acc, stat) => {
    acc[stat.name] = stat.displayValue;
    return acc;
  }, {});
}

function numberStat(value) {
  const number = Number(String(value || "0").replace("%", ""));
  return Number.isFinite(number) ? number : 0;
}

function convertEspnEvent(event, teams) {
  const competition = event.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const home = competitors.find((item) => item.homeAway === "home") || competitors[0];
  const away = competitors.find((item) => item.homeAway === "away") || competitors[1];
  const homeKey = `espn_${home.team.id}`;
  const awayKey = `espn_${away.team.id}`;
  const status = competition.status?.type?.completed ? "FT" : competition.status?.type?.state === "in" ? "LIVE" : "NS";
  const match = {
    id: Number(event.id),
    group: competition.altGameNote || event.season?.slug || "FIFA World Cup",
    day: formatMatchDay(event.date),
    time: formatMatchTime(event.date, { short: status }),
    timestamp: Math.floor(new Date(event.date).getTime() / 1000),
    status,
    home: homeKey,
    away: awayKey,
    actualScore: status === "FT"
      ? {
          home: Number(home.score),
          away: Number(away.score),
        }
      : null,
    stats: {
      home: publicStats(home.statistics),
      away: publicStats(away.statistics),
    },
  };

  match.prediction = status === "FT" ? null : predictMatch(match, teams);
  return match;
}

function buildGroupStandings(matches, teams) {
  const groups = {};

  matches.forEach((match) => {
    const groupName = extractGroupName(match.group);
    if (!groupName) return;

    groups[groupName] = groups[groupName] || {};
    ensureStandingTeam(groups[groupName], match.home, teams[match.home]);
    ensureStandingTeam(groups[groupName], match.away, teams[match.away]);

    if (!isFinished(match.status) || !match.actualScore) return;

    applyStandingResult(groups[groupName][match.home], groups[groupName][match.away], match.actualScore.home, match.actualScore.away);
  });

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([name, table]) => ({
      name,
      teams: Object.values(table)
        .sort(sortStandingRows)
        .map((row, index) => ({ ...row, position: index + 1 })),
    }));
}

function extractGroupName(groupText) {
  const match = /Group\s+([A-Z])/i.exec(groupText || "");
  if (!match) return null;
  return `Grupo ${match[1].toUpperCase()}`;
}

function ensureStandingTeam(groupTable, teamKey, team) {
  if (groupTable[teamKey]) return;

  groupTable[teamKey] = {
    teamKey,
    name: team?.name || "Selecao",
    logo: team?.logo || "",
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
}

function applyStandingResult(home, away, homeScore, awayScore) {
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
}

function sortStandingRows(a, b) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.name.localeCompare(b.name, "pt-BR")
  );
}

function publicStats(statistics = []) {
  const stats = statsObject(statistics);
  return {
    shots: numberStat(stats.totalShots),
    shotsOnTarget: numberStat(stats.shotsOnTarget),
    possession: numberStat(stats.possessionPct),
    corners: numberStat(stats.wonCorners),
    fouls: numberStat(stats.foulsCommitted),
  };
}

function loadPredictionHistory() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(HISTORY_FILE)) {
      return { version: 1, matches: {} };
    }

    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch (error) {
    return { version: 1, matches: {} };
  }
}

function savePredictionHistory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(predictionHistory, null, 2));
}

function updatePredictionHistory(matches, teams) {
  let changed = false;

  matches.forEach((match) => {
    const key = String(match.id);
    const existing = predictionHistory.matches[key];

    if (!isFinished(match.status) && match.prediction) {
      if (!existing) {
        predictionHistory.matches[key] = createPredictionRecord(match, teams);
        changed = true;
      } else if (!existing.result) {
        existing.latestPrediction = snapshotPrediction(match, teams);
        existing.updatedAt = new Date().toISOString();
        changed = true;
      }
      return;
    }

    if (isFinished(match.status) && match.actualScore) {
      if (!existing) {
        predictionHistory.matches[key] = createResultOnlyRecord(match, teams);
        changed = true;
      } else if (!existing.result) {
        existing.result = snapshotResult(match, teams);
        existing.evaluation = evaluatePrediction(existing.initialPrediction, match.actualScore);
        existing.completedAt = new Date().toISOString();
        changed = true;
      }
    }
  });

  if (changed) {
    savePredictionHistory();
  }
}

function createPredictionRecord(match, teams) {
  return {
    id: match.id,
    group: match.group,
    date: match.timestamp,
    home: teams[match.home]?.name,
    away: teams[match.away]?.name,
    initialPrediction: snapshotPrediction(match, teams),
    latestPrediction: snapshotPrediction(match, teams),
    result: null,
    evaluation: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createResultOnlyRecord(match, teams) {
  return {
    id: match.id,
    group: match.group,
    date: match.timestamp,
    home: teams[match.home]?.name,
    away: teams[match.away]?.name,
    initialPrediction: null,
    latestPrediction: null,
    result: snapshotResult(match, teams),
    evaluation: null,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

function snapshotPrediction(match, teams) {
  return {
    home: teams[match.home]?.name,
    away: teams[match.away]?.name,
    homeGoals: match.prediction.homeGoals,
    awayGoals: match.prediction.awayGoals,
    homeChance: match.prediction.homeChance,
    drawChance: match.prediction.drawChance,
    awayChance: match.prediction.awayChance,
    favoriteChance: match.prediction.favoriteChance,
    winner: resultDirection(match.prediction.homeGoals, match.prediction.awayGoals),
    capturedAt: new Date().toISOString(),
  };
}

function snapshotResult(match, teams) {
  return {
    home: teams[match.home]?.name,
    away: teams[match.away]?.name,
    homeGoals: match.actualScore.home,
    awayGoals: match.actualScore.away,
    winner: resultDirection(match.actualScore.home, match.actualScore.away),
  };
}

function resultDirection(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return "home";
  if (awayGoals > homeGoals) return "away";
  return "draw";
}

function evaluatePrediction(prediction, actualScore) {
  if (!prediction) return null;

  const actualWinner = resultDirection(actualScore.home, actualScore.away);
  const predictedWinner = resultDirection(prediction.homeGoals, prediction.awayGoals);

  return {
    exactScore: prediction.homeGoals === actualScore.home && prediction.awayGoals === actualScore.away,
    winner: predictedWinner === actualWinner && actualWinner !== "draw",
    draw: predictedWinner === "draw" && actualWinner === "draw",
    loser:
      predictedWinner === actualWinner &&
      actualWinner !== "draw" &&
      resultDirection(prediction.awayGoals, prediction.homeGoals) === resultDirection(actualScore.away, actualScore.home),
    direction: predictedWinner === actualWinner,
  };
}

function getPredictionHistorySummary() {
  const records = Object.values(predictionHistory.matches);
  const evaluated = records.filter((record) => record.evaluation);
  const awaitingResult = records.filter((record) => record.initialPrediction && !record.result);
  const resultWithoutPrediction = records.filter((record) => !record.initialPrediction && record.result);

  const summary = evaluated.reduce(
    (acc, record) => {
      acc.exactScore += record.evaluation.exactScore ? 1 : 0;
      acc.winner += record.evaluation.winner ? 1 : 0;
      acc.draw += record.evaluation.draw ? 1 : 0;
      acc.direction += record.evaluation.direction ? 1 : 0;
      return acc;
    },
    { exactScore: 0, winner: 0, draw: 0, direction: 0 }
  );

  return {
    total: records.length,
    evaluated: evaluated.length,
    awaitingResult: awaitingResult.length,
    resultWithoutPrediction: resultWithoutPrediction.length,
    summary,
    matches: records.sort((a, b) => (a.date || 0) - (b.date || 0)),
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
    };

    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/worldcup") {
    try {
      const payload = await buildWorldCupPayload();
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 500, {
        message: error.message || "Falha ao carregar dados da Copa.",
      });
    }
    return;
  }

  if (url.pathname === "/api/prediction-history") {
    sendJson(res, 200, getPredictionHistorySummary());
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Copa app rodando em http://localhost:${PORT}`);
});
