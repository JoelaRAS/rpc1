const axios = require('axios');
const cacheService = require('./cacheService');
const birdeyeService = require('./birdeyeService');
const coinGeckoService = require('./coinGeckoService');
const cryptoCompareService = require('./cryptoCompareService');

// Priorité des services de prix
const PRICE_SERVICES = ['birdeye', 'coingecko', 'cryptocompare'];

// Configuration du circuit breaker
const CIRCUIT_BREAKER = {
  birdeye: { failures: 0, lastFailure: 0, threshold: 5, resetTimeMs: 60000 },
  coingecko: { failures: 0, lastFailure: 0, threshold: 5, resetTimeMs: 60000 },
  cryptocompare: { failures: 0, lastFailure: 0, threshold: 5, resetTimeMs: 60000 }
};

/**
 * Service pour la récupération des prix de tokens
 */
const priceService = {
  /**
   * Vérifie si un service est disponible ou en circuit ouvert
   * @param {string} service - Nom du service
   * @returns {boolean} - true si le service est disponible, false sinon
   */
  isServiceAvailable: function(service) {
    if (!CIRCUIT_BREAKER[service]) return true;
    
    const circuitData = CIRCUIT_BREAKER[service];
    
    // Si le nombre d'échecs est inférieur au seuil, le service est disponible
    if (circuitData.failures < circuitData.threshold) {
      return true;
    }
    
    // Vérifier si le temps de reset est écoulé
    const currentTime = Date.now();
    if (currentTime - circuitData.lastFailure > circuitData.resetTimeMs) {
      // Réinitialiser le compteur d'échecs après la période de repos
      circuitData.failures = 0;
      return true;
    }
    
    return false;
  },
  
  /**
   * Marquer un service comme ayant échoué
   * @param {string} service - Nom du service
   */
  markServiceFailure: function(service) {
    if (!CIRCUIT_BREAKER[service]) return;
    
    CIRCUIT_BREAKER[service].failures += 1;
    CIRCUIT_BREAKER[service].lastFailure = Date.now();
    
    if (CIRCUIT_BREAKER[service].failures >= CIRCUIT_BREAKER[service].threshold) {
      console.warn(`Circuit ouvert pour le service ${service} - Trop d'échecs consécutifs`);
    }
  },
  
  /**
   * Marquer un service comme fonctionnant correctement
   * @param {string} service - Nom du service
   */
  markServiceSuccess: function(service) {
    if (!CIRCUIT_BREAKER[service]) return;
    
    // Réduire progressivement le compteur d'échecs en cas de succès
    if (CIRCUIT_BREAKER[service].failures > 0) {
      CIRCUIT_BREAKER[service].failures = Math.max(0, CIRCUIT_BREAKER[service].failures - 1);
    }
  },

  /**
   * Récupère le prix d'un token en utilisant tous les services disponibles
   * @param {string} tokenMint - L'adresse du token
   * @param {Object} options - Options de configuration
   * @returns {Promise<Object>} - Prix et métadonnées du token
   */
  getTokenPrice: async function(tokenMint, options = {}) {
    const { forceRefresh = false, serviceOverride = null } = options;
    
    try {
      // 1. Vérifier d'abord le cache si le rafraîchissement forcé n'est pas demandé
      if (!forceRefresh) {
        const cachedPrice = cacheService.getPrice(tokenMint);
        if (cachedPrice) {
          return cachedPrice;
        }
      }
      
      // 2. Si un service spécifique est demandé, utiliser uniquement celui-ci
      if (serviceOverride && PRICE_SERVICES.includes(serviceOverride)) {
        // Vérifier si le service est disponible
        if (!this.isServiceAvailable(serviceOverride)) {
          throw new Error(`Le service ${serviceOverride} est temporairement indisponible (circuit ouvert)`);
        }
        return await this.getPriceFromService(tokenMint, serviceOverride);
      }
      
      // 3. Sinon, essayer tous les services dans l'ordre de priorité
      for (const service of PRICE_SERVICES) {
        // Ignorer les services en circuit ouvert
        if (!this.isServiceAvailable(service)) {
          console.warn(`Service ${service} ignoré (circuit ouvert)`);
          continue;
        }
        
        try {
          const priceData = await this.getPriceFromService(tokenMint, service);
          if (priceData && priceData.price && priceData.price > 0) {
            // Marquer le service comme fonctionnant
            this.markServiceSuccess(service);
            
            // Mettre en cache le résultat
            cacheService.setPrice(tokenMint, priceData);
            return priceData;
          }
        } catch (serviceError) {
          console.warn(`Erreur du service ${service} pour ${tokenMint}:`, serviceError.message);
          // Marquer le service comme ayant échoué
          this.markServiceFailure(service);
          // Continuer avec le service suivant
        }
      }
      
      // 4. Si aucun service ne fonctionne, renvoyer un prix par défaut
      return {
        mint: tokenMint,
        price: 0,
        priceUsd: 0,
        priceSol: 0,
        source: 'none'
      };
    } catch (error) {
      console.error('Erreur lors de la récupération du prix:', error.message);
      throw new Error(`Impossible d'obtenir le prix pour ${tokenMint}: ${error.message}`);
    }
  },
  
  /**
   * Récupère le prix d'un token à partir d'un service spécifique
   * @param {string} tokenMint - L'adresse du token
   * @param {string} service - Le service à utiliser ('birdeye', 'coingecko', 'cryptocompare')
   * @returns {Promise<Object>} - Prix et métadonnées du token
   */
  getPriceFromService: async function(tokenMint, service) {
    try {
      let priceData = null;
      
      switch (service) {
        case 'birdeye':
          priceData = await birdeyeService.getTokenPrice(tokenMint);
          break;
        case 'coingecko':
          priceData = await coinGeckoService.getTokenPrice(tokenMint);
          break;
        case 'cryptocompare':
          priceData = await cryptoCompareService.getTokenPrice(tokenMint);
          break;
        default:
          throw new Error(`Service de prix non supporté: ${service}`);
      }
      
      if (priceData && priceData.price) {
        return {
          ...priceData,
          source: service
        };
      }
      
      throw new Error(`Aucun prix trouvé pour ${tokenMint} avec le service ${service}`);
    } catch (error) {
      console.warn(`Erreur lors de la récupération du prix avec ${service}:`, error.message);
      throw error;
    }
  },
  
  /**
   * Récupère les prix de plusieurs tokens en parallèle
   * @param {Array<string>} tokenMints - Liste d'adresses de tokens
   * @param {Object} options - Options de configuration
   * @returns {Promise<Object>} - Prix des tokens indexés par adresse
   */
  getBatchTokenPrices: async function(tokenMints, options = {}) {
    try {
      if (!Array.isArray(tokenMints) || tokenMints.length === 0) {
        return {};
      }
      
      // Limiter le nombre de requêtes parallèles pour éviter de surcharger les APIs
      const batchSize = 10;
      const results = {};
      
      // Traiter par lots
      for (let i = 0; i < tokenMints.length; i += batchSize) {
        const batch = tokenMints.slice(i, i + batchSize);
        
        // Créer un tableau de promesses pour le lot actuel
        const promises = batch.map(mint => 
          this.getTokenPrice(mint, options)
            .catch(error => {
              console.warn(`Erreur pour ${mint}:`, error.message);
              return { mint, price: 0, error: error.message };
            })
        );
        
        // Attendre toutes les promesses du lot
        const batchResults = await Promise.all(promises);
        
        // Ajouter les résultats du lot au résultat global
        batchResults.forEach(result => {
          if (result && result.mint) {
            results[result.mint] = result;
          }
        });
      }
      
      return results;
    } catch (error) {
      console.error('Erreur lors de la récupération des prix par lot:', error.message);
      throw new Error(`Impossible d'obtenir les prix par lot: ${error.message}`);
    }
  },
  
  /**
   * Récupère le prix de SOL en USD
   * @returns {Promise<number>} - Prix de SOL en USD
   */
  getSolPrice: async function() {
    try {
      // Vérifier d'abord le cache
      const cachedPrice = cacheService.getPrice('SOL');
      if (cachedPrice) {
        return cachedPrice.priceUsd || 0;
      }
      
      // Essayer tous les services
      for (const service of PRICE_SERVICES) {
        // Ignorer les services en circuit ouvert
        if (!this.isServiceAvailable(service)) {
          console.warn(`Service ${service} ignoré (circuit ouvert)`);
          continue;
        }
        
        try {
          let solPrice = 0;
          
          switch (service) {
            case 'birdeye':
              const data = await birdeyeService.getTokenPrice('So11111111111111111111111111111111111111112');
              solPrice = data && data.priceUsd ? data.priceUsd : 0;
              break;
            case 'coingecko':
              const cgData = await coinGeckoService.getSolPrice();
              solPrice = cgData && cgData.usd ? cgData.usd : 0;
              break;
            case 'cryptocompare':
              const ccData = await cryptoCompareService.getSolPrice();
              solPrice = ccData && ccData.USD ? ccData.USD : 0;
              break;
          }
          
          if (solPrice > 0) {
            // Marquer le service comme fonctionnant
            this.markServiceSuccess(service);
            
            // Mettre en cache le résultat
            cacheService.setPrice('SOL', { 
              mint: 'So11111111111111111111111111111111111111112', 
              symbol: 'SOL', 
              name: 'Solana', 
              price: solPrice, 
              priceUsd: solPrice, 
              priceSol: 1, 
              source: service 
            });
            return solPrice;
          }
        } catch (serviceError) {
          console.warn(`Erreur du service ${service} pour SOL:`, serviceError.message);
          // Marquer le service comme ayant échoué
          this.markServiceFailure(service);
          // Continuer avec le service suivant
        }
      }
      
      // Si aucun service ne fonctionne, renvoyer une valeur par défaut ou la dernière valeur connue
      return 0;
    } catch (error) {
      console.error('Erreur lors de la récupération du prix de SOL:', error.message);
      // Valeur par défaut en cas d'erreur
      return 0;
    }
  }
};

module.exports = priceService;