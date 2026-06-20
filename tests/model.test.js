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
