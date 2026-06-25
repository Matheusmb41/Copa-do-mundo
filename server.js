const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
loadEnvFile();

const HISTORY_FILE = path.join(DATA_DIR, "prediction-history.json");
const HISTORY_SEED_FILE = path.join(DATA_DIR, "prediction-history.seed.json");
const HISTORY_RECOVERY_FILE = path.join(DATA_DIR, "prediction-history.recovery.json");
const SUMMARY_CACHE_FILE = path.join(DATA_DIR, "espn-summary-cache.json");
const SIMULATION_HISTORY_FILE = path.join(DATA_DIR, "simulation-history.json");
const API_BASE_URL = "https://v3.football.api-sports.io";
const ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_SEASON = Number(process.env.WORLD_CUP_SEASON || 2026);
const CACHE_MS = Number(process.env.API_CACHE_MS || 1000 * 60 * 2);
const PLAYER_SUMMARY_LIMIT = Number(process.env.PLAYER_SUMMARY_LIMIT || 128);
const SIMULATION_RUNS = Number(process.env.SIMULATION_RUNS || 30000);
const SIMULATION_CACHE_MS = Number(process.env.SIMULATION_CACHE_MS || CACHE_MS);
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Europe/Lisbon";
const NEUTRAL_MATCH_BASE_GOALS = 1.13;
const FIFA_RANKING_SOURCE = "Ranking FIFA masculino - base manual revisada em 2026-06-19";
const MODEL_VERSION = "v3-poisson-dixon-coles";

let cache = {
  expiresAt: 0,
  data: null,
};
let simulationCache = {
  key: "",
  expiresAt: 0,
  data: null,
};
let simulationBuildPromise = null;
let simulationBuildKey = "";

let predictionHistory = createEmptyPredictionHistory();
let predictionHistoryStore = createPredictionHistoryStore();
let simulationHistory = createEmptySimulationHistory();
let simulationHistoryStore = createSimulationHistoryStore();
let summaryCache = loadSummaryCache();
let backgroundRefreshTimer = null;
let backgroundRefreshRunning = false;

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
  Australia: "Austrália",
  Austria: "Áustria",
  Belgium: "Bélgica",
  Brazil: "Brasil",
  Canada: "Canadá",
  Colombia: "Colômbia",
  Croatia: "Croácia",
  Czechia: "Tchequia",
  "Czech Republic": "Tchequia",
  Denmark: "Dinamarca",
  Ecuador: "Equador",
  Egypt: "Egito",
  England: "Inglaterra",
  France: "França",
  Germany: "Alemanha",
  Ghana: "Gana",
  Iran: "Irã",
  Iraq: "Iraque",
  Italy: "Itália",
  Japan: "Japão",
  Jordan: "Jordânia",
  Mexico: "México",
  Morocco: "Marrocos",
  Netherlands: "Países Baixos",
  "New Zealand": "Nova Zelândia",
  Norway: "Noruega",
  Panama: "Panamá",
  Paraguay: "Paraguai",
  Portugal: "Portugal",
  Qatar: "Catar",
  "Saudi Arabia": "Arábia Saudita",
  Scotland: "Escócia",
  Senegal: "Senegal",
  Serbia: "Sérvia",
  "South Africa": "África do Sul",
  "South Korea": "Coreia do Sul",
  Spain: "Espanha",
  Switzerland: "Suíça",
  Sweden: "Suécia",
  Tunisia: "Tunísia",
  Uruguay: "Uruguai",
  USA: "Estados Unidos",
  "United States": "Estados Unidos",
  Uzbekistan: "Uzbequistão",
  "Bosnia and Herzegovina": "Bósnia e Herzegovina",
  "Bosnia-Herzegovina": "Bósnia e Herzegovina",
  "Congo DR": "RD Congo",
  "DR Congo": "RD Congo",
  "RD Congo": "RD Congo",
  "Cape Verde Islands": "Cabo Verde",
  "Cape Verde": "Cabo Verde",
  "Ivory Coast": "Costa do Marfim",
  "Republic of Ireland": "República da Irlanda",
  "United Arab Emirates": "Emirados Árabes Unidos",
  Algeria: "Argélia",
  Curacao: "Curaçao",
  "Curaçao": "Curaçao",
  "CuraÃ§ao": "Curaçao",
  Türkiye: "Turquia",
  Turkiye: "Turquia",
  "Africa do Sul": "África do Sul",
  "Arabia Saudita": "Arábia Saudita",
  Belgica: "Bélgica",
  "Bosnia e Herzegovina": "Bósnia e Herzegovina",
  Croacia: "Croácia",
  Escocia: "Escócia",
  Franca: "França",
  Ira: "Irã",
  Italia: "Itália",
  Japao: "Japão",
  Jordania: "Jordânia",
  "Nova Zelandia": "Nova Zelândia",
  "Paises Baixos": "Países Baixos",
  Panama: "Panamá",
  Suica: "Suíça",
  Suecia: "Suécia",
  Tunisia: "Tunísia",
  Uzbequistao: "Uzbequistão",
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

function createEmptySimulationHistory() {
  return { version: 1, snapshots: [] };
}

function createPredictionHistoryStore() {
  if (process.env.DATABASE_URL) {
    return createPostgresPredictionHistoryStore();
  }

  return createFilePredictionHistoryStore();
}

function createSimulationHistoryStore() {
  if (process.env.DATABASE_URL) {
    return createPostgresSimulationHistoryStore();
  }

  return createFileSimulationHistoryStore();
}

function createFilePredictionHistoryStore() {
  return {
    name: "json-file",
    async load() {
      const seed = loadPredictionHistorySeed();
      if (!fs.existsSync(HISTORY_FILE)) {
        return seed;
      }

      try {
        const parsed = readJsonFile(HISTORY_FILE);
        return mergePredictionHistories(seed, normalizePredictionHistory(parsed));
      } catch (error) {
        return seed;
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

function createFileSimulationHistoryStore() {
  return {
    name: "json-file",
    async load() {
      if (!fs.existsSync(SIMULATION_HISTORY_FILE)) {
        return createEmptySimulationHistory();
      }

      try {
        return normalizeSimulationHistory(readJsonFile(SIMULATION_HISTORY_FILE));
      } catch (error) {
        return createEmptySimulationHistory();
      }
    },
    async save(history) {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      fs.writeFileSync(SIMULATION_HISTORY_FILE, JSON.stringify(normalizeSimulationHistory(history), null, 2));
    },
  };
}

function createPostgresPredictionHistoryStore() {
  let Pool;

  try {
    ({ Pool } = require("pg"));
  } catch (error) {
    throw new Error("DATABASE_URL foi configurado, mas o pacote pg não está instalado. Rode npm install antes do deploy.");
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

      return mergePredictionHistories(loadPredictionHistorySeed(), normalizePredictionHistory(history));
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

function createPostgresSimulationHistoryStore() {
  let Pool;

  try {
    ({ Pool } = require("pg"));
  } catch (error) {
    throw new Error("DATABASE_URL foi configurado, mas o pacote pg não está instalado. Rode npm install antes do deploy.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });

  return {
    name: "postgres",
    async load() {
      await pool.query(`
        create table if not exists simulation_history (
          id text primary key,
          snapshot jsonb not null,
          created_at timestamptz not null default now()
        )
      `);

      const result = await pool.query("select snapshot from simulation_history order by created_at desc limit 90");
      return normalizeSimulationHistory({
        version: 1,
        snapshots: result.rows.map((row) => row.snapshot).reverse(),
      });
    },
    async save(history) {
      const normalized = normalizeSimulationHistory(history);
      const snapshot = normalized.snapshots[normalized.snapshots.length - 1];
      if (!snapshot?.id) return;

      await pool.query(`
        create table if not exists simulation_history (
          id text primary key,
          snapshot jsonb not null,
          created_at timestamptz not null default now()
        )
      `);

      await pool.query(
        `
          insert into simulation_history (id, snapshot, created_at)
          values ($1, $2, now())
          on conflict (id) do update
          set snapshot = excluded.snapshot,
              created_at = now()
        `,
        [snapshot.id, snapshot]
      );
    },
  };
}

function normalizePredictionHistory(history) {
  return {
    version: history?.version || 1,
    matches: history?.matches && typeof history.matches === "object" ? history.matches : {},
  };
}

function normalizeSimulationHistory(history) {
  const snapshots = Array.isArray(history?.snapshots) ? history.snapshots : [];
  return {
    version: history?.version || 1,
    snapshots: snapshots.slice(-90),
  };
}

function loadPredictionHistorySeed() {
  const seed = readPredictionHistoryFile(HISTORY_SEED_FILE);
  const recovery = readPredictionHistoryFile(HISTORY_RECOVERY_FILE);
  return mergePredictionHistories(seed, recovery);
}

function readPredictionHistoryFile(filePath) {
  if (!fs.existsSync(filePath)) return createEmptyPredictionHistory();

  try {
    return normalizePredictionHistory(readJsonFile(filePath));
  } catch (error) {
    return createEmptyPredictionHistory();
  }
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function mergePredictionHistories(seedHistory, storedHistory) {
  const seed = normalizePredictionHistory(seedHistory);
  const stored = normalizePredictionHistory(storedHistory);
  const merged = {
    version: Math.max(seed.version || 1, stored.version || 1),
    matches: { ...seed.matches },
  };

  Object.entries(stored.matches).forEach(([id, storedRecord]) => {
    const seedRecord = seed.matches[id];
    merged.matches[id] = mergePredictionRecord(seedRecord, storedRecord);
  });

  return merged;
}

function mergePredictionRecord(seedRecord, storedRecord) {
  if (!seedRecord) return storedRecord;
  if (!storedRecord) return seedRecord;

  const initialPrediction = storedRecord.initialPrediction || seedRecord.initialPrediction || null;
  const latestPrediction =
    storedRecord.latestPrediction || seedRecord.latestPrediction || initialPrediction || null;

  return {
    ...seedRecord,
    ...storedRecord,
    initialPrediction,
    latestPrediction,
    evaluatedPrediction:
      storedRecord.evaluatedPrediction || seedRecord.evaluatedPrediction || null,
    result: storedRecord.result || seedRecord.result || null,
    evaluation: storedRecord.evaluation || seedRecord.evaluation || null,
    versionPredictions: {
      ...(seedRecord.versionPredictions || {}),
      ...(storedRecord.versionPredictions || {}),
    },
    versionEvaluations: {
      ...(seedRecord.versionEvaluations || {}),
      ...(storedRecord.versionEvaluations || {}),
    },
    createdAt: storedRecord.createdAt || seedRecord.createdAt,
    updatedAt: storedRecord.updatedAt || seedRecord.updatedAt,
  };
}

async function initializePersistence() {
  predictionHistoryStore = createPredictionHistoryStore();
  predictionHistory = await predictionHistoryStore.load();
  simulationHistoryStore = createSimulationHistoryStore();
  simulationHistory = await simulationHistoryStore.load();
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
  const safeName = fixMojibake(name);
  const winnerGroup = /^Winner Group ([A-Z])$/i.exec(safeName);
  if (winnerGroup) return `Vencedor do Grupo ${winnerGroup[1].toUpperCase()}`;

  const runnerUpGroup = /^Runner-up Group ([A-Z])$/i.exec(safeName);
  if (runnerUpGroup) return `2º lugar do Grupo ${runnerUpGroup[1].toUpperCase()}`;

  const groupWinner = /^Group ([A-Z]) Winner$/i.exec(safeName);
  if (groupWinner) return `Vencedor do Grupo ${groupWinner[1].toUpperCase()}`;

  const groupSecond = /^Group ([A-Z]) 2nd Place$/i.exec(safeName);
  if (groupSecond) return `2º lugar do Grupo ${groupSecond[1].toUpperCase()}`;

  const thirdPlace = /^Third Place Group ([A-Z/]+)$/i.exec(safeName);
  if (thirdPlace) return `3º colocado dos Grupos ${thirdPlace[1].toUpperCase()}`;

  const round32Winner = /^Round of 32 (\d+) Winner$/i.exec(safeName);
  if (round32Winner) return `Vencedor do jogo ${round32Winner[1]} dos 16 avos`;

  const round16Winner = /^Round of 16 (\d+) Winner$/i.exec(safeName);
  if (round16Winner) return `Vencedor do jogo ${round16Winner[1]} das oitavas`;

  const quarterWinner = /^Quarterfinal (\d+) Winner$/i.exec(safeName);
  if (quarterWinner) return `Vencedor do jogo ${quarterWinner[1]} das quartas`;

  const semifinalWinner = /^Semifinal (\d+) Winner$/i.exec(safeName);
  if (semifinalWinner) return `Vencedor da semifinal ${semifinalWinner[1]}`;

  const semifinalLoser = /^Semifinal (\d+) Loser$/i.exec(safeName);
  if (semifinalLoser) return `Perdedor da semifinal ${semifinalLoser[1]}`;

  return teamNamePtBr[safeName] || safeName;
}

function fixMojibake(value) {
  const text = String(value || "");
  if (!/[ÃÂ]/.test(text)) return text;

  try {
    return Buffer.from(text, "latin1").toString("utf8");
  } catch (error) {
    return text;
  }
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

function normalizeOutcomeChances(home, draw, away) {
  const values = [
    { key: "homeChance", value: Math.max(0.01, home) },
    { key: "drawChance", value: Math.max(0.01, draw) },
    { key: "awayChance", value: Math.max(0.01, away) },
  ];
  const total = values.reduce((sum, item) => sum + item.value, 0) || 1;
  const normalized = values.map((item) => {
    const exact = (item.value / total) * 100;
    return {
      ...item,
      exact,
      rounded: Math.floor(exact),
      fraction: exact - Math.floor(exact),
    };
  });
  let remaining = 100 - normalized.reduce((sum, item) => sum + item.rounded, 0);

  normalized
    .sort((a, b) => b.fraction - a.fraction)
    .forEach((item) => {
      if (remaining <= 0) return;
      item.rounded += 1;
      remaining -= 1;
    });

  return Object.fromEntries(normalized.map((item) => [item.key, item.rounded]));
}

function poissonProbability(goals, expectedGoalsValue) {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) {
    factorial *= value;
  }

  return (Math.exp(-expectedGoalsValue) * expectedGoalsValue ** goals) / factorial;
}

function dixonColesAdjustment(homeGoals, awayGoals, expectedHome, expectedAway, rho) {
  if (homeGoals === 0 && awayGoals === 0) return 1 - expectedHome * expectedAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + expectedHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + expectedAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

const scoreProbabilityMatrixCache = new Map();

function scoreProbabilityMatrix(expectedHome, expectedAway, calibration = defaultCalibration(0)) {
  const rho = Number(calibration.dixonColesRho ?? -0.08);
  const cacheKey = `${Number(expectedHome).toFixed(3)}:${Number(expectedAway).toFixed(3)}:${rho.toFixed(3)}`;
  if (scoreProbabilityMatrixCache.has(cacheKey)) return scoreProbabilityMatrixCache.get(cacheKey);

  const highestExpected = Math.max(expectedHome, expectedAway);
  const maxGoals = clamp(Math.ceil(highestExpected + 4 * Math.sqrt(highestExpected)), 6, 10);
  const scorelines = [];
  let rawTotal = 0;

  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    const homeProbability = poissonProbability(homeGoals, expectedHome);

    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      const awayProbability = poissonProbability(awayGoals, expectedAway);
      const adjustment = dixonColesAdjustment(homeGoals, awayGoals, expectedHome, expectedAway, rho);
      const rawProbability = Math.max(0, homeProbability * awayProbability * adjustment);

      scorelines.push({ homeGoals, awayGoals, rawProbability });
      rawTotal += rawProbability;
    }
  }

  const normalized = scorelines
    .map((scoreline) => ({
      homeGoals: scoreline.homeGoals,
      awayGoals: scoreline.awayGoals,
      probability: rawTotal ? scoreline.rawProbability / rawTotal : 0,
    }))
    .sort(
      (first, second) =>
        second.probability - first.probability ||
        first.homeGoals + first.awayGoals - (second.homeGoals + second.awayGoals) ||
        first.homeGoals - second.homeGoals
    );
  const outcomes = normalized.reduce(
    (accumulator, scoreline) => {
      if (scoreline.homeGoals > scoreline.awayGoals) accumulator.home += scoreline.probability;
      else if (scoreline.homeGoals < scoreline.awayGoals) accumulator.away += scoreline.probability;
      else accumulator.draw += scoreline.probability;
      return accumulator;
    },
    { home: 0, draw: 0, away: 0 }
  );
  const chances = normalizeOutcomeChances(outcomes.home, outcomes.draw, outcomes.away);
  const topScorelines = normalized.slice(0, 3).map((scoreline) => ({
    homeGoals: scoreline.homeGoals,
    awayGoals: scoreline.awayGoals,
    probability: Number((scoreline.probability * 100).toFixed(1)),
  }));

  const matrix = {
    homeGoals: topScorelines[0]?.homeGoals ?? 0,
    awayGoals: topScorelines[0]?.awayGoals ?? 0,
    scorelineChance: topScorelines[0]?.probability ?? 0,
    topScorelines,
    scorelines: normalized,
    chances,
    rho: Number(rho.toFixed(3)),
  };

  if (scoreProbabilityMatrixCache.size > 5000) scoreProbabilityMatrixCache.clear();
  scoreProbabilityMatrixCache.set(cacheKey, matrix);
  return matrix;
}

function scorelineDirection(scoreline) {
  return resultDirection(scoreline.homeGoals, scoreline.awayGoals);
}

function scorelineFromMatrix(matrix, outcome = null, rng = null, maxCandidates = null) {
  const allCandidates = outcome
    ? matrix.scorelines.filter((scoreline) => scorelineDirection(scoreline) === outcome)
    : matrix.scorelines;
  const candidates = maxCandidates ? allCandidates.slice(0, maxCandidates) : allCandidates;
  if (!candidates.length) return { home: 0, away: 0, probability: 0, source: "prediction" };

  if (!rng) {
    const scoreline = candidates[0];
    return {
      home: scoreline.homeGoals,
      away: scoreline.awayGoals,
      probability: Number((scoreline.probability * 100).toFixed(1)),
      source: "prediction",
    };
  }

  const total = candidates.reduce((sum, scoreline) => sum + scoreline.probability, 0) || 1;
  let roll = rng() * total;

  for (const scoreline of candidates) {
    roll -= scoreline.probability;
    if (roll <= 0) {
      return {
        home: scoreline.homeGoals,
        away: scoreline.awayGoals,
        probability: Number((scoreline.probability * 100).toFixed(1)),
        source: "prediction",
      };
    }
  }

  const scoreline = candidates[candidates.length - 1];
  return {
    home: scoreline.homeGoals,
    away: scoreline.awayGoals,
    probability: Number((scoreline.probability * 100).toFixed(1)),
    source: "prediction",
  };
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
  const expectedHome = expectedGoals(
    NEUTRAL_MATCH_BASE_GOALS + diff / 33 + attackGapHome / 42 + formGap / 85 + playerGap / 70,
    calibration
  );
  const expectedAway = expectedGoals(
    NEUTRAL_MATCH_BASE_GOALS - diff / 33 + attackGapAway / 42 - formGap / 85 - playerGap / 70,
    calibration
  );
  const scoreModel = scoreProbabilityMatrix(expectedHome, expectedAway, calibration);
  const chances = scoreModel.chances;
  const { homeGoals, awayGoals } = scoreModel;
  const favoriteChance = Math.max(chances.homeChance, chances.awayChance);
  const agreement = Math.sign(diff || 0) === Math.sign((expectedHome - expectedAway) || 0) ? 6 : -4;
  const confidence = clamp(
    Math.round(42 + Math.abs(diff) * 0.9 + Math.abs(expectedHome - expectedAway) * 7 + favoriteChance * 0.12 + agreement),
    38,
    91
  );

  return {
    homeGoals,
    awayGoals,
    expectedGoals: {
      home: Number(expectedHome.toFixed(2)),
      away: Number(expectedAway.toFixed(2)),
    },
    homeChance: chances.homeChance,
    drawChance: chances.drawChance,
    awayChance: chances.awayChance,
    favoriteChance,
    scorelineChance: scoreModel.scorelineChance,
    topScorelines: scoreModel.topScorelines,
    confidence,
    reason: buildReason(home, away, diff, homeWeight, awayWeight, expectedHome, expectedAway),
    scoreModel: {
      method: "Poisson com correção Dixon-Coles",
      rho: scoreModel.rho,
    },
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
  const evaluated = calibration.effectiveEvaluated ?? calibration.evaluated ?? 0;
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
    return `Jogo equilibrado: ${home.name} tem peso ${homeWeight.toFixed(1)} e ${away.name} tem peso ${awayWeight.toFixed(1)}. Os gols esperados ficaram em ${expectedHome.toFixed(2)} x ${expectedAway.toFixed(2)}, então a premonição preserva chance relevante de empate.`;
  }

  return `${stronger.name} aparece acima por ${gap} pontos de peso contra ${weaker.name}. O modelo combina ranking FIFA, forma na Copa, força dos adversários, ataque/defesa e média dos principais jogadores. Depois, transforma os gols esperados (${expectedHome.toFixed(2)} x ${expectedAway.toFixed(2)}) em uma matriz probabilística de placares.`;
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

function datePartsInTimeZone(date, timeZone = APP_TIME_ZONE) {
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
}

function calendarKey(date, timeZone = APP_TIME_ZONE) {
  const parts = datePartsInTimeZone(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatMatchDay(isoDate, now = new Date(), timeZone = APP_TIME_ZONE) {
  const date = new Date(isoDate);

  if (calendarKey(date, timeZone) === calendarKey(now, timeZone)) return "Hoje";
  if (calendarKey(date, timeZone) === calendarKey(addDays(now, 1), timeZone)) return "Amanhã";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
    .format(date)
    .replace(".", "");
}

function formatMatchTime(isoDate, status, timeZone = APP_TIME_ZONE) {
  if (isFinished(status?.short)) return "Finalizado";
  if (isLiveStatus(status?.short)) return "Ao vivo";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

async function apiRequest(pathname) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY não configurada no servidor.");
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
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${ESPN_BASE_URL}${pathname}`);

      if (!response.ok) {
        throw new Error(`ESPN respondeu com status ${response.status}.`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 350));
      }
    }
  }

  throw lastError;
}

async function findWorldCupLeague(season) {
  const leagues = await apiRequest(`/leagues?search=World%20Cup&season=${season}`);
  const exact = leagues.find((item) => normalizeName(item.league.name) === "world cup");
  const loose = leagues.find((item) => normalizeName(item.league.name).includes("world cup"));
  const selected = exact || loose;

  if (!selected) {
    throw new Error(`Não encontrei a Copa do Mundo na temporada ${season}.`);
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

async function buildWorldCupPayload(options = {}) {
  const { force = false } = options;
  const now = Date.now();
  if (!force && cache.data && cache.expiresAt > now) {
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
    timeZone: APP_TIME_ZONE,
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
    throw new Error(`ESPN não retornou jogos para a Copa ${season}.`);
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
    const players = Array.isArray(playerImpact.players) ? playerImpact.players : Object.values(playerImpact.players || {});
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
      : "Ainda não jogou nesta Copa; peso preso ao ranking base.";
  });

  applyRankingMovement(events, teams);

  const matches = events
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((event) => {
      const match = convertEspnEvent(event, teams);
      if (isFinished(match.status) && match.actualScore) {
        match.backfillPrediction = buildPreMatchPredictionFromEvents(event, teams, events);
      }
      return match;
    });
  const groups = buildGroupStandings(matches, teams);

  await updatePredictionHistory(matches, teams);
  attachPredictionSnapshots(matches);

  matches.forEach((match) => {
    delete match.backfillPrediction;
  });

  Object.values(teams).forEach((team) => {
    delete team.sourceId;
  });

  return {
    source: "espn-public",
    season,
    timeZone: APP_TIME_ZONE,
    updatedAt: new Date().toISOString(),
    rankingSource: FIFA_RANKING_SOURCE,
    historyStorage: predictionHistoryStore.name,
    calibration: modelCalibration(),
    teams,
    matches,
    groups,
  };
}

function buildPreMatchPredictionFromEvents(targetEvent, currentTeams, events) {
  const competition = targetEvent.competitions?.[0];
  const competitors = competition?.competitors || [];
  const home = competitors.find((item) => item.homeAway === "home") || competitors[0];
  const away = competitors.find((item) => item.homeAway === "away") || competitors[1];

  if (!home?.team?.id || !away?.team?.id) return null;

  const snapshotTeams = buildTeamSnapshotBeforeEvent(targetEvent, currentTeams, events);
  const homeKey = `espn_${home.team.id}`;
  const awayKey = `espn_${away.team.id}`;

  if (!snapshotTeams[homeKey] || !snapshotTeams[awayKey]) return null;

  return predictMatch(
    {
      id: Number(targetEvent.id),
      home: homeKey,
      away: awayKey,
    },
    snapshotTeams
  );
}

function buildTeamSnapshotBeforeEvent(targetEvent, currentTeams, events) {
  const targetTime = eventTime(targetEvent);
  const snapshotTeams = Object.fromEntries(
    Object.entries(currentTeams).map(([key, team]) => [
      key,
      {
        name: team.name,
        logo: team.logo || "",
        flagCode: team.flagCode || "",
        fifaRank: team.fifaRank,
        form: 0,
        attack: 1,
        defense: 1,
        weight: rankingWeight(team.fifaRank),
        lastMatch: "Premonição reconstruída com dados anteriores ao jogo.",
        sourceId: team.sourceId || key.replace(/^espn_/, ""),
        placeholder: Boolean(team.placeholder),
        playerImpact: 0,
        playerHighlights: [],
        players: [],
      },
    ])
  );
  const teamRecords = {};
  const statTotals = {};

  if (!Number.isFinite(targetTime)) {
    applySnapshotTeamStrengths(snapshotTeams, teamRecords, statTotals);
    return snapshotTeams;
  }

  events
    .slice()
    .sort((a, b) => eventTime(a) - eventTime(b))
    .forEach((event) => {
      if (event === targetEvent || eventTime(event) >= targetTime) return;

      const competition = event.competitions?.[0];
      if (!competition?.status?.type?.completed) return;

      const competitors = competition.competitors || [];
      competitors.forEach((competitor) => {
        ensureSnapshotTeam(snapshotTeams, competitor.team);
        ensureTeamRecord(teamRecords, competitor.team.id);
        ensureStatTotal(statTotals, competitor.team.id);
      });

      const home = competitors.find((item) => item.homeAway === "home");
      const away = competitors.find((item) => item.homeAway === "away");
      if (!home || !away) return;

      const homeScore = Number(home.score);
      const awayScore = Number(away.score);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;

      applyResult(teamRecords, home.team.id, away.team.id, homeScore, awayScore);
      applyOpponentQuality(teamRecords, home, away);
      applyCompetitorStats(statTotals, home);
      applyCompetitorStats(statTotals, away);
    });

  applySnapshotTeamStrengths(snapshotTeams, teamRecords, statTotals);
  return snapshotTeams;
}

function ensureSnapshotTeam(snapshotTeams, apiTeam) {
  const key = `espn_${apiTeam.id}`;
  if (snapshotTeams[key]) return;

  const originalName = apiTeam.displayName || apiTeam.name;
  const name = translateTeamName(originalName);
  snapshotTeams[key] = {
    name,
    logo: apiTeam.logo || "",
    flagCode: flagCodeForTeam(apiTeam, name),
    fifaRank: getSeedRank(name, getSeedRank(originalName)),
    form: 0,
    attack: 1,
    defense: 1,
    weight: rankingWeight(getSeedRank(name, getSeedRank(originalName))),
    lastMatch: "Premonição reconstruída com dados anteriores ao jogo.",
    sourceId: String(apiTeam.id),
    placeholder: isPlaceholderTeam(originalName),
    playerImpact: 0,
    playerHighlights: [],
    players: [],
  };
}

function applySnapshotTeamStrengths(snapshotTeams, teamRecords, statTotals) {
  Object.values(snapshotTeams).forEach((team) => {
    const sourceId = team.sourceId;
    const record = teamRecords[sourceId] || emptyRecord();
    const stats = statTotals[sourceId] || emptyStats();
    const played = record.played || 0;
    const pointsPerGame = played ? record.points / played : 0;
    const goalDiff = record.goalsFor - record.goalsAgainst;
    const goalsForPerGame = played ? record.goalsFor / played : 0;
    const goalsAgainstPerGame = played ? record.goalsAgainst / played : 0;
    const shotsPerGame = played ? stats.totalShots / played : 0;
    const shotsOnTargetPerGame = played ? stats.shotsOnTarget / played : 0;
    const possession = stats.possessionSamples ? stats.possessionTotal / stats.possessionSamples : 50;
    const opponentStrength = record.opponentSamples ? record.opponentRankWeightTotal / record.opponentSamples : rankingWeight(75);

    team.form = Number((pointsPerGame * 0.85 + goalDiff * 0.22 + shotsOnTargetPerGame * 0.08).toFixed(2));
    team.attack = Number((1 + record.goalsFor * 0.035 + shotsPerGame * 0.006).toFixed(2));
    team.defense = Number((1 - record.goalsAgainst * 0.035 + (possession - 50) * 0.002).toFixed(2));
    team.playerImpact = 0;
    team.playerHighlights = [];
    team.players = [];
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
      topPlayerAverage: 6,
    });
    team.weight = currentWeight(team);
  });
}

function eventTime(event) {
  const time = new Date(event.date).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
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
  const profileBalance = ((attackStrength + defenseStrength) / 2 - context.base) * 0.65 * calibration.profileMultiplier;
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

function normalizePlayerScoreList(players) {
  return Object.values(players || {})
    .map((player) => {
      const games = Number(player.games || 0);
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
    .filter((player) => player.games > 0)
    .sort((a, b) => b.average - a.average || b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
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
    impact.players = normalizePlayerScoreList(impact.players);
  });

  return impacts;
}

function compactPlayerSummary(summary = {}) {
  if (summary.cacheShape === "player-impact-v2") return summary;

  return {
    cacheShape: "player-impact-v2",
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
        position:
          player.position?.abbreviation ||
          player.position?.name ||
          player.athlete?.position?.abbreviation ||
          player.athlete?.position?.name ||
          "",
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
  if (details.position && !player.position) player.position = details.position;

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
      const position = player.position || player.athlete?.position?.abbreviation || "";
      const score = playerScoreFromStats(stats, position);

      impact.attack += goals * 0.18 + assists * 0.12 + shotsOnTarget * 0.03;
      impact.defense -= yellowCards * 0.02 + redCards * 0.25;
      if (score) {
        addPlayerScore(impact, player.athlete || player, score, { goals, assists, position }, true);
      }
    });
  });
}

function playerPositionGroup(position = "") {
  const value = normalizeName(position);
  if (/^(gk|keeper|goalkeeper|goleiro)$/.test(value)) return "goalkeeper";
  if (/^(d|df|def|defender|zagueiro|lateral|cb|lb|rb)$/.test(value)) return "defender";
  if (/^(m|mf|midfielder|meia|volante|cm|dm|am)$/.test(value)) return "midfielder";
  if (/^(f|fw|forward|atacante|striker|winger|st|lw|rw)$/.test(value)) return "forward";
  return "general";
}

function playerScoreFromStats(stats, position = "") {
  const positionGroup = playerPositionGroup(position);
  const appearances = numberStat(stats.appearances);
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
  const foulsCommitted = numberStat(stats.foulsCommitted);
  const foulsSuffered = numberStat(stats.foulsSuffered);
  const offsides = numberStat(stats.offsides);
  const subIns = numberStat(stats.subIns);
  const yellowCards = numberStat(stats.yellowCards);
  const redCards = numberStat(stats.redCards);
  const activity =
    appearances +
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
    foulsCommitted +
    foulsSuffered +
    offsides +
    subIns +
    yellowCards +
    redCards;

  if (!activity) return null;

  const minutesFactor = minutes ? clamp(minutes / 90, 0.25, 1) : appearances ? (subIns ? 0.42 : 0.72) : 0.55;
  const base = minutes ? 5.45 + minutesFactor * 0.65 : appearances ? 5.15 + Math.min(subIns, 1) * 0.15 : 5.75;
  const attack =
    goals * 1.25 +
    assists * 0.85 +
    shotsOnTarget * 0.28 +
    totalShots * 0.08 +
    accuratePasses * 0.01 +
    chancesCreated * 0.18 +
    foulsSuffered * 0.04;
  const defense = defensiveInterventions * 0.14 + tacklesWon * 0.18 + interceptions * 0.2 + clearances * 0.1 + saves * 0.35;
  const penalties = yellowCards * 0.4 + redCards * 1.6 + foulsCommitted * 0.08 + offsides * 0.08;
  const attackMultiplier = positionGroup === "forward" ? 1.15 : positionGroup === "midfielder" ? 1.05 : positionGroup === "defender" ? 0.9 : positionGroup === "goalkeeper" ? 0.45 : 1;
  const defenseMultiplier = positionGroup === "goalkeeper" ? 1.45 : positionGroup === "defender" ? 1.18 : positionGroup === "midfielder" ? 1.05 : positionGroup === "forward" ? 0.82 : 1;
  const weightedAttack = attack * attackMultiplier * minutesFactor;
  const weightedDefense = defense * defenseMultiplier * minutesFactor;

  return {
    attack: weightedAttack,
    defense: weightedDefense,
    total: clamp(base + weightedAttack + weightedDefense - penalties, 0, 10),
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
    totalShots: "chutes",
    shotsOnTarget: "chutes no gol",
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
  const note = fixMojibake(competition.altGameNote || "");
  const group = /Group\s+([A-Z])/i.exec(note);
  if (group) return `Grupo ${group[1].toUpperCase()}`;

  const date = new Date(event.date);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  if ((month === 6 && day >= 28) || (month === 7 && day <= 3) || (month === 7 && day === 4 && date.getUTCHours() < 12)) return "16 avos de final";
  if (month === 7 && ((day === 4 && date.getUTCHours() >= 12) || (day >= 5 && day <= 7))) return "Oitavas de final";
  if (month === 7 && day >= 9 && day <= 12) return "Quartas de final";
  if (month === 7 && day >= 14 && day <= 15) return "Semifinal";
  if (month === 7 && day === 17) return "Semifinal";
  if (month === 7 && day === 18) return "Disputa de 3º lugar";
  if (month === 7 && day === 19) return "Final";

  return translateRoundName(note || event.season?.slug || "Copa do Mundo");
}

function translateRoundName(text) {
  const safeText = fixMojibake(text);
  const group = /Group\s+([A-Z])/i.exec(safeText);
  if (group) return `Grupo ${group[1].toUpperCase()}`;
  if (/Round of 32/i.test(safeText)) return "16 avos de final";
  if (/Round of 16/i.test(safeText)) return "Oitavas de final";
  if (/Quarterfinal/i.test(safeText)) return "Quartas de final";
  if (/Semifinal/i.test(safeText)) return "Semifinal";
  if (/3rd Place/i.test(safeText)) return "Disputa de 3º lugar";
  if (/Final/i.test(safeText)) return "Final";
  if (/World Cup/i.test(safeText)) return "Copa do Mundo";
  return safeText;
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
  const match = /(Group|Grupo)\s+([A-Z])/i.exec(groupText || "");
  if (!match) return null;
  return `Grupo ${match[2].toUpperCase()}`;
}

function ensureStandingTeam(groupTable, teamKey, team) {
  if (groupTable[teamKey]) return;

  groupTable[teamKey] = {
    teamKey,
    name: team?.name || "Seleção",
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
  const baseRows = baseRankingRows(teams);
  const basePositions = Object.fromEntries(baseRows.map((row) => [row.key, row.position]));

  Object.entries(teams).forEach(([teamKey, team]) => {
    if (team.placeholder || !team.sourceId) return;

    const latestEvent = latestFinishedEventForTeam(events, team.sourceId);
    const baseWeight = team.strength?.base ?? rankingWeight(team.fifaRank);
    const previousWeight = latestEvent ? previousWeightBeforeLastMatch(team, latestEvent, team.sourceId, teams) : baseWeight;
    const previousPosition = latestEvent
      ? rankingRows(teams, teamKey, previousWeight).find((row) => row.key === teamKey)?.position || currentPositions[teamKey]
      : basePositions[teamKey] || currentPositions[teamKey];
    const delta = previousPosition - currentPositions[teamKey];

    team.previousWeight = previousWeight;
    team.weightDelta = Number((team.weight - previousWeight).toFixed(1));
    team.previousPosition = previousPosition;
    team.positionDelta = delta;
    team.movement = delta > 0 ? "up" : delta < 0 ? "down" : "same";
    team.movementBasis = latestEvent ? "last-match" : "base-ranking";
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

function baseRankingRows(teams) {
  return Object.entries(teams)
    .filter(([, team]) => !team.placeholder)
    .map(([key, team]) => ({
      key,
      weight: team.strength?.base ?? rankingWeight(team.fifaRank),
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

function simulationCacheKey(payload) {
  return [
    MODEL_VERSION,
    SIMULATION_RUNS,
    (payload?.matches || [])
      .map((match) => {
        const actual = match.actualScore ? `${match.actualScore.home}-${match.actualScore.away}` : "";
        const prediction = match.prediction
          ? [
              match.prediction.homeGoals,
              match.prediction.awayGoals,
              match.prediction.homeChance,
              match.prediction.drawChance,
              match.prediction.awayChance,
              Number(match.prediction.expectedGoals?.home || 0).toFixed(3),
              Number(match.prediction.expectedGoals?.away || 0).toFixed(3),
              Number(match.prediction.scoreModel?.rho ?? -0.08).toFixed(3),
            ].join("-")
          : "";
        return `${match.id}:${match.status}:${actual}:${prediction}`;
      })
      .join("|"),
  ].join("::");
}

function simulationHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function simulationRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function isGroupStageMatch(match) {
  return /(Group|Grupo)\s+[A-Z]/i.test(match.group || "");
}

function isKnockoutMatch(match) {
  return !isGroupStageMatch(match);
}

function simulationGroupName(groupText) {
  const match = /(Group|Grupo)\s+([A-Z])/i.exec(groupText || "");
  return match ? `Grupo ${match[2].toUpperCase()}` : null;
}

function simulationTeam(payload, teamKey) {
  return payload.teams?.[teamKey] || {};
}

function safeSimulationTeamKey(team) {
  return team?.teamKey || team?.key || team?.sourceId || team?.name;
}

function ensureProjectionTeam(table, payload, groupName, teamKey) {
  if (table[groupName][teamKey]) return table[groupName][teamKey];

  const team = simulationTeam(payload, teamKey);
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
}

function applyProjectionResult(home, away, homeScore, awayScore) {
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

function sortProjectionRows(a, b) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    b.weight - a.weight ||
    a.fifaRank - b.fifaRank ||
    a.name.localeCompare(b.name, "pt-BR")
  );
}

function fallbackProjectionScore(payload, match) {
  const home = simulationTeam(payload, match.home);
  const away = simulationTeam(payload, match.away);
  const diff = Number(home.weight || 50) - Number(away.weight || 50);

  if (Math.abs(diff) < 4) return { home: 1, away: 1, source: "fallback" };
  if (diff > 16) return { home: 2, away: 0, source: "fallback" };
  if (diff > 6) return { home: 2, away: 1, source: "fallback" };
  if (diff < -16) return { home: 0, away: 2, source: "fallback" };
  if (diff < -6) return { home: 1, away: 2, source: "fallback" };
  return diff > 0 ? { home: 1, away: 0, source: "fallback" } : { home: 0, away: 1, source: "fallback" };
}

function deterministicProjectionScore(payload, match) {
  if ((isFinished(match.status) || isLiveStatus(match.status)) && match.actualScore) {
    return {
      home: Number(match.actualScore.home || 0),
      away: Number(match.actualScore.away || 0),
      source: isLiveStatus(match.status) ? "live" : "real",
    };
  }

  if (match.prediction) {
    return {
      home: Number(match.prediction.homeGoals || 0),
      away: Number(match.prediction.awayGoals || 0),
      source: "prediction",
    };
  }

  return fallbackProjectionScore(payload, match);
}

function normalizedOutcomeProbabilities(payload, match) {
  if (match.prediction) {
    const home = Number(match.prediction.homeChance || 0);
    const draw = Number(match.prediction.drawChance || 0);
    const away = Number(match.prediction.awayChance || 0);
    const total = home + draw + away || 1;
    return { home: home / total, draw: draw / total, away: away / total };
  }

  const home = simulationTeam(payload, match.home);
  const away = simulationTeam(payload, match.away);
  const diff = Number(home.weight || 50) - Number(away.weight || 50);
  const draw = clamp(0.28 - Math.abs(diff) * 0.003, 0.14, 0.32);
  const homeChance = clamp((1 - draw) * (0.5 + diff * 0.008), 0.08, 0.84);
  const awayChance = Math.max(0.06, 1 - draw - homeChance);
  const total = homeChance + draw + awayChance;

  return { home: homeChance / total, draw: draw / total, away: awayChance / total };
}

function projectionExpectedGoals(payload, match) {
  const base = match.prediction || fallbackProjectionScore(payload, match);
  const fallbackHome = Number(base.homeGoals ?? base.home ?? 1);
  const fallbackAway = Number(base.awayGoals ?? base.away ?? 1);
  const homeBase = Number(base.expectedGoals?.home ?? fallbackHome);
  const awayBase = Number(base.expectedGoals?.away ?? fallbackAway);

  return {
    home: clamp(homeBase, 0.15, 4.8),
    away: clamp(awayBase, 0.15, 4.8),
  };
}

function scoreForOutcome(payload, match, outcome, rng, calibration = modelCalibration()) {
  const expected = projectionExpectedGoals(payload, match);
  const matrix = scoreProbabilityMatrix(expected.home, expected.away, calibration);
  return scorelineFromMatrix(matrix, outcome, rng);
}

function randomProjectionScore(payload, match, rng, calibration = modelCalibration()) {
  if ((isFinished(match.status) || isLiveStatus(match.status)) && match.actualScore) {
    return {
      home: Number(match.actualScore.home || 0),
      away: Number(match.actualScore.away || 0),
      source: isLiveStatus(match.status) ? "live" : "real",
    };
  }

  const probabilities = normalizedOutcomeProbabilities(payload, match);
  const roll = rng();
  if (roll < probabilities.home) return scoreForOutcome(payload, match, "home", rng, calibration);
  if (roll < probabilities.home + probabilities.draw) return scoreForOutcome(payload, match, "draw", rng, calibration);
  return scoreForOutcome(payload, match, "away", rng, calibration);
}

function buildProjectionTables(payload, matches, scoreBuilder) {
  const table = {};
  const sources = { real: 0, live: 0, prediction: 0, fallback: 0 };

  matches.forEach((match) => {
    const groupName = simulationGroupName(match.group);
    if (!groupName || !match.home || !match.away) return;

    table[groupName] = table[groupName] || {};
    const home = ensureProjectionTeam(table, payload, groupName, match.home);
    const away = ensureProjectionTeam(table, payload, groupName, match.away);
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
}

function evaluateSimulationScenario(groups, counts) {
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
}

function groupKnockoutRounds(matches) {
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
}

function roundMatches(rounds, key) {
  return rounds.find((round) => round.key === key)?.matches || [];
}

function groupLetterFromName(groupName) {
  return /Grupo\s+([A-Z])/i.exec(groupName || "")?.[1]?.toUpperCase() || "";
}

function normalizeSlotText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ã‚/g, "");
}

function createBracketContext(groups, thirdRows) {
  return {
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
  };
}

function simulateFullBracket(payload, rounds, groups, thirdRows, options = {}) {
  const context = {
    ...createBracketContext(groups, thirdRows),
    rng: options.rng || null,
    calibration: options.calibration || modelCalibration(),
    payload,
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
}

function simulateBracketRound(matches, roundKey, nextCountKey, context, counts) {
  matches.forEach((match, index) => {
    const result = simulateBracketMatch(match, context);
    if (!result?.winner) return;

    context.roundWinners[roundKey][index + 1] = result.winner;
    context.roundLosers[roundKey][index + 1] = result.loser;
    incrementTournamentCount(counts, result.winner, nextCountKey);
  });
}

function simulateBracketMatch(match, context) {
  const home = resolveBracketParticipant(match, "home", context);
  const away = resolveBracketParticipant(match, "away", context);
  if (!home || !away) return null;

  context.participants[`${match.id}:home`] = home;
  context.participants[`${match.id}:away`] = away;

  const result = knockoutResultFor(context.payload, match, home, away, context.rng, context.calibration);
  context.results[match.id] = result;
  return result;
}

function incrementTournamentCount(counts, team, key) {
  const teamKey = safeSimulationTeamKey(team);
  if (!counts || !teamKey || !counts[teamKey]) return;
  counts[teamKey][key] = (counts[teamKey][key] || 0) + 1;
}

function resolveBracketParticipant(match, side, context) {
  const teamKey = match[side];
  const team = context.payload.teams[teamKey] || {};
  if (!team.placeholder) return { ...team, teamKey };

  const slot = normalizeSlotText(team.name);
  const advancedTeam = resolveAdvancementSlot(slot, context);
  if (advancedTeam) return advancedTeam;

  const winnerGroup = /Vencedor do Grupo ([A-Z])/i.exec(slot);
  if (winnerGroup) return projectedTeamFromGroup(context, winnerGroup[1], 1, team, `1º Grupo ${winnerGroup[1]}`);

  const runnerUpGroup = /2.*lugar do Grupo ([A-Z])/i.exec(slot);
  if (runnerUpGroup) return projectedTeamFromGroup(context, runnerUpGroup[1], 2, team, `2º Grupo ${runnerUpGroup[1]}`);

  const thirdPlaceGroups = /3.*colocado dos Grupos ([A-Z/]+)/i.exec(slot);
  if (thirdPlaceGroups) return projectedThirdTeam(context, thirdPlaceGroups[1].split("/"), team);

  return { ...team, teamKey };
}

function resolveAdvancementSlot(slot, context) {
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
}

function projectedTeamFromGroup(context, groupLetter, position, placeholderTeam, projectionSlot) {
  const group = context.groupsByLetter[groupLetter.toUpperCase()];
  const projected = group?.teams?.[position - 1];
  if (!projected) return placeholderTeam;

  return {
    ...projected,
    projectedFromSlot: true,
    projectionSlot,
  };
}

function projectedThirdTeam(context, groupLetters, placeholderTeam) {
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
}

function knockoutWinChance(home, away) {
  const homeWeight = Number(home?.weight || home?.strength?.overall || 50);
  const awayWeight = Number(away?.weight || away?.strength?.overall || 50);
  const rankEdge = (Number(away?.fifaRank || 75) - Number(home?.fifaRank || 75)) * 0.0018;
  const groupEdge =
    (Number(home?.points || 0) - Number(away?.points || 0)) * 0.008 +
    (Number(home?.goalDifference || 0) - Number(away?.goalDifference || 0)) * 0.004;

  return clamp(0.5 + (homeWeight - awayWeight) * 0.011 + rankEdge + groupEdge, 0.12, 0.88);
}

function knockoutExpectedGoals(home, away) {
  const homeWeight = Number(home?.weight || home?.strength?.overall || 50);
  const awayWeight = Number(away?.weight || away?.strength?.overall || 50);
  const diff = homeWeight - awayWeight;

  return {
    home: clamp(1.1 + diff / 39 + Number(home?.goalsFor || 0) * 0.025, 0.25, 3.8),
    away: clamp(1.1 - diff / 39 + Number(away?.goalsFor || 0) * 0.025, 0.25, 3.8),
  };
}

function knockoutScoreModel(home, away, calibration = modelCalibration()) {
  const expected = knockoutExpectedGoals(home, away);
  const matrix = scoreProbabilityMatrix(expected.home, expected.away, calibration);
  const strengthTiebreakChance = knockoutWinChance(home, away);
  const regulationHomeChance = matrix.chances.homeChance / 100;
  const drawChance = matrix.chances.drawChance / 100;

  return {
    expected,
    matrix,
    homeAdvanceChance: clamp(regulationHomeChance + drawChance * strengthTiebreakChance, 0.05, 0.95),
  };
}

function projectedKnockoutScore(home, away, rng = null, calibration = modelCalibration(), scoreModel = null) {
  const model = scoreModel || knockoutScoreModel(home, away, calibration);
  const score = scorelineFromMatrix(model.matrix, null, rng);
  return { home: score.home, away: score.away, probability: score.probability };
}

function projectedBracketScore(scoreModel, homeWins, tiebreakHomeChance, rng) {
  const candidates = scoreModel.matrix.scorelines
    .map((scoreline) => {
      const direction = resultDirection(scoreline.homeGoals, scoreline.awayGoals);
      const compatible =
        direction === "draw" || (homeWins && direction === "home") || (!homeWins && direction === "away");
      if (!compatible) return null;

      const advancementWeight =
        direction === "draw" ? (homeWins ? tiebreakHomeChance : 1 - tiebreakHomeChance) : 1;
      return {
        ...scoreline,
        projectedProbability: scoreline.probability * advancementWeight,
      };
    })
    .filter(Boolean)
    .sort((first, second) => second.projectedProbability - first.projectedProbability)
    .slice(0, 12);
  const total = candidates.reduce((sum, scoreline) => sum + scoreline.projectedProbability, 0) || 1;
  let roll = rng() * total;

  for (const scoreline of candidates) {
    roll -= scoreline.projectedProbability;
    if (roll <= 0) {
      return {
        home: scoreline.homeGoals,
        away: scoreline.awayGoals,
        probability: Number((scoreline.probability * 100).toFixed(1)),
      };
    }
  }

  const fallback = candidates[0] || { homeGoals: homeWins ? 1 : 0, awayGoals: homeWins ? 0 : 1, probability: 0 };
  return {
    home: fallback.homeGoals,
    away: fallback.awayGoals,
    probability: Number((fallback.probability * 100).toFixed(1)),
  };
}

function knockoutResultFor(payload, match, home, away, rng = null, calibration = modelCalibration()) {
  if ((isFinished(match.status) || isLiveStatus(match.status)) && match.actualScore) {
    const homeScore = Number(match.actualScore.home || 0);
    const awayScore = Number(match.actualScore.away || 0);
    const homeWins = homeScore === awayScore ? knockoutWinChance(home, away) >= 0.5 : homeScore > awayScore;
    return {
      home,
      away,
      winner: homeWins ? home : away,
      loser: homeWins ? away : home,
      score: { home: homeScore, away: awayScore },
      source: isLiveStatus(match.status) ? "live" : "real",
    };
  }

  const scoreModel = knockoutScoreModel(home, away, calibration);
  const deterministic = !rng;
  const generator =
    rng ||
    simulationRandom(
      simulationHash(`${MODEL_VERSION}:${match.id}:${safeSimulationTeamKey(home)}:${safeSimulationTeamKey(away)}`)
    );
  const strengthTiebreakChance = knockoutWinChance(home, away);
  const projectedHomeWins = scoreModel.homeAdvanceChance >= 0.5;
  const score = deterministic
    ? projectedBracketScore(scoreModel, projectedHomeWins, strengthTiebreakChance, generator)
    : projectedKnockoutScore(home, away, generator, calibration, scoreModel);
  const direction = resultDirection(score.home, score.away);
  const homeWins = deterministic
    ? projectedHomeWins
    : direction === "home"
      ? true
      : direction === "away"
        ? false
        : generator() < strengthTiebreakChance;
  return {
    home,
    away,
    winner: homeWins ? home : away,
    loser: homeWins ? away : home,
    score,
    decidedBy: direction === "draw" ? "penalties" : "regulation",
    homeAdvanceChance: Number((scoreModel.homeAdvanceChance * 100).toFixed(1)),
    source: "simulation",
  };
}

async function saveSimulationHistory() {
  await simulationHistoryStore.save(simulationHistory);
}

function simulationSnapshot(simulation) {
  const favorite = simulation.championRows[0] || null;
  return {
    id: simulation.cacheKey,
    capturedAt: simulation.generatedAt,
    updatedAt: simulation.updatedAt,
    runs: simulation.runs,
    favorite: favorite
      ? {
          teamKey: favorite.teamKey,
          name: favorite.name,
          champion: favorite.probabilities.champion || 0,
          final: favorite.probabilities.final || 0,
          qualified: favorite.probabilities.qualified || 0,
        }
      : null,
    topChampions: simulation.championRows.slice(0, 8).map((team) => ({
      teamKey: team.teamKey,
      name: team.name,
      champion: team.probabilities.champion || 0,
      final: team.probabilities.final || 0,
      qualified: team.probabilities.qualified || 0,
    })),
  };
}

async function storeSimulationSnapshot(simulation) {
  const snapshot = simulationSnapshot(simulation);
  if (!snapshot.id || simulationHistory.snapshots.some((item) => item.id === snapshot.id)) return;

  simulationHistory = normalizeSimulationHistory({
    ...simulationHistory,
    snapshots: [...(simulationHistory.snapshots || []), snapshot],
  });
  await saveSimulationHistory();
}

async function buildSimulationPayload(options = {}) {
  const { force = false } = options;
  const payload = await buildWorldCupPayload(options);
  const key = simulationCacheKey(payload);
  const now = Date.now();

  if (!force && simulationCache.data && simulationCache.key === key) {
    return simulationCache.data;
  }

  if (simulationBuildPromise && simulationBuildKey === key) {
    return simulationBuildPromise;
  }

  simulationBuildKey = key;
  simulationBuildPromise = calculateSimulationPayload(payload, key, now);

  try {
    return await simulationBuildPromise;
  } finally {
    if (simulationBuildKey === key) {
      simulationBuildPromise = null;
      simulationBuildKey = "";
    }
  }
}

async function calculateSimulationPayload(payload, key, now) {
  const groupMatches = (payload.matches || []).filter(isGroupStageMatch).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const deterministic = buildProjectionTables(payload, groupMatches, (match) => deterministicProjectionScore(payload, match));
  const teamKeys = deterministic.groups.flatMap((group) => group.teams.map((team) => team.teamKey));
  const counts = Object.fromEntries(
    teamKeys.map((teamKey) => [
      teamKey,
      {
        first: 0,
        second: 0,
        third: 0,
        qualified: 0,
        round16: 0,
        quarterfinal: 0,
        semifinal: 0,
        final: 0,
        champion: 0,
      },
    ])
  );
  const rng = simulationRandom(simulationHash(key || "premonicao"));
  const calibration = modelCalibration();
  const knockoutRounds = groupKnockoutRounds((payload.matches || []).filter(isKnockoutMatch));

  for (let run = 0; run < SIMULATION_RUNS; run += 1) {
    const scenario = buildProjectionTables(payload, groupMatches, (match) => randomProjectionScore(payload, match, rng, calibration));
    const thirdRows = evaluateSimulationScenario(scenario.groups, counts);
    simulateFullBracket(payload, knockoutRounds, scenario.groups, thirdRows, { rng, counts, calibration });

    if (run > 0 && run % 250 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  const probabilities = Object.fromEntries(
    Object.entries(counts).map(([teamKey, count]) => [
      teamKey,
      {
        first: Math.round((count.first / SIMULATION_RUNS) * 100),
        second: Math.round((count.second / SIMULATION_RUNS) * 100),
        third: Math.round((count.third / SIMULATION_RUNS) * 100),
        qualified: Math.round((count.qualified / SIMULATION_RUNS) * 100),
        round16: Math.round((count.round16 / SIMULATION_RUNS) * 100),
        quarterfinal: Math.round((count.quarterfinal / SIMULATION_RUNS) * 100),
        semifinal: Math.round((count.semifinal / SIMULATION_RUNS) * 100),
        final: Math.round((count.final / SIMULATION_RUNS) * 100),
        champion: Math.round((count.champion / SIMULATION_RUNS) * 100),
      },
    ])
  );

  const thirdRows = deterministic.groups
    .map((group) => group.teams[2] && { ...group.teams[2], groupName: group.name })
    .filter(Boolean)
    .sort(sortProjectionRows)
    .map((row, index) => ({
      ...row,
      thirdPlaceRank: index + 1,
      projectedThirdQualified: index < 8,
      probabilities: probabilities[row.teamKey] || {},
    }));

  const thirdRankByTeam = Object.fromEntries(thirdRows.map((row) => [row.teamKey, row]));
  const groups = deterministic.groups.map((group) => ({
    ...group,
    teams: group.teams.map((row) => {
      const third = thirdRankByTeam[row.teamKey];
      const probabilitiesForTeam = probabilities[row.teamKey] || {};
      const projectedSlot =
        row.projectedPosition <= 2
          ? "Direto"
          : third?.projectedThirdQualified
            ? "Melhor 3º"
            : "Fora";

      return {
        ...row,
        projectedSlot,
        thirdPlaceRank: third?.thirdPlaceRank || null,
        probabilities: probabilitiesForTeam,
      };
    }),
  }));
  const projectedTeamsByKey = Object.fromEntries(groups.flatMap((group) => group.teams.map((team) => [team.teamKey, team])));
  const championRows = Object.entries(probabilities)
    .map(([teamKey, teamProbabilities]) => ({
      ...(projectedTeamsByKey[teamKey] || payload.teams[teamKey] || {}),
      teamKey,
      probabilities: teamProbabilities,
    }))
    .filter((team) => team.probabilities.qualified)
    .sort(
      (a, b) =>
        (b.probabilities.champion || 0) - (a.probabilities.champion || 0) ||
        (b.probabilities.final || 0) - (a.probabilities.final || 0) ||
        (b.weight || 0) - (a.weight || 0)
    )
    .slice(0, 12);

  const simulation = {
    source: "backend",
    cacheKey: key,
    runs: SIMULATION_RUNS,
    generatedAt: new Date().toISOString(),
    updatedAt: payload.updatedAt,
    groups,
    thirdRows,
    championRows,
    sources: deterministic.sources,
    history: simulationHistory.snapshots.slice(-30),
  };

  simulationCache = {
    key,
    expiresAt: now + SIMULATION_CACHE_MS,
    data: simulation,
  };
  await storeSimulationSnapshot(simulation);
  simulation.history = simulationHistory.snapshots.slice(-30);

  return simulation;
}

function healthPayload() {
  const historySummary = getPredictionHistorySummary();
  return {
    status: cache.data ? "ok" : "warming",
    now: new Date().toISOString(),
    source: cache.data?.source || null,
    worldCupUpdatedAt: cache.data?.updatedAt || null,
    worldCupCacheExpiresAt: cache.expiresAt ? new Date(cache.expiresAt).toISOString() : null,
    simulationGeneratedAt: simulationCache.data?.generatedAt || null,
    simulationCacheExpiresAt: simulationCache.expiresAt ? new Date(simulationCache.expiresAt).toISOString() : null,
    simulationRefreshing: Boolean(simulationBuildPromise),
    historyStorage: predictionHistoryStore.name,
    simulationHistoryStorage: simulationHistoryStore.name,
    evaluatedPredictions: historySummary.evaluated,
    storedPredictions: historySummary.total,
    simulationSnapshots: simulationHistory.snapshots.length,
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
        if (ensureVersionPrediction(existing, match, teams)) {
          changed = true;
        }
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
      const recoveredPrediction = recoveredPredictionSnapshot(match, teams);
      if (!existing) {
        predictionHistory.matches[key] = createResultOnlyRecord(match, teams, recoveredPrediction);
        changed = true;
      } else if (!existing.result) {
        existing.result = snapshotResult(match, teams);
        const evaluated = ensureEvaluatedPrediction(existing, recoveredPrediction);
        existing.evaluation = evaluatePrediction(evaluated.prediction, match.actualScore);
        updateVersionEvaluations(existing);
        existing.completedAt = new Date().toISOString();
        changed = true;
      } else {
        const evaluated = ensureEvaluatedPrediction(existing, recoveredPrediction);
        if (evaluated.prediction && (evaluated.changed || !existing.evaluation)) {
          existing.evaluation = evaluatePrediction(evaluated.prediction, {
            home: existing.result.homeGoals,
            away: existing.result.awayGoals,
          });
          existing.completedAt = existing.completedAt || new Date().toISOString();
          changed = true;
        }
        if (updateVersionEvaluations(existing)) {
          changed = true;
        }
      }
    }
  });

  if (changed) {
    await savePredictionHistory();
  }
}

function createPredictionRecord(match, teams) {
  const prediction = snapshotPrediction(match, teams);

  return {
    id: match.id,
    group: match.group,
    date: match.timestamp,
    home: teams[match.home]?.name,
    away: teams[match.away]?.name,
    initialPrediction: prediction,
    latestPrediction: prediction,
    versionPredictions: prediction ? { [MODEL_VERSION]: prediction } : {},
    versionEvaluations: {},
    result: null,
    evaluation: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function ensureVersionPrediction(record, match, teams) {
  if (!match.prediction) return false;
  record.versionPredictions =
    record.versionPredictions && typeof record.versionPredictions === "object"
      ? record.versionPredictions
      : {};
  if (record.versionPredictions[MODEL_VERSION]) return false;

  record.versionPredictions[MODEL_VERSION] = snapshotPrediction(match, teams);
  return true;
}

function updateVersionEvaluations(record) {
  if (!record?.result || !record.versionPredictions) return false;
  record.versionEvaluations =
    record.versionEvaluations && typeof record.versionEvaluations === "object"
      ? record.versionEvaluations
      : {};
  let changed = false;

  Object.entries(record.versionPredictions).forEach(([version, prediction]) => {
    if (!prediction || record.versionEvaluations[version]) return;
    record.versionEvaluations[version] = evaluatePrediction(prediction, {
      home: record.result.homeGoals,
      away: record.result.awayGoals,
    });
    changed = true;
  });

  return changed;
}

function createResultOnlyRecord(match, teams, recoveredPrediction = null) {
  return {
    id: match.id,
    group: match.group,
    date: match.timestamp,
    home: teams[match.home]?.name,
    away: teams[match.away]?.name,
    initialPrediction: recoveredPrediction,
    latestPrediction: recoveredPrediction,
    evaluatedPrediction: recoveredPrediction,
    result: snapshotResult(match, teams),
    evaluation: recoveredPrediction ? evaluatePrediction(recoveredPrediction, match.actualScore) : null,
    predictionRecovered: Boolean(recoveredPrediction),
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

function recoveredPredictionSnapshot(match, teams) {
  const snapshot = snapshotPrediction(match, teams, match.backfillPrediction);
  if (!snapshot) return null;

  return {
    ...snapshot,
    recovered: true,
  };
}

function ensureEvaluatedPrediction(record, fallbackPrediction) {
  let changed = false;
  let prediction = predictionForEvaluation(record);

  if (!prediction && fallbackPrediction) {
    prediction = fallbackPrediction;

    if (!record.initialPrediction) {
      record.initialPrediction = fallbackPrediction;
      changed = true;
    }

    if (!record.latestPrediction) {
      record.latestPrediction = fallbackPrediction;
      changed = true;
    }

    record.predictionRecovered = true;
  }

  if (prediction && !samePredictionScore(record.evaluatedPrediction, prediction)) {
    record.evaluatedPrediction = prediction;
    changed = true;
  }

  return { prediction: prediction || null, changed };
}

function samePredictionScore(first, second) {
  if (!first || !second) return false;
  return Number(first.homeGoals) === Number(second.homeGoals) && Number(first.awayGoals) === Number(second.awayGoals);
}

function snapshotPrediction(match, teams, prediction = match.prediction) {
  if (!prediction) return null;

  return {
    home: teams[match.home]?.name,
    away: teams[match.away]?.name,
    homeGoals: prediction.homeGoals,
    awayGoals: prediction.awayGoals,
    expectedGoals: prediction.expectedGoals,
    homeChance: prediction.homeChance,
    drawChance: prediction.drawChance,
    awayChance: prediction.awayChance,
    favoriteChance: prediction.favoriteChance,
    scorelineChance: prediction.scorelineChance,
    topScorelines: prediction.topScorelines,
    scoreModel: prediction.scoreModel,
    winner: resultDirection(prediction.homeGoals, prediction.awayGoals),
    modelVersion: MODEL_VERSION,
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
  const actualOutcome = {
    home: actualWinner === "home" ? 1 : 0,
    draw: actualWinner === "draw" ? 1 : 0,
    away: actualWinner === "away" ? 1 : 0,
  };
  const rawOutcomeProbabilities = {
    home: Number(prediction.homeChance) / 100,
    draw: Number(prediction.drawChance) / 100,
    away: Number(prediction.awayChance) / 100,
  };
  const probabilityTotal =
    rawOutcomeProbabilities.home + rawOutcomeProbabilities.draw + rawOutcomeProbabilities.away;
  const hasOutcomeProbabilities =
    Object.values(rawOutcomeProbabilities).every(Number.isFinite) && probabilityTotal > 0;
  const outcomeProbabilities = hasOutcomeProbabilities
    ? {
        home: rawOutcomeProbabilities.home / probabilityTotal,
        draw: rawOutcomeProbabilities.draw / probabilityTotal,
        away: rawOutcomeProbabilities.away / probabilityTotal,
      }
    : null;
  const brierScore = outcomeProbabilities
    ? ["home", "draw", "away"].reduce(
        (sum, key) => sum + (outcomeProbabilities[key] - actualOutcome[key]) ** 2,
        0
      )
    : null;
  const outcomeLogLoss = outcomeProbabilities
    ? -Math.log(clamp(outcomeProbabilities[actualWinner], 0.001, 1))
    : null;
  const scoreMatrix =
    Number.isFinite(expectedHome) && Number.isFinite(expectedAway)
      ? scoreProbabilityMatrix(expectedHome, expectedAway, {
          dixonColesRho: Number(prediction.scoreModel?.rho ?? -0.08),
        })
      : null;
  const actualScoreline = scoreMatrix?.scorelines.find(
    (scoreline) =>
      scoreline.homeGoals === Number(actualScore.home) && scoreline.awayGoals === Number(actualScore.away)
  );
  const actualScoreProbability = actualScoreline?.probability || null;

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
    brierScore: Number.isFinite(brierScore) ? Number(brierScore.toFixed(4)) : null,
    outcomeLogLoss: Number.isFinite(outcomeLogLoss) ? Number(outcomeLogLoss.toFixed(4)) : null,
    actualScoreProbability: actualScoreProbability
      ? Number((actualScoreProbability * 100).toFixed(2))
      : null,
    scorelineLogLoss: actualScoreProbability
      ? Number((-Math.log(clamp(actualScoreProbability, 0.000001, 1))).toFixed(4))
      : null,
    favoriteChance: prediction.favoriteChance || Math.max(prediction.homeChance || 0, prediction.awayChance || 0),
  };
}

function predictionForEvaluation(record) {
  return record?.initialPrediction || record?.evaluatedPrediction || record?.latestPrediction || null;
}

function predictionForCalibration(record) {
  return record?.calibrationPrediction || predictionForEvaluation(record);
}

function evaluationRecordForVersion(record, version) {
  const officialPrediction = predictionForEvaluation(record);
  const prediction =
    record?.versionPredictions?.[version] ||
    (officialPrediction?.modelVersion === version ? officialPrediction : null);
  if (!prediction || !record?.result) return null;

  return {
    ...record,
    calibrationPrediction: prediction,
    evaluatedPrediction: prediction,
    evaluation:
      record.versionEvaluations?.[version] ||
      evaluatePrediction(prediction, {
        home: record.result.homeGoals,
        away: record.result.awayGoals,
      }),
  };
}

function normalizedEvaluationRecord(record) {
  const evaluatedPrediction = predictionForEvaluation(record);
  if (!evaluatedPrediction || !record?.result) return record;

  const computed = evaluatePrediction(evaluatedPrediction, {
    home: record.result.homeGoals,
    away: record.result.awayGoals,
  });

  return {
    ...record,
    evaluatedPrediction,
    evaluation: {
      ...computed,
      ...(record.evaluation || {}),
    },
  };
}

function localizePredictionRecord(record) {
  if (!record) return record;

  return {
    ...record,
    group: translateRoundName(record.group),
    home: translateTeamName(record.home),
    away: translateTeamName(record.away),
    initialPrediction: localizePredictionSnapshot(record.initialPrediction),
    latestPrediction: localizePredictionSnapshot(record.latestPrediction),
    livePrediction: localizePredictionSnapshot(record.livePrediction),
    evaluatedPrediction: localizePredictionSnapshot(record.evaluatedPrediction),
    liveScore: localizeResultSnapshot(record.liveScore),
    result: localizeResultSnapshot(record.result),
  };
}

function localizePredictionSnapshot(snapshot) {
  if (!snapshot) return snapshot;

  return {
    ...snapshot,
    home: translateTeamName(snapshot.home),
    away: translateTeamName(snapshot.away),
  };
}

function localizeResultSnapshot(snapshot) {
  if (!snapshot) return snapshot;

  return {
    ...snapshot,
    home: translateTeamName(snapshot.home),
    away: translateTeamName(snapshot.away),
  };
}

function calibrationFromRecords(evaluated, confidenceCap = 1) {
  const total = evaluated.length;

  if (!total) {
    return defaultCalibration(0);
  }

  const weightedRecords = evaluated
    .slice()
    .sort((a, b) => (a.date || 0) - (b.date || 0))
    .map((record, index) => ({
      record,
      weight: total === 1 ? 1 : 0.7 + (index / (total - 1)) * 0.3,
    }));
  const weightedTotal = weightedRecords.reduce((sum, item) => sum + item.weight, 0) || total;
  const weightedCount = (predicate) =>
    weightedRecords.reduce((sum, item) => sum + (predicate(item.record) ? item.weight : 0), 0);
  const actualDraws = weightedCount((record) => record.result.winner === "draw");
  const predictedDraws = weightedCount((record) => predictionForCalibration(record).winner === "draw");
  const actualLowScoreDraws = weightedCount(
    (record) =>
      Number(record.result.homeGoals) === Number(record.result.awayGoals) && Number(record.result.homeGoals) <= 1
  );
  const predictedLowScoreDraws = weightedCount((record) => {
    const prediction = predictionForCalibration(record);
    return Number(prediction.homeGoals) === Number(prediction.awayGoals) && Number(prediction.homeGoals) <= 1;
  });
  const directionHits = weightedCount((record) => record.evaluation.direction);
  const exactHits = weightedCount((record) => record.evaluation.exactScore);
  const confidenceFactor = clamp(total / 12, 0.15, confidenceCap);
  const directionRate = directionHits / weightedTotal;
  const exactRate = exactHits / weightedTotal;
  const drawGap = (actualDraws - predictedDraws) / weightedTotal;
  const lowScoreDrawGap = (actualLowScoreDraws - predictedLowScoreDraws) / weightedTotal;
  const goalStats = weightedRecords.reduce(
    (acc, record) => {
      const prediction = predictionForCalibration(record.record);
      const predictedTotal = Number(prediction.homeGoals || 0) + Number(prediction.awayGoals || 0);
      const actualTotal = Number(record.record.result.homeGoals || 0) + Number(record.record.result.awayGoals || 0);

      acc.totalGoalError += Number(record.record.evaluation.totalGoalError || Math.abs(predictedTotal - actualTotal)) * record.weight;
      acc.predictedGoals += predictedTotal * record.weight;
      acc.actualGoals += actualTotal * record.weight;
      return acc;
    },
    { totalGoalError: 0, predictedGoals: 0, actualGoals: 0 }
  );
  const averageGoalError = goalStats.totalGoalError / weightedTotal;
  const averagePredictedGoals = goalStats.predictedGoals / weightedTotal;
  const averageActualGoals = goalStats.actualGoals / weightedTotal;
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
    dixonColesRho: Number(clamp(-0.08 - lowScoreDrawGap * 0.3 * confidenceFactor, -0.16, -0.02).toFixed(3)),
    diffMultiplier: Number(clamp(1 - (0.55 - directionRate) * 0.35 * confidenceFactor, 0.82, 1.12).toFixed(2)),
    formMultiplier: Number(clamp(2.8 - (0.5 - directionRate) * 0.45 * confidenceFactor, 2.35, 3.15).toFixed(2)),
    profileMultiplier: Number(clamp(1 - (0.45 - exactRate) * 0.18 * confidenceFactor, 0.85, 1.08).toFixed(2)),
    playerImpactMultiplier: Number(clamp(1 - (0.5 - directionRate) * 0.25 * confidenceFactor, 0.82, 1.15).toFixed(2)),
  };
}

function blendCalibration(prior, current, currentWeight) {
  const numericFields = [
    "confidenceFactor",
    "directionRate",
    "exactRate",
    "averageGoalError",
    "goalBias",
    "goalVolumeMultiplier",
    "drawBias",
    "dixonColesRho",
    "diffMultiplier",
    "formMultiplier",
    "profileMultiplier",
    "playerImpactMultiplier",
  ];
  const blended = {};

  numericFields.forEach((field) => {
    const priorValue = Number(prior[field]);
    const currentValue = Number(current[field]);
    blended[field] = Number(
      ((Number.isFinite(priorValue) ? priorValue : 0) * (1 - currentWeight) +
        (Number.isFinite(currentValue) ? currentValue : 0) * currentWeight
      ).toFixed(field === "dixonColesRho" || field === "goalVolumeMultiplier" ? 3 : 2)
    );
  });

  return blended;
}

function modelCalibration() {
  const sourceRecords = Object.values(predictionHistory.matches || {});
  const evaluated = sourceRecords
    .map(normalizedEvaluationRecord)
    .filter((record) => record.evaluation && predictionForEvaluation(record) && record.result);
  const currentRecords = sourceRecords
    .map((record) => evaluationRecordForVersion(record, MODEL_VERSION))
    .filter(Boolean);
  const priorRecords = evaluated.filter(
    (record) => predictionForEvaluation(record)?.modelVersion !== MODEL_VERSION
  );
  const priorCalibration = calibrationFromRecords(priorRecords, 0.35);
  const currentCalibration = calibrationFromRecords(currentRecords, 1);
  const currentWeight = clamp(currentRecords.length / 12, 0, 1);
  const effectiveCalibration =
    currentRecords.length > 0
      ? blendCalibration(priorCalibration, currentCalibration, currentWeight)
      : priorCalibration;

  return {
    ...effectiveCalibration,
    evaluated: currentRecords.length,
    effectiveEvaluated: Number(
      (currentRecords.length + Math.min(priorRecords.length, 4) * (1 - currentWeight)).toFixed(2)
    ),
    currentVersion: MODEL_VERSION,
    currentVersionEvaluated: currentRecords.length,
    priorEvaluated: priorRecords.length,
    versionWeight: Number(currentWeight.toFixed(2)),
    calibrationSource:
      currentRecords.length >= 12
        ? "modelo atual"
        : currentRecords.length > 0
          ? "modelo atual + referência histórica reduzida"
          : priorRecords.length > 0
            ? "referência histórica reduzida"
            : "padrão inicial",
  };
}

function defaultCalibration(evaluated) {
  return {
    evaluated,
    effectiveEvaluated: evaluated,
    confidenceFactor: 0,
    directionRate: 0,
    exactRate: 0,
    averageGoalError: 0,
    goalBias: 0,
    goalVolumeMultiplier: 1,
    drawBias: 0,
    dixonColesRho: -0.08,
    diffMultiplier: 1,
    formMultiplier: 2.8,
    profileMultiplier: 1,
    playerImpactMultiplier: 1,
    currentVersion: MODEL_VERSION,
    currentVersionEvaluated: 0,
    priorEvaluated: 0,
    versionWeight: 0,
    calibrationSource: "padrão inicial",
  };
}

function getPredictionHistorySummary() {
  const records = Object.values(predictionHistory.matches).map(normalizedEvaluationRecord).map(localizePredictionRecord);
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
      if (record.evaluation.brierScore != null && Number.isFinite(Number(record.evaluation.brierScore))) {
        acc.brierScore += Number(record.evaluation.brierScore);
        acc.brierSamples += 1;
      }
      if (record.evaluation.outcomeLogLoss != null && Number.isFinite(Number(record.evaluation.outcomeLogLoss))) {
        acc.outcomeLogLoss += Number(record.evaluation.outcomeLogLoss);
        acc.outcomeLogLossSamples += 1;
      }
      if (record.evaluation.scorelineLogLoss != null && Number.isFinite(Number(record.evaluation.scorelineLogLoss))) {
        acc.scorelineLogLoss += Number(record.evaluation.scorelineLogLoss);
        acc.scorelineLogLossSamples += 1;
      }
      if (record.evaluation.actualScoreProbability != null && Number.isFinite(Number(record.evaluation.actualScoreProbability))) {
        acc.actualScoreProbability += Number(record.evaluation.actualScoreProbability);
        acc.actualScoreProbabilitySamples += 1;
      }
      return acc;
    },
    {
      exactScore: 0,
      winner: 0,
      draw: 0,
      direction: 0,
      totalGoalError: 0,
      totalGoalsError: 0,
      expectedGoalError: 0,
      brierScore: 0,
      brierSamples: 0,
      outcomeLogLoss: 0,
      outcomeLogLossSamples: 0,
      scorelineLogLoss: 0,
      scorelineLogLossSamples: 0,
      actualScoreProbability: 0,
      actualScoreProbabilitySamples: 0,
    }
  );
  summary.averageGoalError = evaluated.length ? Number((summary.totalGoalError / evaluated.length).toFixed(2)) : 0;
  summary.averageTotalGoalsError = evaluated.length ? Number((summary.totalGoalsError / evaluated.length).toFixed(2)) : 0;
  summary.averageExpectedGoalError = evaluated.length ? Number((summary.expectedGoalError / evaluated.length).toFixed(2)) : 0;
  summary.averageBrierScore = summary.brierSamples
    ? Number((summary.brierScore / summary.brierSamples).toFixed(3))
    : null;
  summary.averageOutcomeLogLoss = summary.outcomeLogLossSamples
    ? Number((summary.outcomeLogLoss / summary.outcomeLogLossSamples).toFixed(3))
    : null;
  summary.averageScorelineLogLoss = summary.scorelineLogLossSamples
    ? Number((summary.scorelineLogLoss / summary.scorelineLogLossSamples).toFixed(3))
    : null;
  summary.averageActualScoreProbability = summary.actualScoreProbabilitySamples
    ? Number((summary.actualScoreProbability / summary.actualScoreProbabilitySamples).toFixed(2))
    : null;

  return {
    total: records.length,
    evaluated: evaluated.length,
    awaitingResult: awaitingResult.length,
    resultWithoutPrediction: resultWithoutPrediction.length,
    summary,
    probabilityBuckets: buildProbabilityBuckets(evaluated),
    accuracyByGameType: buildAccuracyByGameType(evaluated),
    modelVersions: buildModelVersionStats(evaluated),
    calibration: modelCalibration(),
    matches: records.sort((a, b) => (a.date || 0) - (b.date || 0)),
  };
}

function gameTypeForEvaluation(record) {
  const prediction = predictionForEvaluation(record);
  if (!prediction) return "Sem premonição";
  if (prediction.winner === "draw") return "Empate previsto";

  const favoriteChance = Number(prediction.favoriteChance || Math.max(prediction.homeChance || 0, prediction.awayChance || 0));
  if (favoriteChance >= 70) return "Favorito forte";
  if (favoriteChance >= 55) return "Favorito moderado";
  return "Jogo equilibrado";
}

function buildAccuracyByGameType(records) {
  const groups = new Map();

  records.forEach((record) => {
    const label = gameTypeForEvaluation(record);
    const item = groups.get(label) || { label, total: 0, hits: 0, exact: 0, goalError: 0 };
    item.total += 1;
    item.hits += record.evaluation?.direction ? 1 : 0;
    item.exact += record.evaluation?.exactScore ? 1 : 0;
    item.goalError += Number(record.evaluation?.totalGoalError || 0);
    groups.set(label, item);
  });

  return Array.from(groups.values()).map((item) => ({
    ...item,
    rate: item.total ? Math.round((item.hits / item.total) * 100) : 0,
    exactRate: item.total ? Math.round((item.exact / item.total) * 100) : 0,
    averageGoalError: item.total ? Number((item.goalError / item.total).toFixed(2)) : 0,
  }));
}

function buildModelVersionStats(records) {
  const groups = new Map();

  records.forEach((record) => {
    const officialPrediction = predictionForEvaluation(record);
    const predictionsByVersion = new Map();
    if (officialPrediction) {
      predictionsByVersion.set(officialPrediction.modelVersion || "v1-historico", officialPrediction);
    }
    Object.entries(record.versionPredictions || {}).forEach(([version, prediction]) => {
      predictionsByVersion.set(version, prediction);
    });

    predictionsByVersion.forEach((prediction, version) => {
      if (!prediction) return;
      const evaluation =
        (officialPrediction === prediction ? record.evaluation : null) ||
        record.versionEvaluations?.[version] ||
        (record.result
          ? evaluatePrediction(prediction, {
              home: record.result.homeGoals,
              away: record.result.awayGoals,
            })
          : null);
      if (!evaluation) return;

      const item = groups.get(version) || {
        version,
        total: 0,
        hits: 0,
        exact: 0,
        goalError: 0,
        brierScore: 0,
        brierSamples: 0,
        scorelineLogLoss: 0,
        scorelineLogLossSamples: 0,
      };
      item.total += 1;
      item.hits += evaluation.direction ? 1 : 0;
      item.exact += evaluation.exactScore ? 1 : 0;
      item.goalError += Number(evaluation.totalGoalError || 0);
      if (evaluation.brierScore != null && Number.isFinite(Number(evaluation.brierScore))) {
        item.brierScore += Number(evaluation.brierScore);
        item.brierSamples += 1;
      }
      if (evaluation.scorelineLogLoss != null && Number.isFinite(Number(evaluation.scorelineLogLoss))) {
        item.scorelineLogLoss += Number(evaluation.scorelineLogLoss);
        item.scorelineLogLossSamples += 1;
      }
      groups.set(version, item);
    });
  });

  return Array.from(groups.values()).map((item) => ({
    ...item,
    label: item.version,
    rate: item.total ? Math.round((item.hits / item.total) * 100) : 0,
    exactRate: item.total ? Math.round((item.exact / item.total) * 100) : 0,
    averageGoalError: item.total ? Number((item.goalError / item.total).toFixed(2)) : 0,
    averageBrierScore: item.brierSamples
      ? Number((item.brierScore / item.brierSamples).toFixed(3))
      : null,
    averageScorelineLogLoss: item.scorelineLogLossSamples
      ? Number((item.scorelineLogLoss / item.scorelineLogLossSamples).toFixed(3))
      : null,
  }));
}

function buildProbabilityBuckets(records) {
  const bucketDefinitions = [
    { min: 0, max: 49, label: "até 49%" },
    { min: 50, max: 59, label: "50-59%" },
    { min: 60, max: 69, label: "60-69%" },
    { min: 70, max: 79, label: "70-79%" },
    { min: 80, max: 100, label: "80%+" },
  ];

  return bucketDefinitions
    .map((bucket) => {
      const matches = records.filter((record) => {
        const prediction = predictionForEvaluation(record);
        const chance = Number(prediction?.favoriteChance || record.evaluation?.favoriteChance || 0);
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
      ".webmanifest": "application/manifest+json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
    };

    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
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
    try {
      await buildWorldCupPayload();
    } catch (error) {
      console.warn(`Histórico respondeu com último cache disponível: ${error.message}`);
    }

    sendJson(res, 200, getPredictionHistorySummary());
    return;
  }

  if (url.pathname === "/api/simulation") {
    try {
      const payload = await buildSimulationPayload();
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 500, {
        message: error.message || "Falha ao calcular simulação.",
      });
    }
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(res, 200, healthPayload());
    return;
  }

  serveStatic(req, res);
});

async function startServer() {
  await initializePersistence();

  server.listen(PORT, () => {
    console.log(`Copa app rodando em http://localhost:${PORT}`);
  });

  scheduleBackgroundRefresh();
  return server;
}

function scheduleBackgroundRefresh() {
  if (backgroundRefreshTimer || process.env.BACKGROUND_REFRESH === "false") return;

  backgroundRefreshTimer = setInterval(refreshWorldCupDataInBackground, CACHE_MS);
  if (typeof backgroundRefreshTimer.unref === "function") {
    backgroundRefreshTimer.unref();
  }

  refreshWorldCupDataInBackground();
}

async function refreshWorldCupDataInBackground() {
  if (backgroundRefreshRunning) return;

  backgroundRefreshRunning = true;
  try {
    await buildWorldCupPayload({ force: true });
    buildSimulationPayload().catch((error) => {
      console.warn(`Falha ao atualizar simulação em segundo plano: ${error.message}`);
    });
  } catch (error) {
    console.warn(`Falha ao atualizar dados em segundo plano: ${error.message}`);
  } finally {
    backgroundRefreshRunning = false;
  }
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
    mergePredictionHistories,
    formatMatchDay,
    formatMatchTime,
    normalizePlayerScoreList,
    playerScoreFromStats,
    playerPositionGroup,
    scoreProbabilityMatrix,
    scorelineFromMatrix,
    simulationCacheKey,
    knockoutScoreModel,
    projectedKnockoutScore,
    knockoutResultFor,
    buildAccuracyByGameType,
    buildModelVersionStats,
  },
};
