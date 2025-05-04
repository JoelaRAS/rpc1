# 2Profiler RPC API

API RPC pour le projet 2Profiler permettant d'analyser les portefeuilles blockchain, suivre la performance des tokens et faciliter les transactions.

## Installation

1. Cloner le projet
2. Installer les dépendances :

```
npm install
```

3. Configurer les variables d'environnement dans le fichier `.env` :

```
HELIUS_API_KEY=votre_clé_helius_api
ALCHEMY_API_KEY=votre_clé_alchemy_api
JUPITER_API_KEY=votre_clé_jupiter_api
BIRDEYE_API_KEY=votre_clé_birdeye_api
CRYPTOCOMPARE_API_KEY=votre_clé_cryptocompare_api
COINGECKO_API_KEY=votre_clé_coingecko_api
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

L'API RPC expose plusieurs endpoints organisés par fonctionnalité :

### Analyse de portefeuille

- `GET /api/portfolio/balances/:walletAddress` - Récupère les soldes des tokens dans un portefeuille
- `GET /api/portfolio/assets/:walletAddress` - Récupère tous les assets (tokens + NFTs) avec leurs valeurs
- `GET /api/portfolio/history/:walletAddress` - Récupère l'historique des transactions
- `GET /api/portfolio/analysis/:walletAddress` - Récupère une analyse complète du portefeuille
- `GET /api/portfolio/token-transfers/:walletAddress` - Récupère l'historique des transferts de tokens

### Informations sur les tokens

- `GET /api/token/info/:tokenAddress` - Récupère les informations complètes d'un token
- `GET /api/token/price/:tokenAddress` - Récupère le prix actuel d'un token
- `GET /api/token/price-history/:tokenAddress` - Récupère l'historique des prix d'un token
- `GET /api/token/market-data/:symbol` - Récupère des données de marché plus larges
- `GET /api/token/compare` - Compare plusieurs tokens entre eux
- `GET /api/token/liquidity/:tokenAddress` - Récupère les informations de liquidité
- `GET /api/token/quote` - Récupère une cotation pour un échange de token via Jupiter
- `GET /api/token/trending` - Récupère les tokens tendance du moment

### Transactions

- `GET /api/transaction/:signature` - Récupère les détails d'une transaction
- `POST /api/transaction/swap` - Construit une transaction de swap via Jupiter
- `POST /api/transaction/send` - Prépare une transaction pour envoyer des tokens
- `POST /api/transaction/stake` - Prépare une transaction pour staker des tokens
- `GET /api/transaction/simulate` - Simule les effets d'une transaction

## Cas d'utilisation avec l'IA

Ce RPC est spécifiquement conçu pour être utilisé par un agent IA pour répondre à des questions comme :

- "Analyse la performance de mon wallet durant les X derniers jours"
- "Compare la performance de mon wallet le mois dernier vs ce mois-ci"
- "Quels sont mes top assets les plus performants ?"
- "Est-ce que tu peux me montrer un insight que je connais pas de mon wallet"
- "Est-ce que mon portefolio est suffisamment diversifié ?"
- "Y a-t-il des assets ou pools (staking, rendement) plus performants que je devrais considérer ?"

L'API retourne toutes les données sous format JSON pour faciliter l'analyse par l'IA.

## Services intégrés

- **Helius** : Données on-chain pour Solana
- **Alchemy** : Données enrichies pour les transactions et tokens
- **Jupiter** : Swaps et liquidités
- **Birdeye** : Prix historiques et métadonnées des tokens
- **CryptoCompare** : Données de marché supplémentaires
- **CoinGecko** : Tendances et métadonnées des tokens

## Sécurité

N'oubliez pas de sécuriser vos clés API et de ne jamais les exposer dans votre code ou votre frontend.
