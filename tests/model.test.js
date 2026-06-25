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

test("matriz Poisson escolhe o placar mais provável sem arredondar os gols esperados", () => {
  const matrix = _test.scoreProbabilityMatrix(1.64, 0.42, {
    ...modelCalibration(),
    dixonColesRho: -0.08,
  });

  assert.equal(matrix.homeGoals, 1);
  assert.equal(matrix.awayGoals, 0);
  assert.equal(matrix.topScorelines.length, 3);
  assert.ok(matrix.topScorelines[0].probability >= matrix.topScorelines[1].probability);
  assert.equal(matrix.chances.homeChance + matrix.chances.drawChance + matrix.chances.awayChance, 100);
});

test("correcao Dixon-Coles aumenta a probabilidade de empate baixo", () => {
  const withoutCorrection = _test.scoreProbabilityMatrix(1.1, 1.1, { dixonColesRho: 0 });
  const withCorrection = _test.scoreProbabilityMatrix(1.1, 1.1, { dixonColesRho: -0.08 });
  const drawProbability = (matrix) =>
    matrix.topScorelines.find((scoreline) => scoreline.homeGoals === 1 && scoreline.awayGoals === 1)?.probability || 0;

  assert.ok(drawProbability(withCorrection) > drawProbability(withoutCorrection));
});

test("premonicao inclui as tres alternativas de placar do novo modelo", () => {
  resetHistory();

  const prediction = predictMatch(
    { home: "home", away: "away" },
    {
      home: {
        name: "Time da casa",
        fifaRank: 12,
        strength: { overall: 78, attack: 79, defense: 77, form: 1.1, players: 0.8 },
      },
      away: {
        name: "Visitante",
        fifaRank: 28,
        strength: { overall: 70, attack: 69, defense: 70, form: 0.2, players: 0.1 },
      },
    }
  );

  assert.equal(prediction.topScorelines.length, 3);
  assert.equal(prediction.homeGoals, prediction.topScorelines[0].homeGoals);
  assert.equal(prediction.awayGoals, prediction.topScorelines[0].awayGoals);
  assert.equal(prediction.scoreModel.method, "Poisson com correção Dixon-Coles");
});

test("mata-mata equilibrado divide a chance de classificacao perto de 50%", () => {
  resetHistory();

  const home = { name: "Time A", weight: 75, fifaRank: 15, points: 6, goalDifference: 2 };
  const away = { name: "Time B", weight: 75, fifaRank: 15, points: 6, goalDifference: 2 };
  const model = _test.knockoutScoreModel(home, away, modelCalibration());

  assert.ok(model.homeAdvanceChance >= 0.48);
  assert.ok(model.homeAdvanceChance <= 0.52);
  assert.ok(model.matrix.chances.drawChance > 0);
});

test("mata-mata usa a matriz Dixon-Coles para favorito e placar", () => {
  resetHistory();

  const favorite = { name: "Favorito", weight: 88, fifaRank: 3, points: 7, goalDifference: 5 };
  const underdog = { name: "Azarão", weight: 58, fifaRank: 55, points: 3, goalDifference: -1 };
  const calibration = modelCalibration();
  const model = _test.knockoutScoreModel(favorite, underdog, calibration);
  const score = _test.projectedKnockoutScore(favorite, underdog, null, calibration, model);

  assert.ok(model.homeAdvanceChance > 0.7);
  assert.ok(score.home >= score.away);
  assert.ok(score.probability > 0);
});

test("matriz mantém empates possíveis no mata-mata", () => {
  const matrix = _test.scoreProbabilityMatrix(1.35, 1.1, { dixonColesRho: -0.08 });
  const score = _test.scorelineFromMatrix(matrix);

  assert.ok(Number.isInteger(score.home));
  assert.ok(Number.isInteger(score.away));
  assert.ok(matrix.scorelines.some((item) => item.homeGoals === item.awayGoals));
});

test("chave principal não classifica o azarão contra a probabilidade exibida", () => {
  resetHistory();

  const underdog = { name: "Marrocos", teamKey: "mar", weight: 70, fifaRank: 20, points: 4, goalDifference: 1 };
  const favorite = { name: "França", teamKey: "fra", weight: 88, fifaRank: 2, points: 7, goalDifference: 5 };
  const result = _test.knockoutResultFor(
    { teams: { mar: underdog, fra: favorite } },
    { id: 99, status: "NS", home: "mar", away: "fra" },
    underdog,
    favorite,
    null,
    modelCalibration()
  );

  assert.equal(result.winner.name, "França");
  assert.ok(result.homeAdvanceChance < 50);
  assert.ok(
    result.score.away > result.score.home ||
      (result.score.away === result.score.home && result.decidedBy === "penalties")
  );
});

test("cache da simulacao muda quando os gols esperados mudam", () => {
  const payload = (expectedHome) => ({
    matches: [
      {
        id: 1,
        status: "NS",
        prediction: {
          homeGoals: 1,
          awayGoals: 0,
          homeChance: 60,
          drawChance: 25,
          awayChance: 15,
          expectedGoals: { home: expectedHome, away: 0.7 },
          scoreModel: { rho: -0.08 },
        },
      },
    ],
  });

  assert.notEqual(_test.simulationCacheKey(payload(1.2)), _test.simulationCacheKey(payload(1.25)));
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

test("avaliacao probabilistica recompensa previsao bem calibrada", () => {
  const correct = evaluatePrediction(
    {
      homeGoals: 2,
      awayGoals: 0,
      expectedGoals: { home: 1.8, away: 0.5 },
      homeChance: 78,
      drawChance: 14,
      awayChance: 8,
      scoreModel: { rho: -0.08 },
    },
    { home: 2, away: 0 }
  );
  const wrong = evaluatePrediction(
    {
      homeGoals: 0,
      awayGoals: 2,
      expectedGoals: { home: 0.5, away: 1.8 },
      homeChance: 8,
      drawChance: 14,
      awayChance: 78,
      scoreModel: { rho: -0.08 },
    },
    { home: 2, away: 0 }
  );

  assert.ok(correct.brierScore < wrong.brierScore);
  assert.ok(correct.outcomeLogLoss < wrong.outcomeLogLoss);
  assert.ok(correct.actualScoreProbability > 0);
  assert.ok(correct.scorelineLogLoss > 0);
});

test("calibracao do v3 usa historico antigo apenas como referencia reduzida", () => {
  _test.setPredictionHistory({
    version: 1,
    matches: {
      old1: {
        date: 1,
        initialPrediction: {
          homeGoals: 4,
          awayGoals: 0,
          winner: "home",
          homeChance: 80,
          drawChance: 12,
          awayChance: 8,
          modelVersion: "v1-historico",
        },
        result: { homeGoals: 1, awayGoals: 0, winner: "home" },
        evaluation: { direction: true, exactScore: false, totalGoalError: 3 },
      },
      current1: {
        date: 2,
        initialPrediction: {
          homeGoals: 1,
          awayGoals: 1,
          winner: "draw",
          homeChance: 32,
          drawChance: 36,
          awayChance: 32,
          modelVersion: "v3-poisson-dixon-coles",
        },
        result: { homeGoals: 1, awayGoals: 1, winner: "draw" },
        evaluation: { direction: true, exactScore: true, totalGoalError: 0 },
      },
    },
  });

  const calibration = modelCalibration();

  assert.equal(calibration.currentVersionEvaluated, 1);
  assert.equal(calibration.priorEvaluated, 1);
  assert.ok(calibration.versionWeight > 0);
  assert.ok(calibration.versionWeight < 0.1);
  assert.match(calibration.calibrationSource, /modelo atual/);
});

test("versao nova guarda e avalia previsao paralela sem alterar a oficial", async () => {
  resetHistory();
  _test.setPredictionHistory({
    version: 1,
    matches: {
      "30": {
        id: 30,
        group: "Grupo A",
        date: 3000,
        home: "Time A",
        away: "Time B",
        initialPrediction: {
          homeGoals: 2,
          awayGoals: 0,
          winner: "home",
          homeChance: 70,
          drawChance: 20,
          awayChance: 10,
          modelVersion: "v1-historico",
        },
        latestPrediction: null,
        result: null,
        evaluation: null,
      },
    },
  });

  const teams = {
    home: { name: "Time A" },
    away: { name: "Time B" },
  };

  await _test.updatePredictionHistory(
    [
      {
        id: 30,
        status: "NS",
        group: "Grupo A",
        timestamp: 3000,
        home: "home",
        away: "away",
        prediction: {
          homeGoals: 1,
          awayGoals: 0,
          expectedGoals: { home: 1.4, away: 0.6 },
          homeChance: 62,
          drawChance: 24,
          awayChance: 14,
        },
      },
    ],
    teams
  );

  let record = _test.getPredictionHistory().matches["30"];
  assert.equal(record.initialPrediction.homeGoals, 2);
  assert.equal(record.versionPredictions["v3-poisson-dixon-coles"].homeGoals, 1);

  await _test.updatePredictionHistory(
    [
      {
        id: 30,
        status: "FT",
        group: "Grupo A",
        timestamp: 3000,
        home: "home",
        away: "away",
        actualScore: { home: 1, away: 0 },
      },
    ],
    teams
  );

  record = _test.getPredictionHistory().matches["30"];
  assert.equal(record.evaluation.exactScore, false);
  assert.equal(record.versionEvaluations["v3-poisson-dixon-coles"].exactScore, true);
  assert.equal(modelCalibration().currentVersionEvaluated, 1);
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

test("avalia o placar inicial mesmo quando a ultima premonicao mudou", async () => {
  resetHistory();

  const teams = {
    home: { name: "Escócia" },
    away: { name: "Brasil" },
  };

  await _test.updatePredictionHistory(
    [
      {
        id: 11,
        status: "NS",
        group: "Grupo C",
        timestamp: 1100,
        home: "home",
        away: "away",
        prediction: {
          homeGoals: 0,
          awayGoals: 3,
          homeChance: 6,
          drawChance: 10,
          awayChance: 84,
          favoriteChance: 84,
        },
      },
    ],
    teams
  );

  await _test.updatePredictionHistory(
    [
      {
        id: 11,
        status: "NS",
        group: "Grupo C",
        timestamp: 1100,
        home: "home",
        away: "away",
        prediction: {
          homeGoals: 0,
          awayGoals: 2,
          homeChance: 8,
          drawChance: 12,
          awayChance: 80,
          favoriteChance: 80,
        },
      },
    ],
    teams
  );

  await _test.updatePredictionHistory(
    [
      {
        id: 11,
        status: "FT",
        group: "Grupo C",
        timestamp: 1100,
        home: "home",
        away: "away",
        actualScore: { home: 0, away: 3 },
        prediction: {
          homeGoals: 0,
          awayGoals: 2,
          homeChance: 8,
          drawChance: 12,
          awayChance: 80,
          favoriteChance: 80,
        },
      },
    ],
    teams
  );

  const record = _test.getPredictionHistory().matches["11"];
  assert.equal(record.initialPrediction.awayGoals, 3);
  assert.equal(record.latestPrediction.awayGoals, 2);
  assert.equal(record.evaluatedPrediction.awayGoals, 3);
  assert.equal(record.evaluation.exactScore, true);
});

test("corrige avaliacao antiga que usou a ultima premonicao", async () => {
  resetHistory();
  _test.setPredictionHistory({
    version: 1,
    matches: {
      "12": {
        id: 12,
        group: "Grupo C",
        date: 1200,
        home: "Escócia",
        away: "Brasil",
        initialPrediction: { homeGoals: 0, awayGoals: 3, winner: "away", favoriteChance: 84 },
        latestPrediction: { homeGoals: 0, awayGoals: 2, winner: "away", favoriteChance: 80 },
        evaluatedPrediction: { homeGoals: 0, awayGoals: 2, winner: "away", favoriteChance: 80 },
        result: { homeGoals: 0, awayGoals: 3, winner: "away" },
        evaluation: { exactScore: false, direction: true },
      },
    },
  });

  await _test.updatePredictionHistory(
    [
      {
        id: 12,
        status: "FT",
        group: "Grupo C",
        timestamp: 1200,
        home: "home",
        away: "away",
        actualScore: { home: 0, away: 3 },
      },
    ],
    {
      home: { name: "Escócia" },
      away: { name: "Brasil" },
    }
  );

  const record = _test.getPredictionHistory().matches["12"];
  assert.equal(record.evaluatedPrediction.awayGoals, 3);
  assert.equal(record.evaluation.exactScore, true);
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

test("recuperacao preenche premonicao inicial sem apagar placar ao vivo", () => {
  const merged = _test.mergePredictionHistories(
    {
      version: 1,
      matches: {
        "760473": {
          initialPrediction: {
            homeGoals: 0,
            awayGoals: 2,
            modelVersion: "v1-historico",
          },
        },
      },
    },
    {
      version: 1,
      matches: {
        "760473": {
          initialPrediction: null,
          latestPrediction: null,
          livePrediction: {
            homeGoals: 1,
            awayGoals: 2,
            modelVersion: "v2",
          },
          liveScore: { homeGoals: 0, awayGoals: 2 },
        },
      },
    }
  );

  assert.equal(merged.matches["760473"].initialPrediction.awayGoals, 2);
  assert.equal(merged.matches["760473"].latestPrediction.awayGoals, 2);
  assert.equal(merged.matches["760473"].livePrediction.awayGoals, 2);
  assert.equal(merged.matches["760473"].liveScore.awayGoals, 2);
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
