const assert = require("node:assert/strict");
const test = require("node:test");

const {
  _test,
  evaluatePrediction,
  getSeedRank,
  modelCalibration,
  predictMatch,
  rankingRows,
} = require("../server");

const memoryStore = {
  name: "memory",
  async save() {},
};

function resetHistory() {
  _test.setPredictionHistory({ version: 1, matches: {} });
  _test.setPredictionHistoryStore(memoryStore);
}

test("usa a tabela revisada de ranking FIFA como base unica", () => {
  assert.equal(getSeedRank("Paises Baixos"), 7);
  assert.equal(getSeedRank("Marrocos"), 8);
  assert.equal(getSeedRank("Suecia"), 43);
  assert.equal(getSeedRank("Haiti"), 83);
});

test("horario dos jogos usa o fuso de Portugal", () => {
  assert.equal(_test.formatMatchTime("2026-06-20T17:00:00Z", { short: "NS" }, "Europe/Lisbon"), "18:00");
  assert.equal(
    _test.formatMatchDay("2026-06-20T23:30:00Z", new Date("2026-06-20T12:00:00Z"), "Europe/Lisbon"),
    "Amanhã"
  );
});

test("favorito claro fica acima em chance e placar previsto", () => {
  resetHistory();

  const teams = {
    mar: {
      name: "Marrocos",
      fifaRank: 8,
      strength: { overall: 80, attack: 81, defense: 78, form: 1.4, players: 1.2 },
    },
    hai: {
      name: "Haiti",
      fifaRank: 83,
      strength: { overall: 48, attack: 47, defense: 46, form: -0.4, players: -0.3 },
    },
  };

  const prediction = predictMatch({ home: "mar", away: "hai" }, teams);

  assert.ok(prediction.homeChance > prediction.awayChance);
  assert.ok(prediction.homeGoals >= prediction.awayGoals);
  assert.ok(prediction.favoriteChance >= 60);
});

test("probabilidades da premonicao ficam normalizadas", () => {
  resetHistory();

  const teams = {
    home: {
      name: "Favorito",
      fifaRank: 5,
      strength: { overall: 86, attack: 87, defense: 84, form: 2.2, players: 2.1 },
    },
    away: {
      name: "Azarao",
      fifaRank: 91,
      strength: { overall: 42, attack: 41, defense: 40, form: -1.1, players: -0.8 },
    },
  };

  const prediction = predictMatch({ home: "home", away: "away" }, teams);
  const total = prediction.homeChance + prediction.drawChance + prediction.awayChance;

  assert.equal(total, 100);
  assert.ok(prediction.homeChance > prediction.awayChance);
  assert.ok(prediction.homeGoals > prediction.awayGoals);
});

test("avaliacao separa placar exato, resultado geral e erro de gols", () => {
  const evaluation = evaluatePrediction(
    {
      homeGoals: 2,
      awayGoals: 1,
      expectedGoals: { home: 1.8, away: 1.1 },
      favoriteChance: 64,
    },
    { home: 1, away: 1 }
  );

  assert.equal(evaluation.exactScore, false);
  assert.equal(evaluation.direction, false);
  assert.equal(evaluation.totalGoalError, 1);
  assert.equal(evaluation.totalGoalsError, 1);
  assert.equal(evaluation.expectedGoalError, 0.9);
});

test("rankingRows ordena os times mais fortes primeiro", () => {
  const rows = rankingRows({
    a: { name: "Time A", weight: 70 },
    b: { name: "Time B", weight: 82 },
    c: { name: "Time C", weight: 61 },
  });

  assert.deepEqual(
    rows.map((row) => row.key),
    ["b", "a", "c"]
  );
});

test("premonição inicial fica congelada quando o jogo entra ao vivo", async () => {
  resetHistory();

  const teams = {
    home: { name: "Casa" },
    away: { name: "Fora" },
  };

  await _test.updatePredictionHistory(
    [
      {
        id: 10,
        status: "NS",
        group: "Grupo A",
        timestamp: 1000,
        home: "home",
        away: "away",
        prediction: {
          homeGoals: 2,
          awayGoals: 0,
          expectedGoals: { home: 1.7, away: 0.6 },
          homeChance: 68,
          drawChance: 20,
          awayChance: 12,
          favoriteChance: 68,
        },
      },
    ],
    teams
  );

  await _test.updatePredictionHistory(
    [
      {
        id: 10,
        status: "LIVE",
        group: "Grupo A",
        timestamp: 1000,
        home: "home",
        away: "away",
        actualScore: { home: 0, away: 1 },
        prediction: {
          homeGoals: 1,
          awayGoals: 1,
          expectedGoals: { home: 1.2, away: 1.1 },
          homeChance: 42,
          drawChance: 32,
          awayChance: 26,
          favoriteChance: 42,
        },
      },
    ],
    teams
  );

  const record = _test.getPredictionHistory().matches["10"];
  assert.equal(record.initialPrediction.homeGoals, 2);
  assert.equal(record.latestPrediction.homeGoals, 2);
  assert.equal(record.livePrediction.homeGoals, 1);
  assert.equal(record.liveScore.awayGoals, 1);
});

test("erro medio de gols reduz volume quando o modelo superestima placares", () => {
  _test.setPredictionHistory({
    version: 1,
    matches: {
      "1": {
        initialPrediction: { homeGoals: 4, awayGoals: 1, winner: "home", favoriteChance: 72 },
        result: { homeGoals: 1, awayGoals: 0, winner: "home" },
        evaluation: { direction: true, exactScore: false, totalGoalError: 4 },
      },
      "2": {
        initialPrediction: { homeGoals: 3, awayGoals: 2, winner: "home", favoriteChance: 58 },
        result: { homeGoals: 1, awayGoals: 1, winner: "draw" },
        evaluation: { direction: false, exactScore: false, totalGoalError: 3 },
      },
    },
  });

  const calibration = modelCalibration();
  assert.ok(calibration.goalVolumeMultiplier < 1);
  assert.ok(calibration.averageGoalError > 1);
  assert.ok(calibration.goalBias > 0);
});

test("erro medio de gols aumenta volume quando o modelo subestima placares", () => {
  _test.setPredictionHistory({
    version: 1,
    matches: {
      "1": {
        initialPrediction: { homeGoals: 0, awayGoals: 0, winner: "draw", favoriteChance: 45 },
        result: { homeGoals: 2, awayGoals: 1, winner: "home" },
        evaluation: { direction: false, exactScore: false, totalGoalError: 3 },
      },
      "2": {
        initialPrediction: { homeGoals: 1, awayGoals: 0, winner: "home", favoriteChance: 52 },
        result: { homeGoals: 3, awayGoals: 2, winner: "home" },
        evaluation: { direction: true, exactScore: false, totalGoalError: 4 },
      },
    },
  });

  const calibration = modelCalibration();
  assert.ok(calibration.goalVolumeMultiplier > 1);
  assert.ok(calibration.averageGoalError > 1);
  assert.ok(calibration.goalBias < 0);
});

test("seed preenche avaliacao quando ambiente tem histórico sem avaliados", () => {
  const merged = _test.mergePredictionHistories(
    {
      version: 1,
      matches: {
        "1": {
          id: 1,
          initialPrediction: { homeGoals: 2, awayGoals: 1, winner: "home" },
          result: { homeGoals: 1, awayGoals: 1, winner: "draw" },
          evaluation: { direction: false, exactScore: false },
        },
      },
    },
    {
      version: 1,
      matches: {
        "1": {
          id: 1,
          initialPrediction: null,
          result: { homeGoals: 1, awayGoals: 1, winner: "draw" },
          evaluation: null,
        },
        "2": {
          id: 2,
          initialPrediction: { homeGoals: 1, awayGoals: 0, winner: "home" },
          result: null,
          evaluation: null,
        },
      },
    }
  );

  assert.equal(merged.matches["1"].evaluation.direction, false);
  assert.equal(merged.matches["1"].initialPrediction.homeGoals, 2);
  assert.equal(merged.matches["2"].initialPrediction.homeGoals, 1);
});

test("jogo finalizado sem snapshot anterior ganha avaliacao recuperada", async () => {
  resetHistory();

  const teams = {
    home: { name: "Marrocos" },
    away: { name: "Haiti" },
  };

  await _test.updatePredictionHistory(
    [
      {
        id: 20,
        status: "FT",
        group: "Grupo C",
        timestamp: 2000,
        home: "home",
        away: "away",
        actualScore: { home: 1, away: 0 },
        backfillPrediction: {
          homeGoals: 2,
          awayGoals: 0,
          expectedGoals: { home: 1.8, away: 0.4 },
          homeChance: 72,
          drawChance: 18,
          awayChance: 10,
          favoriteChance: 72,
        },
      },
    ],
    teams
  );

  const record = _test.getPredictionHistory().matches["20"];
  assert.equal(record.initialPrediction.homeGoals, 2);
  assert.equal(record.latestPrediction.homeGoals, 2);
  assert.equal(record.evaluatedPrediction.homeGoals, 2);
  assert.equal(record.result.homeGoals, 1);
  assert.equal(record.evaluation.direction, true);
  assert.equal(record.predictionRecovered, true);
});

test("histórico antigo sem premonição e consertado quando jogo finalizado reaparece", async () => {
  resetHistory();
  _test.setPredictionHistory({
    version: 1,
    matches: {
      "21": {
        id: 21,
        group: "Grupo D",
        date: 2100,
        home: "Brasil",
        away: "Haiti",
        initialPrediction: null,
        latestPrediction: null,
        result: { home: "Brasil", away: "Haiti", homeGoals: 3, awayGoals: 0, winner: "home" },
        evaluation: null,
      },
    },
  });

  await _test.updatePredictionHistory(
    [
      {
        id: 21,
        status: "FT",
        group: "Grupo D",
        timestamp: 2100,
        home: "home",
        away: "away",
        actualScore: { home: 3, away: 0 },
        backfillPrediction: {
          homeGoals: 3,
          awayGoals: 0,
          expectedGoals: { home: 2.7, away: 0.5 },
          homeChance: 78,
          drawChance: 14,
          awayChance: 8,
          favoriteChance: 78,
        },
      },
    ],
    {
      home: { name: "Brasil" },
      away: { name: "Haiti" },
    }
  );

  const record = _test.getPredictionHistory().matches["21"];
  assert.equal(record.initialPrediction.homeGoals, 3);
  assert.equal(record.evaluatedPrediction.homeGoals, 3);
  assert.equal(record.evaluation.exactScore, true);
  assert.equal(record.predictionRecovered, true);
});

test("lista de jogadores ignora atletas sem partida registrada", () => {
  const players = _test.normalizePlayerScoreList({
    played: {
      id: "1",
      name: "Jogador titular",
      games: 1,
      total: 6.4,
      attack: 3.1,
      defense: 3.3,
      goals: 0,
      assists: 0,
    },
    leaderOnly: {
      id: "2",
      name: "Jogador sem minutos",
      games: 0,
      total: 0.63,
      attack: 0.63,
      defense: 0,
      goals: 0,
      assists: 0,
    },
  });

  assert.deepEqual(
    players.map((player) => player.name),
    ["Jogador titular"]
  );
});

test("substituto com aparicao entra na pontuacao individual", () => {
  const score = _test.playerScoreFromStats({
    appearances: "1",
    subIns: "1",
    foulsCommitted: "1",
    offsides: "1",
    totalGoals: "0",
    goalAssists: "0",
    shotsOnTarget: "0",
    totalShots: "0",
  });

  assert.ok(score);
  assert.ok(score.total > 0);
  assert.ok(score.total <= 10);
});

test("pontuacao individual considera a posicao do jogador", () => {
  const defensiveStats = {
    appearances: "1",
    totalTackles: "4",
    interceptions: "3",
    saves: "5",
    goalsConceded: "0",
    totalGoals: "0",
    goalAssists: "0",
  };

  const goalkeeper = _test.playerScoreFromStats(defensiveStats, "GK");
  const forward = _test.playerScoreFromStats(defensiveStats, "FW");

  assert.equal(_test.playerPositionGroup("GK"), "goalkeeper");
  assert.ok(goalkeeper.defense > forward.defense);
  assert.ok(goalkeeper.total > forward.total);
});

test("estatisticas agrupam acertos por tipo de jogo e versao do modelo", () => {
  const records = [
    {
      initialPrediction: { homeGoals: 2, awayGoals: 0, winner: "home", favoriteChance: 76, modelVersion: "v2" },
      evaluation: { direction: true, exactScore: false, totalGoalError: 1 },
    },
    {
      initialPrediction: { homeGoals: 1, awayGoals: 1, winner: "draw", favoriteChance: 44, modelVersion: "v2" },
      evaluation: { direction: false, exactScore: false, totalGoalError: 2 },
    },
    {
      initialPrediction: { homeGoals: 1, awayGoals: 0, winner: "home", favoriteChance: 54, modelVersion: "v1" },
      evaluation: { direction: true, exactScore: true, totalGoalError: 0 },
    },
  ];

  const byType = _test.buildAccuracyByGameType(records);
  const strongFavorite = byType.find((row) => row.label === "Favorito forte");
  const draw = byType.find((row) => row.label === "Empate previsto");
  const versions = _test.buildModelVersionStats(records);

  assert.equal(strongFavorite.rate, 100);
  assert.equal(draw.rate, 0);
  assert.equal(versions.find((row) => row.label === "v2").total, 2);
  assert.equal(versions.find((row) => row.label === "v1").exactRate, 100);
});
