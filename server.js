const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
loadEnvFile();

const HISTORY_FILE = path.join(DATA_DIR, "prediction-history.json");
const SUMMARY_CACHE_FILE = path.join(DATA_DIR, "espn-summary-cache.json");
const API_BASE_URL = "https://v3.football.api-sports.io";
const ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_SEASON = Number(process.env.WORLD_CUP_SEASON || 2026);
const CACHE_MS = Number(process.env.API_CACHE_MS || 1000 * 60 * 10);
const PLAYER_SUMMARY_LIMIT = Number(process.env.PLAYER_SUMMARY_LIMIT || 32);
const FIFA_RANKING_SOURCE = "Ranking FIFA masculino - base manual revisada em 2026-06-19";

let cache = {
  expiresAt: 0,
  data: null,
};

let predictionHistory = createEmptyPredictionHistory();
let predictionHistoryStore = createPredictionHistoryStore();
let summaryCache = loadSummaryCache();

const fifaRankingBase = {
  france: 1,
  franca: 1,
  spain: 2,
  espanha: 2,
  argentina: 3,
  england: 4,
  inglaterra: 4,
  portugal: 5,
  brazil: 6,
  brasil: 6,
  netherlands: 7,
  "paises baixos": 7,
  morocco: 8,
  marrocos: 8,
  belgium: 9,
  belgica: 9,
  germany: 10,
  alemanha: 10,
  croatia: 11,
  croacia: 11,
  italy: 12,
  italia: 12,
  colombia: 13,
  mexico: 14,
  usa: 15,
  "united states": 15,
  "estados unidos": 15,
  uruguay: 16,
  uruguai: 16,
  japan: 18,
  japao: 18,
  switzerland: 19,
  suica: 19,
  iran: 20,
  ira: 20,
  austria: 22,
  "south korea": 23,
  "coreia do sul": 23,
  australia: 24,
  ecuador: 25,
  equador: 25,
  turkey: 27,
  turkiye: 27,
  egypt: 31,
  egito: 31,
  norway: 33,
  noruega: 33,
  panama: 35,
  algeria: 36,
  argelia: 36,
  czechia: 39,
  tchequia: 39,
  tunisia: 40,
  scotland: 43,
  escocia: 43,
  sweden: 43,
  suecia: 43,
  "ivory coast": 45,
  "costa do marfim": 45,
  paraguay: 46,
  paraguai: 46,
  canada: 49,
  qatar: 53,
  catar: 53,
  "saudi arabia": 54,
  "arabia saudita": 54,
  "south africa": 56,
  "africa do sul": 56,
  uzbekistan: 58,
  uzbequistao: 58,
  iraq: 59,
  iraque: 59,
  "dr congo": 60,
  "rd congo": 60,
  jordan: 62,
  jordania: 62,
  "cape verde": 69,
  "cabo verde": 69,
  "bosnia and herzegovina": 70,
  "bosnia e herzegovina": 70,
  ghana: 74,
  gana: 74,
  curacao: 82,
  "curaçao": 82,
  haiti: 83,
  "new zealand": 85,
  "nova zelandia": 85,
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
  Egypt: "Egito",
  England: "Inglaterra",
  France: "Franca",
  Germany: "Alemanha",
  Ghana: "Gana",
  Iran: "Ira",
  Iraq: "Iraque",
  Italy: "Italia",
  Japan: "Japao",
  Jordan: "Jordania",
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
  Sweden: "Suecia",
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

const espnFlagCodes = {
  alg: "dz",
  arg: "ar",
  aus: "au",
  aut: "at",
  bel: "be",
  bih: "ba",
  bra: "br",
  can: "ca",
  civ: "ci",
  col: "co",
  cro: "hr",
  cpv: "cv",
  cze: "cz",
  ecu: "ec",
  egy: "eg",
  eng: "gb-eng",
  esp: "es",
  fra: "fr",
  ger: "de",
  gha: "gh",
  hai: "ht",
  irn: "ir",
  irq: "iq",
  jor: "jo",
  jpn: "jp",
  kors: "kr",
  ksa: "sa",
  mar: "ma",
  mex: "mx",
  ned: "nl",
  nor: "no",
  nzl: "nz",
  pan: "pa",
  par: "py",
  por: "pt",
  qat: "qa",
  rdc: "cd",
  rsa: "za",
  sco: "gb-sct",
  sen: "sn",
  sui: "ch",
  swe: "se",
  tun: "tn",
  tur: "tr",
  uru: "uy",
  usa: "us",
  uzb: "uz",
};

const teamFlagCodes = {
  curacao: "cw",
  "curaçao": "cw",
  "rd congo": "cd",
  "republica democratica do congo": "cd",
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

function createEmptyPredictionHistory() {
  return { version: 1, matches: {} };
}

function createPredictionHistoryStore() {
  if (process.env.DATABASE_URL) {
    return createPostgresPredictionHistoryStore();
  }

  return createFilePredictionHistoryStore();
}

function createFilePredictionHistoryStore() {
  return {
    name: "json-file",
    async load() {
      if (!fs.existsSync(HISTORY_FILE)) {
        return createEmptyPredictionHistory();
      }

      try {
        const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
        return normalizePredictionHistory(parsed);
      } catch (error) {
        return createEmptyPredictionHistory();
      }
    },
    async save(history) {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      fs.writeFileSync(HISTORY_FILE, JSON.stringify(normalizePredictionHistory(history), null, 2));
    },
  };
}

function createPostgresPredictionHistoryStore() {
  let Pool;

  try {
    ({ Pool } = require("pg"));
  } catch (error) {
    throw new Error("DATABASE_URL foi configurado, mas o pacote pg nao esta instalado. Rode npm install antes do deploy.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });

  return {
    name: "postgres",
    async load() {
      await pool.query(`
        create table if not exists prediction_history (
          id text primary key,
          record jsonb not null,
          updated_at timestamptz not null default now()
        )
      `);

      const result = await pool.query("select id, record from prediction_history");
      const history = createEmptyPredictionHistory();

      result.rows.forEach((row) => {
        history.matches[row.id] = row.record;
      });

      return normalizePredictionHistory(history);
    },
    async save(history) {
      const normalized = normalizePredictionHistory(history);
      const records = Object.entries(normalized.matches);
      if (!records.length) return;

      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const [id, record] of records) {
          await client.query(
            `
              insert into prediction_history (id, record, updated_at)
              values ($1, $2, now())
              on conflict (id) do update
              set record = excluded.record,
                  updated_at = now()
            `,
            [id, record]
          );
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

function normalizePredictionHistory(history) {
  return {
    version: history?.version || 1,
    matches: history?.matches && typeof history.matches === "object" ? history.matches : {},
  };
}

async function initializePersistence() {
  predictionHistoryStore = createPredictionHistoryStore();
  predictionHistory = await predictionHistoryStore.load();
}

function loadSummaryCache() {
  if (!fs.existsSync(SUMMARY_CACHE_FILE)) {
    return { version: 1, events: {} };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(SUMMARY_CACHE_FILE, "utf8"));
    return {
      version: parsed.version || 1,
      events: parsed.events && typeof parsed.events === "object" ? parsed.events : {},
    };
  } catch (error) {
    return { version: 1, events: {} };
  }
}

function saveSummaryCache() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(SUMMARY_CACHE_FILE, JSON.stringify(summaryCache, null, 2));
}

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getSeedRank(name, fallback = 75) {
  const normalized = normalizeName(name);
  return fifaRankingBase[normalized] || fallback;
}

function translateTeamName(name) {
  const winnerGroup = /^Winner Group ([A-Z])$/i.exec(name);
  if (winnerGroup) return `Vencedor do Grupo ${winnerGroup[1].toUpperCase()}`;

  const runnerUpGroup = /^Runner-up Group ([A-Z])$/i.exec(name);
  if (runnerUpGroup) return `2o lugar do Grupo ${runnerUpGroup[1].toUpperCase()}`;

  return teamNamePtBr[name] || name;
}

function flagCodeForTeam(apiTeam, translatedName) {
  const logoCode = /\/([^/.]+)\.png$/i.exec(apiTeam.logo || "")?.[1]?.toLowerCase();
  const byLogo = espnFlagCodes[logoCode];
  if (byLogo) return byLogo;

  return teamFlagCodes[normalizeName(translatedName)] || teamFlagCodes[normalizeName(apiTeam.displayName || apiTeam.name)] || "";
}

function rankingWeight(rank) {
  const safeRank = Math.max(1, Number(rank) || 75);
  return Number(clamp(92 - Math.log(safeRank) * 10.8, 36, 92).toFixed(1));
}

function currentWeight(team) {
  return Number(team.strength?.overall?.toFixed(1) || team.weight || team.baseStrength || rankingWeight(team.fifaRank));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function predictMatch(match, teams) {
  const calibration = modelCalibration();
  const home = teams[match.home];
  const away = teams[match.away];
  const homeProfile = predictionProfile(home);
  const awayProfile = predictionProfile(away);
  const homeWeight = homeProfile.overall;
  const awayWeight = awayProfile.overall;
  const diff = (homeWeight - awayWeight) * calibration.diffMultiplier;
  const attackGapHome = homeProfile.attack - awayProfile.defense;
  const attackGapAway = awayProfile.attack - homeProfile.defense;
  const formGap = homeProfile.form - awayProfile.form;
  const playerGap = homeProfile.players - awayProfile.players;
  const expectedHome = expectedGoals(1.18 + diff / 32 + attackGapHome / 42 + formGap / 85 + playerGap / 70, calibration);
  const expectedAway = expectedGoals(1.08 - diff / 34 + attackGapAway / 42 - formGap / 90 - playerGap / 75, calibration);
  const drawChance = clamp(28 + calibration.drawBias - Math.abs(diff) * 0.42 - Math.abs(expectedHome - expectedAway) * 4.5, 10, 36);
  const homeChance = clamp((100 - drawChance) / 2 + diff * 1.05 + (expectedHome - expectedAway) * 6, 6, 86);
  const awayChance = 100 - drawChance - homeChance;
  const homeGoals = clamp(Math.round(expectedHome), 0, 5);
  const awayGoals = clamp(Math.round(expectedAway), 0, 5);
  const favoriteChance = Math.round(Math.max(homeChance, awayChance));
  const agreement = Math.sign(diff || 0) === Math.sign((expectedHome - expectedAway) || 0) ? 6 : -4;
  const confidence = clamp(Math.round(44 + Math.abs(diff) * 1.05 + Math.abs(expectedHome - expectedAway) * 8 + agreement), 38, 91);

  return {
    homeGoals,
    awayGoals,
    expectedGoals: {
      home: Number(expectedHome.toFixed(2)),
      away: Number(expectedAway.toFixed(2)),
    },
    homeChance: Math.round(homeChance),
    drawChance: Math.round(drawChance),
    awayChance: Math.round(awayChance),
    favoriteChance,
    confidence,
    reason: buildReason(home, away, diff, homeWeight, awayWeight, expectedHome, expectedAway),
    model: {
      home: homeProfile,
      away: awayProfile,
    },
  };
}

function predictionProfile(team) {
  if (team.strength) return team.strength;

  const base = rankingWeight(team.fifaRank);
  return {
    base,
    form: (team.form || 0) * 2.8,
    attack: base + ((team.attack || 1) - 1) * 24,
    defense: base + ((team.defense || 1) - 1) * 24,
    players: team.playerImpact || 0,
    opponents: 0,
    overall: currentWeight({ ...team, strength: null }),
  };
}

function expectedGoals(value, calibration) {
  const evaluated = calibration.evaluated || 0;
  const exactRate = calibration.exactRate || 0;
  const exactCorrection = evaluated ? clamp(1 + (0.28 - exactRate) * 0.08, 0.96, 1.05) : 1;
  const goalErrorCorrection = calibration.goalVolumeMultiplier || 1;
  const scoreCorrection = clamp(exactCorrection * goalErrorCorrection, 0.86, 1.1);
  return clamp(value * scoreCorrection, 0.15, 4.8);
}

function buildReason(home, away, diff, homeWeight, awayWeight, expectedHome, expectedAway) {
  const gap = Math.abs(diff).toFixed(1);
  const stronger = diff >= 0 ? home : away;
  const weaker = diff >= 0 ? away : home;

  if (Math.abs(diff) < 4) {
    return `Jogo equilibrado: ${home.name} tem peso ${homeWeight.toFixed(1)} e ${away.name} tem peso ${awayWeight.toFixed(1)}. Os gols esperados ficaram em ${expectedHome.toFixed(2)} x ${expectedAway.toFixed(2)}, entao a premonicao preserva chance relevante de empate.`;
  }

  return `${stronger.name} aparece acima por ${gap} pontos de peso contra ${weaker.name}. O modelo combina ranking FIFA, forma na Copa, forca dos adversarios, ataque/defesa e media dos principais jogadores antes de arredondar os gols esperados (${expectedHome.toFixed(2)} x ${expectedAway.toFixed(2)}).`;
}

function isFinished(status) {
  return ["FT", "AET", "PEN"].includes(status);
}

function isLiveStatus(status) {
  return ["LIVE", "1H", "2H", "HT", "ET", "P"].includes(status);
}

function isScheduledStatus(status) {
  return !isFinished(status) && !isLiveStatus(status);
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
  if (isLiveStatus(status?.short)) return "Ao vivo";

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
    flagCode: flagCodeForTeam(apiTeam, apiTeam.name) || existing?.flagCode || "",
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
        actualScore: isFinished(status) || isLiveStatus(status)
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

  await updatePredictionHistory(matches, teams);
  attachPredictionSnapshots(matches);

  const payload = {
    source: "api-football",
    season,
    updatedAt: new Date().toISOString(),
    rankingSource: FIFA_RANKING_SOURCE,
    historyStorage: predictionHistoryStore.name,
    teams,
    matches,
    groups: buildGroupStandings(matches, teams),
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
    applyOpponentQuality(teamRecords, home, away);
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
    const goalsForPerGame = played ? record.goalsFor / played : 0;
    const goalsAgainstPerGame = played ? record.goalsAgainst / played : 0;
    const shotsPerGame = played ? stats.totalShots / played : 0;
    const shotsOnTargetPerGame = played ? stats.shotsOnTarget / played : 0;
    const possession = stats.possessionSamples ? stats.possessionTotal / stats.possessionSamples : 50;
    const opponentStrength = record.opponentSamples ? record.opponentRankWeightTotal / record.opponentSamples : rankingWeight(75);
    const players = (Array.isArray(playerImpact.players) ? playerImpact.players : Object.values(playerImpact.players || {})).slice(0, 18);
    const topPlayers = players.slice(0, 5);
    const topPlayerAverage = topPlayers.length ? topPlayers.reduce((sum, player) => sum + Number(player.average || 0), 0) / topPlayers.length : 6;

    team.form = Number((pointsPerGame * 0.85 + goalDiff * 0.22 + shotsOnTargetPerGame * 0.08).toFixed(2));
    team.attack = Number((1 + record.goalsFor * 0.035 + shotsPerGame * 0.006 + playerImpact.attack * 0.01).toFixed(2));
    team.defense = Number((1 - record.goalsAgainst * 0.035 + (possession - 50) * 0.002 + playerImpact.defense * 0.01).toFixed(2));
    team.playerImpact = Number(clamp(playerImpact.total, -3, 5).toFixed(2));
    team.playerHighlights = playerImpact.highlights.slice(0, 4);
    team.players = players;
    team.strength = buildTeamStrength(team, {
      base: rankingWeight(team.fifaRank),
      played,
      pointsPerGame,
      goalDiff,
      goalsForPerGame,
      goalsAgainstPerGame,
      shotsPerGame,
      shotsOnTargetPerGame,
      possession,
      opponentStrength,
      topPlayerAverage,
    });
    team.weight = currentWeight(team);
    team.lastMatch = played
      ? `${record.points} pts, ${record.wins}-${record.draws}-${record.losses}, saldo ${goalDiff}; impacto jogadores ${team.playerImpact >= 0 ? "+" : ""}${team.playerImpact}.`
      : "Ainda nao jogou nesta Copa; peso preso ao ranking base.";
  });

  applyRankingMovement(events, teams);

  Object.values(teams).forEach((team) => {
    delete team.sourceId;
  });

  const matches = events
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((event) => convertEspnEvent(event, teams));
  const groups = buildGroupStandings(matches, teams);

  await updatePredictionHistory(matches, teams);
  attachPredictionSnapshots(matches);

  return {
    source: "espn-public",
    season,
    updatedAt: new Date().toISOString(),
    rankingSource: FIFA_RANKING_SOURCE,
    historyStorage: predictionHistoryStore.name,
    calibration: modelCalibration(),
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
      flagCode: flagCodeForTeam(apiTeam, name),
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
    opponentRankWeightTotal: 0,
    opponentSamples: 0,
  };
}

function applyOpponentQuality(records, home, away) {
  const homeRecord = records[String(home.team.id)];
  const awayRecord = records[String(away.team.id)];
  if (!homeRecord || !awayRecord) return;

  const homeName = translateTeamName(home.team.displayName || home.team.name);
  const awayName = translateTeamName(away.team.displayName || away.team.name);
  homeRecord.opponentRankWeightTotal += rankingWeight(getSeedRank(awayName, getSeedRank(away.team.displayName || away.team.name)));
  awayRecord.opponentRankWeightTotal += rankingWeight(getSeedRank(homeName, getSeedRank(home.team.displayName || home.team.name)));
  homeRecord.opponentSamples += 1;
  awayRecord.opponentSamples += 1;
}

function buildTeamStrength(team, context) {
  const calibration = modelCalibration();
  const sampleConfidence = context.played ? clamp(context.played / 3, 0.35, 1) : 0;
  const playerStrength = clamp(((context.topPlayerAverage - 6.5) * 1.9 + (team.playerImpact || 0) * 0.75) * sampleConfidence, -3.5, 6);
  const formStrength = context.played
    ? clamp(((context.pointsPerGame - 1.15) * 2.5 + (context.goalDiff / context.played) * 1.15 + (context.shotsOnTargetPerGame - 3.2) * 0.38) * sampleConfidence, -5.5, 7)
    : 0;
  const opponentStrength = clamp((context.opponentStrength - rankingWeight(55)) * 0.12 * sampleConfidence, -2.5, 4);
  const attackingForm = context.played
    ? (context.goalsForPerGame - 1.15) * 3.2 + (context.shotsPerGame - 10) * 0.11 + (context.shotsOnTargetPerGame - 3.2) * 0.42
    : 0;
  const defensiveForm = context.played
    ? (1.1 - context.goalsAgainstPerGame) * 3.2 + (context.possession - 50) * 0.035
    : 0;
  const attackModifier = clamp(attackingForm * sampleConfidence + playerStrength * 0.45, -6, 8);
  const defenseModifier = clamp(defensiveForm * sampleConfidence + playerStrength * 0.25, -6, 8);
  const attackStrength = context.base + attackModifier;
  const defenseStrength = context.base + defenseModifier;
  const profileBalance = ((attackStrength + defenseStrength) / 2 - context.base) * 0.65;
  const rawOverall =
    context.base +
    formStrength * calibration.formMultiplier * 0.42 +
    playerStrength * calibration.playerImpactMultiplier +
    opponentStrength +
    profileBalance;
  const maxCupBoost = context.played ? 5 + context.played * 2.5 : 1.5;
  const maxCupDrop = context.played ? 5 + context.played * 2 : 1.5;
  const overall = clamp(rawOverall, context.base - maxCupDrop, context.base + maxCupBoost);

  return {
    base: Number(context.base.toFixed(1)),
    form: Number(formStrength.toFixed(1)),
    attack: Number(attackStrength.toFixed(1)),
    defense: Number(defenseStrength.toFixed(1)),
    players: Number(playerStrength.toFixed(1)),
    opponents: Number(opponentStrength.toFixed(1)),
    sampleConfidence: Number(sampleConfidence.toFixed(2)),
    topPlayerAverage: Number(context.topPlayerAverage.toFixed(2)),
    expectedProfile: context.played ? "copa" : "ranking-base",
    overall: Number(clamp(overall, 34, 96).toFixed(1)),
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
    players: {},
  };
}

async function buildPlayerImpacts(events) {
  const finishedEvents = events
    .filter((event) => event.competitions?.[0]?.status?.type?.completed)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, PLAYER_SUMMARY_LIMIT);

  const impacts = {};
  let cacheChanged = false;
  const summaries = await mapWithConcurrency(finishedEvents, 6, async (event) => {
    const cacheKey = String(event.id);
    const cached = summaryCache.events[cacheKey];
    if (cached?.summary) {
      const compactSummary = compactPlayerSummary(cached.summary);
      if (compactSummary !== cached.summary) {
        cached.summary = compactSummary;
        cacheChanged = true;
      }
      return compactSummary;
    }

    try {
      const summary = await espnRequest(`/summary?event=${event.id}`);
      summaryCache.events[cacheKey] = {
        eventId: cacheKey,
        eventDate: event.date,
        cachedAt: new Date().toISOString(),
        summary: compactPlayerSummary(summary),
      };
      cacheChanged = true;
      return summaryCache.events[cacheKey].summary;
    } catch (error) {
      return null;
    }
  });

  if (cacheChanged) {
    saveSummaryCache();
  }

  summaries.filter(Boolean).forEach((summary) => {
    applyLeaderImpacts(impacts, summary.leaders || []);
    applyRosterImpacts(impacts, summary.rosters || []);
  });

  Object.values(impacts).forEach((impact) => {
    impact.total = clamp(impact.attack + impact.defense, -3, 5);
    impact.players = Object.values(impact.players)
      .map((player) => {
        const games = player.games || 0;
        const gamesForAverage = Math.max(1, games);
        const cappedTotal = clamp(player.total, 0, gamesForAverage * 10);

        return {
          ...player,
          games,
          total: Number(cappedTotal.toFixed(2)),
          average: Number((cappedTotal / gamesForAverage).toFixed(2)),
          attack: Number(player.attack.toFixed(2)),
          defense: Number(player.defense.toFixed(2)),
        };
      })
      .sort((a, b) => b.average - a.average || b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
  });

  return impacts;
}

function compactPlayerSummary(summary = {}) {
  if (summary.cacheShape === "player-impact-v1") return summary;

  return {
    cacheShape: "player-impact-v1",
    leaders: (summary.leaders || []).map((teamLeader) => ({
      team: { id: teamLeader.team?.id },
      leaders: (teamLeader.leaders || []).map((category) => ({
        name: category.name,
        leaders: (category.leaders || []).map((leader) => ({
          athlete: compactAthlete(leader.athlete),
          statistics: leader.statistics || [],
          displayValue: leader.displayValue,
        })),
      })),
    })),
    rosters: (summary.rosters || []).map((roster) => ({
      team: { id: roster.team?.id },
      roster: (roster.roster || []).map((player) => ({
        athlete: compactAthlete(player.athlete || player),
        stats: player.stats || [],
      })),
    })),
  };
}

function compactAthlete(athlete = {}) {
  return {
    id: athlete.id,
    displayName: athlete.displayName,
    fullName: athlete.fullName,
    shortName: athlete.shortName,
  };
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

function ensureImpactPlayer(impact, athlete) {
  const name = athlete?.displayName || athlete?.fullName || athlete?.shortName || "Jogador";
  const key = String(athlete?.id || name);

  if (!impact.players[key]) {
    impact.players[key] = {
      id: key,
      name,
      games: 0,
      total: 0,
      attack: 0,
      defense: 0,
      goals: 0,
      assists: 0,
    };
  }

  return impact.players[key];
}

function addPlayerScore(impact, athlete, score, details = {}, countGame = false) {
  const player = ensureImpactPlayer(impact, athlete);
  if (countGame) player.games += 1;

  player.total += score.total;
  player.attack += score.attack;
  player.defense += score.defense;
  player.goals += details.goals || 0;
  player.assists += details.assists || 0;
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
        addPlayerScore(
          impact,
          leader.athlete,
          {
            attack: delta.attack,
            defense: delta.defense,
            total: delta.attack + delta.defense,
          },
          {},
          false
        );

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
      const score = playerScoreFromStats(stats);

      impact.attack += goals * 0.18 + assists * 0.12 + shotsOnTarget * 0.03;
      impact.defense -= yellowCards * 0.02 + redCards * 0.25;
      if (score) {
        addPlayerScore(impact, player.athlete || player, score, { goals, assists }, true);
      }
    });
  });
}

function playerScoreFromStats(stats) {
  const minutes = numberStat(stats.minutes) || numberStat(stats.minutesPlayed) || numberStat(stats.totalMinutes);
  const goals = numberStat(stats.totalGoals);
  const assists = numberStat(stats.goalAssists);
  const shotsOnTarget = numberStat(stats.shotsOnTarget);
  const totalShots = numberStat(stats.totalShots);
  const totalPasses = numberStat(stats.totalPasses);
  const accuratePasses = numberStat(stats.accuratePasses);
  const chancesCreated = numberStat(stats.chancesCreated);
  const defensiveInterventions = numberStat(stats.defensiveInterventions);
  const tacklesWon = numberStat(stats.tacklesWon);
  const interceptions = numberStat(stats.interceptions);
  const clearances = numberStat(stats.clearances);
  const saves = numberStat(stats.saves);
  const yellowCards = numberStat(stats.yellowCards);
  const redCards = numberStat(stats.redCards);
  const activity =
    minutes +
    goals +
    assists +
    shotsOnTarget +
    totalShots +
    totalPasses +
    accuratePasses +
    chancesCreated +
    defensiveInterventions +
    tacklesWon +
    interceptions +
    clearances +
    saves +
    yellowCards +
    redCards;

  if (!activity) return null;

  const base = minutes ? 5.55 + clamp(minutes / 90, 0, 1) * 0.55 : 5.85;
  const attack = goals * 1.25 + assists * 0.85 + shotsOnTarget * 0.28 + totalShots * 0.08 + accuratePasses * 0.01 + chancesCreated * 0.18;
  const defense = defensiveInterventions * 0.14 + tacklesWon * 0.18 + interceptions * 0.2 + clearances * 0.1 + saves * 0.35;
  const penalties = yellowCards * 0.4 + redCards * 1.6;

  return {
    attack,
    defense,
    total: clamp(base + attack + defense - penalties, 0, 10),
  };
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
  const match = String(value || "0").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  const number = match ? Number(match[0]) : 0;
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
  const scoreIsAvailable = isFinished(status) || isLiveStatus(status);
  const match = {
    id: Number(event.id),
    group: displayRoundName(event, competition),
    day: formatMatchDay(event.date),
    time: formatMatchTime(event.date, { short: status }),
    timestamp: Math.floor(new Date(event.date).getTime() / 1000),
    status,
    home: homeKey,
    away: awayKey,
    actualScore: scoreIsAvailable
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

function displayRoundName(event, competition) {
  const note = competition.altGameNote || "";
  if (/Group\s+[A-Z]/i.test(note)) return note;

  const date = new Date(event.date);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  if ((month === 6 && day >= 28) || (month === 7 && day <= 3) || (month === 7 && day === 4 && date.getUTCHours() < 12)) return "Round of 32";
  if (month === 7 && ((day === 4 && date.getUTCHours() >= 12) || (day >= 5 && day <= 7))) return "Round of 16";
  if (month === 7 && day >= 9 && day <= 12) return "Quarterfinal";
  if (month === 7 && day >= 14 && day <= 15) return "Semifinal";
  if (month === 7 && day === 17) return "Semifinal";
  if (month === 7 && day === 18) return "3rd Place";
  if (month === 7 && day === 19) return "Final";

  return note || event.season?.slug || "FIFA World Cup";
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
    flagCode: team?.flagCode || "",
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

function applyRankingMovement(events, teams) {
  const currentRows = rankingRows(teams);
  const currentPositions = Object.fromEntries(currentRows.map((row) => [row.key, row.position]));

  Object.entries(teams).forEach(([teamKey, team]) => {
    if (team.placeholder || !team.sourceId) return;

    const lastMatch = latestFinishedEventForTeam(events, team.sourceId);
    if (!lastMatch) {
      team.previousPosition = currentPositions[teamKey];
      team.positionDelta = 0;
      team.movement = "same";
      return;
    }

    const previousWeight = previousWeightBeforeLastMatch(team, lastMatch, team.sourceId, teams);
    const beforeRows = rankingRows(teams, teamKey, previousWeight);
    const previousPosition = beforeRows.find((row) => row.key === teamKey)?.position || currentPositions[teamKey];
    const delta = previousPosition - currentPositions[teamKey];

    team.previousWeight = previousWeight;
    team.weightDelta = Number((team.weight - previousWeight).toFixed(1));
    team.previousPosition = previousPosition;
    team.positionDelta = delta;
    team.movement = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  });
}

function rankingRows(teams, overrideKey, overrideWeight) {
  return Object.entries(teams)
    .filter(([, team]) => !team.placeholder)
    .map(([key, team]) => ({
      key,
      weight: key === overrideKey ? overrideWeight : team.weight,
      name: team.name,
    }))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, "pt-BR"))
    .map((row, index) => ({ ...row, position: index + 1 }));
}

function latestFinishedEventForTeam(events, sourceId) {
  return events
    .filter((event) => {
      const competition = event.competitions?.[0];
      if (!competition?.status?.type?.completed) return false;

      return (competition.competitors || []).some((competitor) => String(competitor.team.id) === String(sourceId));
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

function previousWeightBeforeLastMatch(team, event, sourceId, teams) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const self = competitors.find((competitor) => String(competitor.team.id) === String(sourceId));
  const opponent = competitors.find((competitor) => String(competitor.team.id) !== String(sourceId));
  if (!self || !opponent) return team.weight;

  const selfScore = Number(self.score);
  const opponentScore = Number(opponent.score);
  const opponentTeam = Object.values(teams).find((candidate) => String(candidate.sourceId) === String(opponent.team.id));
  const expectedGap = rankingWeight(team.fifaRank) - rankingWeight(opponentTeam?.fifaRank || 75);
  const scoreSwing = matchScoreSwing(selfScore, opponentScore, expectedGap);
  const goalSwing = clamp((selfScore - opponentScore) * 0.35, -1.4, 1.4);
  const stats = statsObject(self.statistics);
  const statSwing = clamp(numberStat(stats.shotsOnTarget) * 0.08 + numberStat(stats.totalShots) * 0.025, 0, 1.1);
  const estimatedLastGameImpact = scoreSwing + goalSwing + statSwing;

  return Number((team.weight - estimatedLastGameImpact).toFixed(1));
}

function matchScoreSwing(selfScore, opponentScore, expectedGap) {
  if (selfScore > opponentScore) {
    return expectedGap >= 8 ? 1.0 : expectedGap <= -8 ? 2.5 : 1.7;
  }

  if (selfScore < opponentScore) {
    return expectedGap >= 8 ? -2.5 : expectedGap <= -8 ? -1.0 : -1.7;
  }

  if (expectedGap >= 3) return -0.7;
  if (expectedGap <= -3) return 1.2;
  return 0.1;
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

async function savePredictionHistory() {
  await predictionHistoryStore.save(predictionHistory);
}

async function updatePredictionHistory(matches, teams) {
  let changed = false;

  matches.forEach((match) => {
    const key = String(match.id);
    const existing = predictionHistory.matches[key];

    if (isScheduledStatus(match.status) && match.prediction) {
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

    if (isLiveStatus(match.status) && match.prediction) {
      if (!existing) {
        predictionHistory.matches[key] = createLiveOnlyRecord(match, teams);
        changed = true;
      } else if (!existing.result) {
        existing.livePrediction = snapshotPrediction(match, teams);
        existing.liveScore = match.actualScore ? snapshotResult(match, teams) : null;
        existing.liveUpdatedAt = new Date().toISOString();
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
      } else if (existing.initialPrediction && !existing.evaluation) {
        existing.evaluation = evaluatePrediction(existing.initialPrediction, {
          home: existing.result.homeGoals,
          away: existing.result.awayGoals,
        });
        existing.completedAt = existing.completedAt || new Date().toISOString();
        changed = true;
      }
    }
  });

  if (changed) {
    await savePredictionHistory();
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

function createLiveOnlyRecord(match, teams) {
  return {
    id: match.id,
    group: match.group,
    date: match.timestamp,
    home: teams[match.home]?.name,
    away: teams[match.away]?.name,
    initialPrediction: null,
    latestPrediction: null,
    livePrediction: snapshotPrediction(match, teams),
    liveScore: match.actualScore ? snapshotResult(match, teams) : null,
    result: null,
    evaluation: null,
    createdAt: new Date().toISOString(),
    liveUpdatedAt: new Date().toISOString(),
  };
}

function attachPredictionSnapshots(matches) {
  matches.forEach((match) => {
    const record = predictionHistory.matches[String(match.id)];
    if (!record) return;

    match.initialPrediction = record.initialPrediction || null;
    match.latestPrediction = record.latestPrediction || null;
    match.livePrediction = record.livePrediction || null;
    match.historyEvaluation = record.evaluation || null;
  });
}

function snapshotPrediction(match, teams) {
  return {
    home: teams[match.home]?.name,
    away: teams[match.away]?.name,
    homeGoals: match.prediction.homeGoals,
    awayGoals: match.prediction.awayGoals,
    expectedGoals: match.prediction.expectedGoals,
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
  const homeGoalError = Math.abs(prediction.homeGoals - actualScore.home);
  const awayGoalError = Math.abs(prediction.awayGoals - actualScore.away);
  const totalGoalError = homeGoalError + awayGoalError;
  const expectedHome = Number(prediction.expectedGoals?.home);
  const expectedAway = Number(prediction.expectedGoals?.away);

  return {
    exactScore: prediction.homeGoals === actualScore.home && prediction.awayGoals === actualScore.away,
    winner: predictedWinner === actualWinner && actualWinner !== "draw",
    draw: predictedWinner === "draw" && actualWinner === "draw",
    loser:
      predictedWinner === actualWinner &&
      actualWinner !== "draw" &&
      resultDirection(prediction.awayGoals, prediction.homeGoals) === resultDirection(actualScore.away, actualScore.home),
    direction: predictedWinner === actualWinner,
    homeGoalError,
    awayGoalError,
    totalGoalError,
    totalGoalsError: Math.abs(prediction.homeGoals + prediction.awayGoals - actualScore.home - actualScore.away),
    expectedGoalError:
      Number.isFinite(expectedHome) && Number.isFinite(expectedAway)
        ? Number((Math.abs(expectedHome - actualScore.home) + Math.abs(expectedAway - actualScore.away)).toFixed(2))
        : null,
    favoriteChance: prediction.favoriteChance || Math.max(prediction.homeChance || 0, prediction.awayChance || 0),
  };
}

function normalizedEvaluationRecord(record) {
  if (!record?.initialPrediction || !record?.result) return record;

  const computed = evaluatePrediction(record.initialPrediction, {
    home: record.result.homeGoals,
    away: record.result.awayGoals,
  });

  return {
    ...record,
    evaluation: {
      ...computed,
      ...(record.evaluation || {}),
    },
  };
}

function modelCalibration() {
  const records = Object.values(predictionHistory.matches || {}).map(normalizedEvaluationRecord);
  const evaluated = records.filter((record) => record.evaluation && record.initialPrediction && record.result);
  const total = evaluated.length;

  if (!total) {
    return defaultCalibration(0);
  }

  const actualDraws = evaluated.filter((record) => record.result.winner === "draw").length;
  const predictedDraws = evaluated.filter((record) => record.initialPrediction.winner === "draw").length;
  const directionHits = evaluated.filter((record) => record.evaluation.direction).length;
  const exactHits = evaluated.filter((record) => record.evaluation.exactScore).length;
  const confidenceFactor = clamp(total / 12, 0.15, 1);
  const directionRate = directionHits / total;
  const exactRate = exactHits / total;
  const drawGap = (actualDraws - predictedDraws) / total;
  const goalStats = evaluated.reduce(
    (acc, record) => {
      const predictedTotal = Number(record.initialPrediction.homeGoals || 0) + Number(record.initialPrediction.awayGoals || 0);
      const actualTotal = Number(record.result.homeGoals || 0) + Number(record.result.awayGoals || 0);

      acc.totalGoalError += Number(record.evaluation.totalGoalError || Math.abs(predictedTotal - actualTotal));
      acc.predictedGoals += predictedTotal;
      acc.actualGoals += actualTotal;
      return acc;
    },
    { totalGoalError: 0, predictedGoals: 0, actualGoals: 0 }
  );
  const averageGoalError = goalStats.totalGoalError / total;
  const averagePredictedGoals = goalStats.predictedGoals / total;
  const averageActualGoals = goalStats.actualGoals / total;
  const goalBias = averagePredictedGoals - averageActualGoals;
  const goalErrorPressure = clamp((averageGoalError - 1.2) / 3, 0, 1);
  const biasCorrection = clamp(1 - goalBias * 0.045 * confidenceFactor, 0.9, 1.08);
  const cautionCorrection = clamp(1 - goalErrorPressure * 0.05 * confidenceFactor, 0.95, 1);
  const goalVolumeMultiplier = clamp(biasCorrection * cautionCorrection, 0.88, 1.08);

  return {
    evaluated: total,
    confidenceFactor: Number(confidenceFactor.toFixed(2)),
    directionRate: Number(directionRate.toFixed(2)),
    exactRate: Number(exactRate.toFixed(2)),
    averageGoalError: Number(averageGoalError.toFixed(2)),
    goalBias: Number(goalBias.toFixed(2)),
    goalVolumeMultiplier: Number(goalVolumeMultiplier.toFixed(3)),
    drawBias: Number(clamp(drawGap * 10 * confidenceFactor, -4, 6).toFixed(2)),
    diffMultiplier: Number(clamp(1 - (0.55 - directionRate) * 0.35 * confidenceFactor, 0.82, 1.12).toFixed(2)),
    formMultiplier: Number(clamp(2.8 - (0.5 - directionRate) * 0.45 * confidenceFactor, 2.35, 3.15).toFixed(2)),
    profileMultiplier: Number(clamp(1 - (0.45 - exactRate) * 0.18 * confidenceFactor, 0.85, 1.08).toFixed(2)),
    playerImpactMultiplier: Number(clamp(1 - (0.5 - directionRate) * 0.25 * confidenceFactor, 0.82, 1.15).toFixed(2)),
  };
}

function defaultCalibration(evaluated) {
  return {
    evaluated,
    confidenceFactor: 0,
    directionRate: 0,
    exactRate: 0,
    averageGoalError: 0,
    goalBias: 0,
    goalVolumeMultiplier: 1,
    drawBias: 0,
    diffMultiplier: 1,
    formMultiplier: 2.8,
    profileMultiplier: 1,
    playerImpactMultiplier: 1,
  };
}

function getPredictionHistorySummary() {
  const records = Object.values(predictionHistory.matches).map(normalizedEvaluationRecord);
  const evaluated = records.filter((record) => record.evaluation);
  const awaitingResult = records.filter((record) => record.initialPrediction && !record.result);
  const resultWithoutPrediction = records.filter((record) => !record.initialPrediction && record.result);

  const summary = evaluated.reduce(
    (acc, record) => {
      acc.exactScore += record.evaluation.exactScore ? 1 : 0;
      acc.winner += record.evaluation.winner ? 1 : 0;
      acc.draw += record.evaluation.draw ? 1 : 0;
      acc.direction += record.evaluation.direction ? 1 : 0;
      acc.totalGoalError += Number(record.evaluation.totalGoalError || 0);
      acc.totalGoalsError += Number(record.evaluation.totalGoalsError || 0);
      acc.expectedGoalError += Number(record.evaluation.expectedGoalError || 0);
      return acc;
    },
    { exactScore: 0, winner: 0, draw: 0, direction: 0, totalGoalError: 0, totalGoalsError: 0, expectedGoalError: 0 }
  );
  summary.averageGoalError = evaluated.length ? Number((summary.totalGoalError / evaluated.length).toFixed(2)) : 0;
  summary.averageTotalGoalsError = evaluated.length ? Number((summary.totalGoalsError / evaluated.length).toFixed(2)) : 0;
  summary.averageExpectedGoalError = evaluated.length ? Number((summary.expectedGoalError / evaluated.length).toFixed(2)) : 0;

  return {
    total: records.length,
    evaluated: evaluated.length,
    awaitingResult: awaitingResult.length,
    resultWithoutPrediction: resultWithoutPrediction.length,
    summary,
    probabilityBuckets: buildProbabilityBuckets(evaluated),
    calibration: modelCalibration(),
    matches: records.sort((a, b) => (a.date || 0) - (b.date || 0)),
  };
}

function buildProbabilityBuckets(records) {
  const bucketDefinitions = [
    { min: 0, max: 49, label: "ate 49%" },
    { min: 50, max: 59, label: "50-59%" },
    { min: 60, max: 69, label: "60-69%" },
    { min: 70, max: 79, label: "70-79%" },
    { min: 80, max: 100, label: "80%+" },
  ];

  return bucketDefinitions
    .map((bucket) => {
      const matches = records.filter((record) => {
        const chance = Number(record.initialPrediction?.favoriteChance || record.evaluation?.favoriteChance || 0);
        return chance >= bucket.min && chance <= bucket.max;
      });
      const hits = matches.filter((record) => record.evaluation?.direction).length;

      return {
        label: bucket.label,
        total: matches.length,
        hits,
        rate: matches.length ? Math.round((hits / matches.length) * 100) : 0,
      };
    })
    .filter((bucket) => bucket.total > 0);
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

async function startServer() {
  await initializePersistence();

  server.listen(PORT, () => {
    console.log(`Copa app rodando em http://localhost:${PORT}`);
  });

  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  attachPredictionSnapshots,
  buildTeamStrength,
  createEmptyPredictionHistory,
  evaluatePrediction,
  getSeedRank,
  isFinished,
  isLiveStatus,
  isScheduledStatus,
  modelCalibration,
  predictMatch,
  rankingRows,
  rankingWeight,
  resultDirection,
  startServer,
  _test: {
    setPredictionHistory(history) {
      predictionHistory = normalizePredictionHistory(history);
    },
    getPredictionHistory() {
      return predictionHistory;
    },
    setPredictionHistoryStore(store) {
      predictionHistoryStore = store;
    },
    updatePredictionHistory,
  },
};
