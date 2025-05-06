# 2Profiler RPC API

API RPC pour le projet 2Profiler permettant d'analyser les portefeuilles et les transactions blockchain sur Solana, avec historique des prix des tokens.

## Déploiement

L'API est déployée sur Vercel et accessible à l'adresse:

```
https://rpc1-taupe.vercel.app
```

## Installation locale

1. Cloner le projet
2. Installer les dépendances :

```
npm install
```

3. Configurer les variables d'environnement dans le fichier `.env` :

```
# Clés API Solana
HELIUS_API_KEY=votre_clé_helius_api
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=votre_clé_helius_api
ALCHEMY_API_KEY=votre_clé_alchemy_api
ALCHEMY_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/votre_clé_alchemy_api

# Clés API pour les prix et métadonnées
BIRDEYE_API_KEY=votre_clé_birdeye_api
CRYPTOCOMPARE_API_KEY=votre_clé_cryptocompare_api
COINGECKO_API_KEY=votre_clé_coingecko_api

# Jupiter API
JUPITER_API_URL=https://quote-api.jup.ag/v6

# Configuration serveur
PORT=3000
```

4. Démarrer le serveur :

```
npm start
```

Pour le développement avec rechargement automatique :

```
npm run dev
```

## Structure de l'API

L'API expose les endpoints suivants :

### Analyse de portefeuille

- `GET /api/portfolio/:walletAddress`

  - **Description**: Récupère les informations complètes d'un portefeuille (solde SOL et tokens)
  - **Paramètres**:
    - `network` (string, défaut: 'mainnet'): Réseau Solana à utiliser
    - `includeNFTs` (boolean, défaut: false): Inclure les NFTs dans la réponse
    - `includeTransactions` (boolean, défaut: false): Inclure l'historique des transactions
    - `includeStaking` (boolean, défaut: true): Inclure les données de staking
    - `includeProtocols` (boolean, défaut: true): Inclure les données des protocoles
    - `timeout` (number, défaut: 30000): Délai d'expiration de la requête en millisecondes
  - **Exemple**: `/api/portfolio/FuRS2oiXnGvwabV7JYjBU1VQCa6aida7LDybt91xy1YH?includeNFTs=true&includeStaking=true`

- `GET /api/portfolio/portfolio-exact/:walletAddress`
  - **Description**: Récupère les informations exactes du portefeuille avec un format de paramètres optimisé
  - **Paramètres**:
    - `network` (string, défaut: 'mainnet'): Réseau Solana à utiliser
    - `include_nfts` (boolean, défaut: false): Inclure les NFTs dans la réponse
    - `include_staked` (boolean, défaut: true): Inclure les données de staking
    - `timeout` (number, défaut: 30000): Délai d'expiration de la requête en millisecondes
  - **Exemple**: `/api/portfolio/portfolio-exact/FuRS2oiXnGvwabV7JYjBU1VQCa6aida7LDybt91xy1YH?include_nfts=true&include_staked=true&timeout=30000`

### Informations sur les tokens

- `GET /api/token/info/:tokenAddress`

  - **Description**: Récupère les informations complètes d'un token
  - **Exemple**: `/api/token/info/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
  - **Résultat**: Métadonnées complètes du token (nom, symbole, décimales, logo, etc.)

- `GET /api/token/price/:tokenAddress`

  - **Description**: Récupère le prix actuel d'un token
  - **Exemple**: `/api/token/price/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
  - **Résultat**: Prix actuel du token en USD et données associées

- `GET /api/token/price-history/:tokenAddress`

  - **Description**: Récupère l'historique des prix d'un token
  - **Paramètres**:
    - `days` (number, défaut: 30): Nombre de jours d'historique
    - `resolution` (string, défaut: '1D'): Résolution des données ('1H', '1D', etc.)
  - **Exemple**: `/api/token/price-history/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v?days=7&resolution=1H`
  - **Résultat**: Série temporelle des prix du token

- `GET /api/token/market-data/:symbol`

  - **Description**: Récupère des données de marché plus larges pour un token via CryptoCompare
  - **Paramètres**:
    - `currency` (string, défaut: 'USD'): Devise de référence
  - **Exemple**: `/api/token/market-data/SOL?currency=USD`
  - **Résultat**: Données OHLCV et métriques de marché complètes

- `GET /api/token/compare`

  - **Description**: Compare plusieurs tokens entre eux
  - **Paramètres**:
    - `tokens` (string, requis): Liste d'adresses de tokens séparées par des virgules
    - `days` (number, défaut: 30): Nombre de jours d'historique à comparer
  - **Exemple**: `/api/token/compare?tokens=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v,So11111111111111111111111111111111111111112&days=7`
  - **Résultat**: Comparaison des prix et performances des tokens spécifiés

- `GET /api/token/liquidity/:tokenAddress`

  - **Description**: Récupère les informations de liquidité pour un token
  - **Exemple**: `/api/token/liquidity/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
  - **Résultat**: Données de liquidité, volumes et paires de trading

- `GET /api/token/quote`

  - **Description**: Récupère une cotation pour un échange de token via Jupiter
  - **Paramètres**:
    - `inputMint` (string, requis): Adresse du token source
    - `outputMint` (string, requis): Adresse du token cible
    - `amount` (string, requis): Montant à échanger
    - `slippageBps` (number, défaut: 50): Tolérance de slippage en points de base
    - `onlyDirectRoutes` (boolean, défaut: false): Limiter aux routes d'échange directes
  - **Exemple**: `/api/token/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=So11111111111111111111111111111111111111112&amount=1000000`
  - **Résultat**: Cotation pour l'échange avec routes disponibles et estimations

- `GET /api/token/trending`

  - **Description**: Récupère les tokens tendance du moment
  - **Résultat**: Liste des tokens populaires avec leurs métriques

- `GET /api/token/staking-opportunities/:tokenAddress`
  - **Description**: Récupère les opportunités de staking pour un token
  - **Exemple**: `/api/token/staking-opportunities/So11111111111111111111111111111111111111112`
  - **Résultat**: Liste des protocoles de staking avec APY, TVL et conditions

### Transactions

- `GET /api/transaction/:signature`

  - **Description**: Récupère et analyse une transaction
  - **Exemple**: `/api/transaction/5QkEo1ZLu8soGfXQ7KgP3piGZV6EqA5jEKyVNm7eJVA8HKHEVjRY71J7Bb9NvVT6RZwjgwTuGAstmBkpGXhc57P`
  - **Résultat**: Détails complets de la transaction avec analyse

- `GET /api/transaction/portfolio-format/:signature`

  - **Description**: Récupère et analyse une transaction au format compatible avec la bibliothèque Portfolio
  - **Exemple**: `/api/transaction/portfolio-format/5QkEo1ZLu8soGfXQ7KgP3piGZV6EqA5jEKyVNm7eJVA8HKHEVjRY71J7Bb9NvVT6RZwjgwTuGAstmBkpGXhc57P`
  - **Résultat**: Format de transaction compatible avec la bibliothèque Portfolio, incluant les changements de solde et les activités

- `GET /api/transaction/history/:address`
  - **Description**: Récupère l'historique des transactions d'un portefeuille
  - **Paramètres**:
    - `limit` (number, défaut: 10, max: 50): Nombre de transactions à récupérer
    - `before` (string, optionnel): Signature de transaction pour pagination
    - `startDate` (string, optionnel): Date de début (format ISO)
    - `endDate` (string, optionnel): Date de fin (format ISO)
    - `useDemo` (boolean, défaut: false): Utiliser une adresse de démo avec des transactions existantes
    - `includePrices` (boolean, défaut: true): Inclure les prix historiques des tokens
  - **Exemple**: `/api/transaction/history/FuRS2oiXnGvwabV7JYjBU1VQCa6aida7LDybt91xy1YH?limit=30`
  - **Résultat**: Liste des transactions avec détails complets et changements de soldes

## Sources de données et limitations

### Récupération des historiques de prix

L'API utilise plusieurs sources pour obtenir l'historique des prix des tokens au moment d'une transaction:

1. **Birdeye** (source primaire) - Utilise l'API de Birdeye pour obtenir l'historique des prix proche de la timestamp de la transaction
2. **CoinGecko** - Utilisé comme fallback si un ID CoinGecko est disponible pour le token
3. **CryptoCompare** - Utilisé pour les tokens populaires (SOL, USDC, etc.) si les autres sources échouent
4. **Jupiter** - Utilisé uniquement pour enrichir les métadonnées des tokens (nom, symbole, logo) et en dernier recours pour les prix actuels

### Limitations connues

- **Logs limités**: Vercel n'affiche pas tous les logs dans l'interface, ce qui rend le débogage difficile
- **Historique des prix incomplet**: Certains tokens peu connus peuvent ne pas avoir d'historique de prix
- **Timeouts**: Les requêtes multiples aux différentes APIs peuvent provoquer des timeouts sur Vercel
- **Limites des APIs gratuites**: Les APIs comme CoinGecko ont des limites strictes en version gratuite

## Test de l'API

Un script de test est disponible pour vérifier le fonctionnement de l'API:

```
node test-api.js
```

## Résolution des problèmes courants

### Absence d'historique des prix

Si l'historique des prix n'apparaît pas pour une transaction:

1. **Vérifiez que les tokens sont reconnus** - Seuls les tokens connus peuvent avoir un historique de prix
2. **Vérifiez les clés API** - Assurez-vous que toutes vos clés API (Birdeye, CoinGecko, etc.) sont valides et configurées
3. **Augmentez la période de recherche** - Modifiez la plage de temps dans `enrichTransactionWithPriceHistory()` pour trouver des prix plus éloignés

### Erreurs 500 ou Timeouts

1. **Réduisez le nombre de requêtes parallèles** - Limitez le nombre de promesses traitées simultanément
2. **Implémentez un système de cache** - Stockez temporairement les résultats des requêtes fréquentes
3. **Augmentez les délais d'expiration** - Configurez des délais plus longs pour les requêtes API

## Services intégrés

- **Helius** : Données on-chain pour Solana
- **Alchemy** : Données enrichies pour les transactions et tokens
- **Jupiter** : Métadonnées des tokens et information de prix
- **Birdeye** : Prix historiques et métadonnées des tokens
- **CryptoCompare** : Données de marché supplémentaires
- **CoinGecko** : Tendances et métadonnées des tokens

## Sécurité

N'oubliez pas de sécuriser vos clés API et de ne jamais les exposer dans votre code ou votre frontend.

## Futur développement

- Mise en place d'un système de cache Redis
- Optimisation des requêtes parallèles
- Amélioration de la gestion des erreurs et de la journalisation
- Davantage de sources pour l'historique des prix
