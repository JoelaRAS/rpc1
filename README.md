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

- `GET /api/portfolio/:walletAddress` - Récupère les informations complètes d'un portefeuille (solde SOL et tokens)
- `GET /api/portfolio/balances/:walletAddress` - Récupère uniquement les soldes des tokens
- `GET /api/portfolio/assets/:walletAddress` - Récupère tous les assets (tokens + NFTs) avec leurs valeurs
- `GET /api/portfolio/history/:walletAddress` - Récupère l'historique des transactions
- `GET /api/portfolio/analysis/:walletAddress` - Récupère une analyse complète du portefeuille
- `GET /api/portfolio/token-transfers/:walletAddress` - Récupère l'historique des transferts de tokens

### Informations sur les tokens

- `GET /api/token/:tokenAddress` - Récupère les informations d'un token
- `GET /api/token/info/:tokenAddress` - Récupère les informations complètes d'un token
- `GET /api/token/price/:tokenAddress` - Récupère le prix actuel d'un token
- `GET /api/token/price-history/:tokenAddress` - Récupère l'historique des prix d'un token
- `GET /api/token/market-data/:symbol` - Récupère des données de marché plus larges
- `GET /api/token/compare` - Compare plusieurs tokens entre eux
- `GET /api/token/liquidity/:tokenAddress` - Récupère les informations de liquidité
- `GET /api/token/trending` - Récupère les tokens tendance du moment

### Transactions

- `GET /api/transaction/:signature` - Récupère les détails d'une transaction avec historique des prix

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
