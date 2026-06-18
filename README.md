# Premonicao da Copa

App web que lista jogos da Copa, mostra resultados reais de jogos finalizados e simula placares futuros com base no peso atualizado das selecoes.

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
