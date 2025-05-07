const axios = require('axios');
const cacheService = require('./cacheService');
const pythService = require('./pythService');
const birdeyeService = require('./birdeyeService');
const coinGeckoService = require('./coinGeckoService');
const cryptoCompareService = require('./cryptoCompareService');

const priceService = {
  /**
   * Récupère le prix actuel d'un token
   * @param {string} tokenMint - Adresse du token
   * @returns {Promise<Object|null>} - Données de prix ou null si non trouvé
   */
  getCurrentPrice: async function(tokenMint) {
    try {
      if (!tokenMint) {
        console.warn('Token mint non fourni pour getCurrentPrice');
        return null;
      }
      
      const now = Math.floor(Date.now() / 1000);
      const cacheKey = `token_price_${tokenMint}_${now}`;
      
      // Vérifier le cache d'abord
      const cachedPrice = cacheService.getPrice(cacheKey);
      if (cachedPrice) {
        return cachedPrice;
      }
      
      // Essayer d'abord BirdEye (priorité la plus élevée)
      try {
        const birdeyePrice = await birdeyeService.getTokenPriceByMint(tokenMint);
        if (birdeyePrice && birdeyePrice.price) {
          console.log(`Prix obtenu de BirdEye pour ${tokenMint}: ${birdeyePrice.price} USD`);
          
          // Mettre en cache le résultat
          cacheService.setPrice(cacheKey, birdeyePrice, 300); // Cache de 5 minutes
          return birdeyePrice;
        }
      } catch (error) {
        console.warn(`Erreur BirdEye pour ${tokenMint}:`, error.message);
      }
      
      // Essayer avec Pyth comme seconde option
      try {
        const pythPrice = await pythService.getCurrentPrice(tokenMint);
        if (pythPrice && pythPrice.price) {
          console.log(`Prix obtenu de Pyth pour ${tokenMint}: ${pythPrice.price} USD`);
          
          // Mettre en cache le résultat
          cacheService.setPrice(cacheKey, pythPrice, 300); // Cache de 5 minutes
          return pythPrice;
        }
      } catch (error) {
        console.warn(`Erreur Pyth pour ${tokenMint}:`, error.message);
      }
      
      // Essayer avec CoinGecko comme troisième option
      try {
        const coingeckoPrice = await coinGeckoService.getTokenPriceByMint(tokenMint);
        if (coingeckoPrice && coingeckoPrice.price) {
          console.log(`Prix obtenu de CoinGecko pour ${tokenMint}: ${coingeckoPrice.price} USD`);
          
          // Mettre en cache le résultat
          cacheService.setPrice(cacheKey, coingeckoPrice, 300); // Cache de 5 minutes
          return coingeckoPrice;
        }
      } catch (error) {
        console.warn(`Erreur CoinGecko pour ${tokenMint}:`, error.message);
      }
      
      // Essayer avec CryptoCompare comme dernière option
      try {
        const cryptoComparePrice = await cryptoCompareService.getTokenPriceByMint(tokenMint);
        if (cryptoComparePrice && cryptoComparePrice.price) {
          console.log(`Prix obtenu de CryptoCompare pour ${tokenMint}: ${cryptoComparePrice.price} USD`);
          
          // Mettre en cache le résultat
          cacheService.setPrice(cacheKey, cryptoComparePrice, 300); // Cache de 5 minutes
          return cryptoComparePrice;
        }
      } catch (error) {
        console.warn(`Erreur CryptoCompare pour ${tokenMint}:`, error.message);
      }
      
      console.warn(`Aucun prix trouvé pour ${tokenMint} via toutes les sources disponibles`);
      return null;
    } catch (error) {
      console.error(`Erreur générale dans getCurrentPrice pour ${tokenMint}:`, error.message);
      return null;
    }
  },

  /**
   * Récupère le prix historique d'un token à un instant précis
   * @param {string} tokenMint - Adresse du token
   * @param {number} timestamp - Timestamp Unix en secondes
   * @returns {Promise<Object|null>} - Données de prix ou null si non trouvé
   */
  getHistoricalPrice: async function(tokenMint, timestamp) {
    try {
      if (!tokenMint || !timestamp) {
        console.warn(`Paramètres invalides pour getHistoricalPrice: token=${tokenMint}, timestamp=${timestamp}`);
        return null;
      }
      
      // Créer une clé de cache unique pour cette paire token/timestamp
      const cacheKey = `historical_price_${tokenMint}_${timestamp}`;
      
      // Vérifier le cache
      const cachedPrice = cacheService.getPrice(cacheKey);
      if (cachedPrice) {
        console.log(`Utilisation du cache pour le prix historique de ${tokenMint} à ${timestamp}`);
        return cachedPrice;
      }
      
      console.log(`Récupération du prix historique pour ${tokenMint} à ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
      
      // Stratégie de chute en cascade : essayer chaque source jusqu'à ce qu'une réussisse
      
      // 1. Essayer d'abord Pyth Network pour les prix historiques précis
      try {
        console.log(`Essai avec Pyth Network pour ${tokenMint} à ${timestamp}`);
        const pythPrice = await pythService.getHistoricalPrice(tokenMint, timestamp);
        
        if (pythPrice && (pythPrice.price || pythPrice.priceUsd)) {
          console.log(`Prix historique obtenu de Pyth pour ${tokenMint}: ${pythPrice.priceUsd || pythPrice.price} USD`);
          
          // Ajouter des champs supplémentaires au résultat
          const enrichedPrice = {
            ...pythPrice,
            mint: tokenMint,
            timestamp,
            date: new Date(timestamp * 1000).toISOString(),
            source: 'pyth'
          };
          
          // Mettre en cache le résultat pour une journée
          cacheService.setPrice(cacheKey, enrichedPrice, 86400);
          
          return enrichedPrice;
        }
        console.log(`Aucun prix disponible via Pyth pour ${tokenMint} à ${timestamp}`);
      } catch (error) {
        console.warn(`Erreur Pyth pour prix historique de ${tokenMint}:`, error.message);
      }
      
      // 2. Essayer BirdEye
      try {
        console.log(`Essai avec BirdEye pour ${tokenMint} à ${timestamp}`);
        const birdeyePrice = await birdeyeService.getHistoricalPriceByMint(tokenMint, timestamp);
        
        if (birdeyePrice && birdeyePrice.price) {
          console.log(`Prix historique obtenu de BirdEye pour ${tokenMint}: ${birdeyePrice.price} USD`);
          
          // Ajouter des champs supplémentaires au résultat
          const enrichedPrice = {
            ...birdeyePrice,
            mint: tokenMint,
            timestamp,
            date: new Date(timestamp * 1000).toISOString(),
            source: 'birdeye'
          };
          
          // Mettre en cache le résultat pour une journée
          cacheService.setPrice(cacheKey, enrichedPrice, 86400);
          
          return enrichedPrice;
        }
        console.log(`Aucun prix disponible via BirdEye pour ${tokenMint} à ${timestamp}`);
      } catch (error) {
        console.warn(`Erreur BirdEye pour prix historique de ${tokenMint}:`, error.message);
      }
      
      // 3. Essayer CoinGecko
      try {
        console.log(`Essai avec CoinGecko pour ${tokenMint} à ${timestamp}`);
        const coingeckoPrice = await coinGeckoService.getHistoricalPriceByMint(tokenMint, timestamp);
        
        if (coingeckoPrice && coingeckoPrice.price) {
          console.log(`Prix historique obtenu de CoinGecko pour ${tokenMint}: ${coingeckoPrice.price} USD`);
          
          // Ajouter des champs supplémentaires au résultat
          const enrichedPrice = {
            ...coingeckoPrice,
            mint: tokenMint,
            timestamp,
            date: new Date(timestamp * 1000).toISOString(),
            source: 'coingecko'
          };
          
          // Mettre en cache le résultat pour une journée
          cacheService.setPrice(cacheKey, enrichedPrice, 86400);
          
          return enrichedPrice;
        }
        console.log(`Aucun prix disponible via CoinGecko pour ${tokenMint} à ${timestamp}`);
      } catch (error) {
        console.warn(`Erreur CoinGecko pour prix historique de ${tokenMint}:`, error.message);
      }
      
      // 4. Essayer CryptoCompare
      try {
        console.log(`Essai avec CryptoCompare pour ${tokenMint} à ${timestamp}`);
        const cryptoComparePrice = await cryptoCompareService.getHistoricalPriceByMint(tokenMint, timestamp);
        
        if (cryptoComparePrice && cryptoComparePrice.price) {
          console.log(`Prix historique obtenu de CryptoCompare pour ${tokenMint}: ${cryptoComparePrice.price} USD`);
          
          // Ajouter des champs supplémentaires au résultat
          const enrichedPrice = {
            ...cryptoComparePrice,
            mint: tokenMint,
            timestamp,
            date: new Date(timestamp * 1000).toISOString(),
            source: 'cryptocompare'
          };
          
          // Mettre en cache le résultat pour une journée
          cacheService.setPrice(cacheKey, enrichedPrice, 86400);
          
          return enrichedPrice;
        }
        console.log(`Aucun prix disponible via CryptoCompare pour ${tokenMint} à ${timestamp}`);
      } catch (error) {
        console.warn(`Erreur CryptoCompare pour prix historique de ${tokenMint}:`, error.message);
      }
      
      // 5. Stratégie de secours : utiliser le prix le plus proche temporellement
      console.log(`Aucun prix historique exact trouvé, recherche du prix le plus proche pour ${tokenMint}`);
      
      // Essayer de trouver le prix actuel et l'utiliser comme approximation
      try {
        const currentPrice = await this.getCurrentPrice(tokenMint);
        
        if (currentPrice && (currentPrice.price || currentPrice.priceUsd)) {
          console.log(`Utilisation du prix actuel comme approximation pour ${tokenMint}: ${currentPrice.price || currentPrice.priceUsd} USD`);
          
          const approximatedPrice = {
            ...currentPrice,
            mint: tokenMint,
            timestamp,
            date: new Date(timestamp * 1000).toISOString(),
            source: `approximated_${currentPrice.source}`,
            note: 'Prix approximé à partir du prix actuel'
          };
          
          // Mettre en cache temporairement (valide uniquement quelques heures)
          cacheService.setPrice(cacheKey, approximatedPrice, 3600 * 4);
          
          return approximatedPrice;
        }
      } catch (error) {
        console.warn(`Erreur lors de l'approximation du prix pour ${tokenMint}:`, error.message);
      }
      
      // Enregistrer un résultat nul pour éviter de retenter en permanence
      const nullPrice = {
        mint: tokenMint,
        price: null,
        priceUsd: null,
        timestamp,
        date: new Date(timestamp * 1000).toISOString(),
        source: 'unknown',
        note: 'Prix historique non disponible via aucune source'
      };
      
      // Cache court pour les résultats nuls (1 heure) pour permettre de réessayer
      cacheService.setPrice(cacheKey, nullPrice, 3600);
      
      console.warn(`Aucun prix historique disponible pour ${tokenMint} à ${timestamp} via toutes les sources`);
      return nullPrice;
    } catch (error) {
      console.error(`Erreur générale dans getHistoricalPrice pour ${tokenMint}:`, error.message);
      return null;
    }
  },

  /**
   * Récupère l'historique complet des prix pour un jeton
   * @param {string} tokenMint - Adresse du token
   * @param {number} startTimestamp - Timestamp de début
   * @param {number} endTimestamp - Timestamp de fin (optionnel, par défaut maintenant)
   * @param {string} interval - Intervalle entre chaque point de données (1h, 1d, etc.)
   * @returns {Promise<Object>} - Historique des prix
   */
  getPriceHistory: async function(tokenMint, startTimestamp, endTimestamp = Math.floor(Date.now() / 1000), interval = '1d') {
    try {
      if (!tokenMint || !startTimestamp) {
        console.warn('Paramètres invalides pour getPriceHistory');
        return {};
      }
      
      console.log(`Récupération de l'historique des prix pour ${tokenMint} du ${new Date(startTimestamp * 1000).toISOString()} au ${new Date(endTimestamp * 1000).toISOString()}`);
      
      // Convertir l'intervalle en secondes
      let intervalSeconds;
      switch (interval.toLowerCase()) {
        case '1h':
          intervalSeconds = 3600;
          break;
        case '6h':
          intervalSeconds = 21600;
          break;
        case '12h':
          intervalSeconds = 43200;
          break;
        case '1d':
        default:
          intervalSeconds = 86400;
          break;
      }
      
      // Générer une liste de timestamps selon l'intervalle
      const timestamps = [];
      for (let ts = startTimestamp; ts <= endTimestamp; ts += intervalSeconds) {
        timestamps.push(ts);
      }
      
      // Ajouter le timestamp de fin s'il n'est pas déjà inclus
      if (timestamps[timestamps.length - 1] !== endTimestamp) {
        timestamps.push(endTimestamp);
      }
      
      console.log(`Collecte des prix pour ${timestamps.length} points de données`);
      
      // Récupérer les prix pour chaque timestamp
      const pricePromises = timestamps.map(ts => this.getHistoricalPrice(tokenMint, ts));
      const prices = await Promise.all(pricePromises);
      
      // Construire un dictionnaire des prix indexés par timestamp
      const priceHistory = {};
      prices.forEach(price => {
        if (price && price.timestamp) {
          const key = `${tokenMint}-${price.timestamp}`;
          priceHistory[key] = price;
        }
      });
      
      return priceHistory;
    } catch (error) {
      console.error(`Erreur dans getPriceHistory pour ${tokenMint}:`, error.message);
      return {};
    }
  },

  /**
   * Récupère l'historique complet des prix pour plusieurs tokens
   * @param {Array<string>} tokenMints - Liste d'adresses de tokens
   * @param {number} startTimestamp - Timestamp de début
   * @param {number} endTimestamp - Timestamp de fin (optionnel, par défaut maintenant)
   * @param {string} interval - Intervalle entre chaque point de données (1h, 1d, etc.)
   * @returns {Promise<Object>} - Historique des prix par token
   */
  getMultiTokenPriceHistory: async function(tokenMints, startTimestamp, endTimestamp = Math.floor(Date.now() / 1000), interval = '1d') {
    try {
      if (!Array.isArray(tokenMints) || tokenMints.length === 0 || !startTimestamp) {
        console.warn('Paramètres invalides pour getMultiTokenPriceHistory');
        return {};
      }
      
      console.log(`Récupération de l'historique des prix pour ${tokenMints.length} tokens`);
      
      // Récupérer l'historique des prix pour chaque token
      const tokenPromises = tokenMints.map(mint => {
        return this.getPriceHistory(mint, startTimestamp, endTimestamp, interval)
          .then(history => ({ mint, history }));
      });
      
      const results = await Promise.all(tokenPromises);
      
      // Organiser les résultats par token
      const priceHistoryByToken = {};
      results.forEach(result => {
        if (result && result.mint && result.history) {
          const pathParts = result.mint.split('/');
          const tokenId = pathParts[pathParts.length - 1];
          priceHistoryByToken[tokenId] = result.history;
        }
      });
      
      return priceHistoryByToken;
    } catch (error) {
      console.error('Erreur dans getMultiTokenPriceHistory:', error.message);
      return {};
    }
  }
};

module.exports = priceService;