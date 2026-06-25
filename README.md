# Premonicao da Copa

App web que lista jogos da Copa, mostra resultados reais de jogos finalizados e simula placares futuros com base no peso atualizado das selecoes.

## Modelo de premonicao

O placar usa gols esperados combinados com uma matriz de Poisson e correcao Dixon-Coles. O sistema:

- mostra os tres placares mais provaveis;
- preserva a premonicao inicial para avaliacao;
- separa resultados e calibracao por versao do modelo;
- usa modelos anteriores apenas como referencia reduzida enquanto a versao atual tem pouca amostra;
- mede placar exato, resultado geral, erro de gols, Brier e log-loss;
- executa 30 mil cenarios para classificacao, chave e campeao.

Na chave principal, avanca a selecao com maior probabilidade de classificacao. Zebras continuam existindo dentro dos 30 mil cenarios, sem tornar a projecao central contraditoria.

## Rodar localmente

```bash
npm start
```

Depois abra:

```txt
http://localhost:3000
```

## Deploy

O app precisa de um servidor Node.js porque o backend consulta a fonte publica da ESPN e entrega os dados tratados para o frontend.

Uma opcao simples e gratuita e usar Render:

1. Suba estes arquivos para um repositorio no GitHub.
2. Acesse https://render.com.
3. Crie um novo Web Service a partir do repositorio.
4. Use:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. O Render tambem consegue ler o arquivo `render.yaml`.

## Fonte de dados

O backend usa o endpoint publico da ESPN para jogos da Copa:

```txt
https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard
```

## Historico de premonicoes

O backend registra snapshots das premonicoes em:

```txt
data/prediction-history.json
```

Esse arquivo alimenta o endpoint:

```txt
/api/prediction-history
```

Ele guarda previsoes feitas antes dos jogos e, quando o placar real aparece, calcula acertos de placar exato, direcao do resultado, vencedor e empate.

Em producao, configure a variavel `DATABASE_URL` no Render para salvar esse historico em Postgres. Sem essa variavel, o app usa o arquivo local `data/prediction-history.json`.

Variaveis uteis no Render:

```txt
WORLD_CUP_SEASON=2026
API_CACHE_MS=120000
SIMULATION_CACHE_MS=120000
SIMULATION_RUNS=30000
DATABASE_URL=<url do Postgres>
```

O backend tambem guarda cache das estatisticas individuais da ESPN em `data/espn-summary-cache.json` quando roda localmente. Esse cache reduz chamadas repetidas aos summaries dos jogos.
