const axios = require('axios');
const cacheService = require('./cacheService');
const jupiterService = require('./jupiterService');

/**
 * Mapping des symboles de tokens vers leurs identifiants de flux de prix Pyth
 * Format: SYMBOL => priceFeedId
 */
const PYTH_PRICE_FEEDS = {
  'SOL': 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'JITOSOL': '67be9f519b95cf24338801051f9a808eff0a578ccb388db73b7f6fe1de019ffb',
  'MSOL': 'c2289a6a43d2ce91c6f55caec370f4acc38a2ed477f58813334c6d03749ff2a4',
  'BSOL': '89875379e70f8fbadc17aef315adf3a8d5d160b811435537e03c97e8aac97d9c',
  'SSOL': 'add6499a420f809bbebc0b22fbf68acb8c119023897f6ea801688e0d6e391af4',
  'BONK': '72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
  'W': 'eff7446475e218517566ea99e72a4abec2e1bd8498b43b7d8331e29dcb059389',
  'KMNO': 'b17e5bc5de742a8a378b54c9c75442b7d51e30ada63f28d9bd28d3c0e26511a0',
  'MEW': '514aed52ca5294177f20187ae883cec4a018619772ddce41efcc36a6448f5d5d',
  'TNSR': '05ecd4597cd48fe13d6cc3596c62af4f9675aee06e2e0b94c06d8bee2b659e05',
  'USDC': 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  'BTC': 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'JTO': 'b43660a5f790c69354b0729a5ef9d50d68f1df92107540210b9cccba1f947cc2',
  'USDT': '2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
  'JUP': '0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
  'ETH': 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'PYTH': '0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff',
  'HNT': '649fdd7ec08e8e2a20f425729854e90293dcbe2376abc47197a14da6ff339756',
  'RENDU': '3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d',
  'ORCA': '37505261e557e251290b8c8899453064e8d760ed5c65a779726f2490980da74c',
  'SAMO': '49601625e1a342c1f90c3fe6a03ae0251991a1d76e480d2741524c29037be28a',
  'WIF': '4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc',
  'LST': '12fb674ee496045b1d9cf7d5e65379acb026133c2ad69f3ed996fb9fe68e3a37',
  'INF': 'f51570985c642c49c2d6e50156390fdba80bb6d5f7fa389d2f012ced4f7d208f',
  'PRCL': '5bbd1ce617792b476c55991c27cdfd89794f9f13356babc9c92405f5f0079683',
  'RAYON': '91568baa8beb53db23eb3fb7f22c6e8bd303d103919e19733f2bb642d3e7987a',
  'FIDA': 'c80657b7f6f3eac27218d09d5a4e54e47b25768d9f5e10ac15fe2cf900881400',
  'MNDE': '3607bf4d7b78666bd3736c7aacaf2fd2bc56caa8667d3224971ebe3c0623292a',
  'MOBILE': 'ff4c53361e36a9b837433c87d290c229e1f01aec5ef98d9f3f70953a20a629ce',
  'IOT': '6b701e292e0836d18a5904a08fe94534f9ab5c3d4ff37dc02c74dd0f4901944d',
  'NEON': 'd82183dd487bef3208a227bb25d748930db58862c5121198e723ed0976eb92b7',
  'AUD': '67a6f93030420c1c9e3fe37c1ab6b77966af82f995944a9fefce357a22854a80',
  'GBP': '84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1',
  'EUR': 'a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b',
  'XAG': 'f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e',
  'XAU': '765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2',
  'INJ': '7a5bc1d2b56ad029048cd63964b3ad2776eadf812edc1a43a31406cb54bff592',
  'SLND': 'f8d030e4ef460b91ad23eabbbb27aec463e3c30ecc8d5c4b71e92f54a36ccdbd',
  'WEN': '5169491cd7e2a44c98353b779d5eb612e4ac32e073f5cc534303d86307c2f1bc',
  'BLZE': '93c3def9b169f49eed14c9d73ed0e942c666cf0e1290657ec82038ebb792c2a8',
  'JLP': 'c811abc82b4bad1f9bd711a2773ccaa935b03ecef974236942cec5e0eb845a3a',
  'WBTC': 'c9d8b075a5c69303365ae23633d4e085199bf5c520a3b90fed1322a0342ffc33',
  'PENGU': 'bed3097008b9b5e3c93bec20be79cb43986b85a996475589351a21e67bae9b61',
  'AI16Z': '2551eca7784671173def2c41e6f3e51e11cd87494863f1d208fdd8c64a1f85ae',
  'TRUMP': '879551021853eec7a7dc827578e8e69da7e4fa8148339aa0d3d5296405be4b1a',
  'FARTCOIN': '58cd29ef0e714c5affc44f269b2c1899a52da4169d7acc147b9da692e6953608',
  'FARTROT': '76f54a7b9359680e9db0f591753768d05d246c5fed6644a4b3f2fde37f0e1d87',
  'OBLIVION': '82d0fedd3335edd8182934d6d505300870e66ec221e34b3c548f98367c1afd27',
  'SPAM': 'a49271f3cb60213d809a094872b22942897233cf12f86fa788bf9ab27e7ed1bd' // Ajout d'un feed pour les tokens de spam
};

/**
 * Liste des adresses de tokens connus pour être utilisés dans les transactions de spam
 */
const KNOWN_SPAM_ADDRESSES = [
  '3U6GsNZM2uuUy4CHqizW3HC2zQZRkyQxiou8uX7PjMak',
  'HDi9GPhtbjyRYTyM3BLKPrDEvpSbLFmjB8vHHLqgEGbF',
  '5Hr7wZg7oBpVhH5nngRqzr5W7ZFUfCsfEhbziZJak7fr'
];

/**
 * Service pour interagir avec l'API Pyth Network
 */
const pythService = {
  /**
   * URL de base pour l'API Hermes de Pyth
   */
  HERMES_BASE_URL: 'https://hermes.pyth.network/v2/updates/price',
  
  /**
   * URLs de sauvegarde pour les prix en cas d'échec de Pyth
   */
  BACKUP_PRICE_URLS: [
    'https://price-api.birdeye.so/public/price',
    'https://api.coingecko.com/api/v3/simple/price'
  ],

  /**
   * Vérifie si un symbole de token est supporté par Pyth
   * @param {string} symbol - Symbole du token (ex: 'SOL', 'BTC')
   * @returns {boolean} - true si le symbole est supporté
   */
  isSymbolSupported: function(symbol) {
    if (!symbol) return false;
    return !!PYTH_PRICE_FEEDS[symbol.toUpperCase()];
  },

  /**
   * Essaie de déterminer le symbole d'un token à partir de son adresse
   * en utilisant l'API Jupiter
   * @param {string} tokenMint - Adresse du token
   * @returns {Promise<string|null>} - Symbole du token ou null si non trouvé
   */
  async getSymbolFromMint(tokenMint) {
    if (!tokenMint) return null;
    
    // Cas spécial pour SOL (non-wrapped)
    if (tokenMint === 'SOL') return 'SOL';
    
    // Cas spécial pour Wrapped SOL
    if (tokenMint.toLowerCase() === 'so11111111111111111111111111111111111111112') {
      return 'SOL';
    }
    
    try {
      // Vérifier d'abord le cache
      const cacheKey = `token_symbol_${tokenMint}`;
      const cachedSymbol = cacheService.get(cacheKey);
      
      if (cachedSymbol) {
        return cachedSymbol;
      }
      
      // Obtenir les infos du token via Jupiter
      const jupiterInfo = await jupiterService.getTokenInfo(tokenMint);
      
      if (jupiterInfo && jupiterInfo.symbol) {
        // Mettre en cache le symbole pour les prochaines requêtes
        cacheService.set(cacheKey, jupiterInfo.symbol, 86400 * 7); // Cache d'une semaine
        
        console.log(`Symbole trouvé via Jupiter: ${tokenMint} => ${jupiterInfo.symbol}`);
        return jupiterInfo.symbol;
      }
      
      console.warn(`Aucun symbole trouvé pour ${tokenMint} via Jupiter`);
      return null;
    } catch (error) {
      console.error(`Erreur lors de la récupération du symbole pour ${tokenMint}:`, error.message);
      return null;
    }
  },

  /**
   * Vérifie si un token est supporté par Pyth via son adresse mint
   * @param {string} tokenMint - Adresse du token
   * @returns {Promise<boolean>} - true si le token est supporté
   */
  async isTokenSupported(tokenMint) {
    const symbol = await this.getSymbolFromMint(tokenMint);
    return symbol ? this.isSymbolSupported(symbol) : false;
  },

  /**
   * Vérifie si une adresse est connue comme étant utilisée pour le spam
   * @param {string} address - Adresse à vérifier
   * @returns {boolean} - true si l'adresse est connue comme spam
   */
  isKnownSpamAddress: function(address) {
    if (!address) return false;
    return KNOWN_SPAM_ADDRESSES.includes(address);
  },

  /**
   * Gère les erreurs de récupération de prix avec retentatives et fallback
   * @param {string} symbol - Symbole du token
   * @param {number} timestamp - Timestamp Unix en secondes
   * @param {Error} initialError - Erreur initiale
   * @returns {Promise<Object|null>} - Données de prix ou null si tous les essais échouent
   */
  async handlePriceError(symbol, timestamp, initialError) {
    console.warn(`Erreur lors de la récupération du prix Pyth pour ${symbol}:`, initialError.message);
    
    // Essai avec exponential backoff
    const maxRetries = 3;
    let delay = 500; // ms
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Tentative ${attempt}/${maxRetries} pour ${symbol} après ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Construire l'URL de l'API Hermes
        const priceFeedId = PYTH_PRICE_FEEDS[symbol.toUpperCase()];
        const url = `${this.HERMES_BASE_URL}/${timestamp}?ids[]=${priceFeedId}`;
        
        const response = await axios.get(url);
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          console.log(`Récupération réussie à la tentative ${attempt}`);
          const priceData = response.data[0];
          const price = priceData.price * Math.pow(10, priceData.expo);
          
          return {
            symbol,
            price,
            priceUsd: price,
            confidence: priceData.conf * Math.pow(10, priceData.expo),
            timestamp,
            publishTime: priceData.publishTime || timestamp,
            date: new Date(timestamp * 1000).toISOString(),
            source: 'pyth_retry',
            retryAttempt: attempt
          };
        }
        
        // Augmenter le délai pour la prochaine tentative (exponential backoff)
        delay *= 2;
      } catch (error) {
        console.error(`Échec de la tentative ${attempt}:`, error.message);
      }
    }
    
    console.log(`Toutes les tentatives ont échoué pour ${symbol}, recherche dans le cache local...`);
    
    // Tenter de trouver un prix approximatif dans le cache
    try {
      // Chercher un prix récent dans une fenêtre de 24 heures
      const timeWindowMs = 24 * 60 * 60 * 1000; // 24 heures
      const startTime = timestamp - timeWindowMs / 1000;
      const endTime = timestamp + timeWindowMs / 1000;
      
      // Chercher des clés de cache correspondantes
      const cachePrices = cacheService.getAllPrices(
        new RegExp(`pyth_historical_${symbol}_\\d+`)
      );
      
      if (cachePrices && Object.keys(cachePrices).length > 0) {
        // Trouver le prix le plus proche dans le temps
        let closestPrice = null;
        let minTimeDiff = Infinity;
        
        Object.values(cachePrices).forEach(priceItem => {
          if (priceItem.timestamp >= startTime && priceItem.timestamp <= endTime) {
            const timeDiff = Math.abs(priceItem.timestamp - timestamp);
            if (timeDiff < minTimeDiff) {
              minTimeDiff = timeDiff;
              closestPrice = priceItem;
            }
          }
        });
        
        if (closestPrice) {
          console.log(`Prix approximatif trouvé dans le cache pour ${symbol} (différence de ${minTimeDiff} secondes)`);
          return {
            ...closestPrice,
            source: 'pyth_cached_fallback',
            isApproximate: true,
            timeDiff: minTimeDiff
          };
        }
      }
    } catch (cacheError) {
      console.error(`Erreur lors de la recherche dans le cache:`, cacheError.message);
    }
    
    // Échec final, retourner null
    console.error(`Impossible d'obtenir le prix pour ${symbol} après plusieurs tentatives`);
    return null;
  },

  /**
   * Récupère le prix historique d'un token à un instant précis via son symbole
   * @param {string} symbol - Symbole du token (ex: 'SOL', 'BTC')
   * @param {number} timestamp - Timestamp Unix en secondes
   * @returns {Promise<Object|null>} - Données de prix ou null si non trouvé
   */
  getHistoricalPriceBySymbol: async function(symbol, timestamp) {
    try {
      if (!symbol) return null;
      
      const upperSymbol = symbol.toUpperCase();
      
      // Vérifier si le symbole est supporté
      if (!this.isSymbolSupported(upperSymbol)) {
        console.warn(`Symbole ${symbol} non supporté par Pyth Network`);
        return null;
      }
      
      // Récupérer l'ID de flux de prix Pyth
      const priceFeedId = PYTH_PRICE_FEEDS[upperSymbol];
      
      // Vérifier le cache
      const cacheKey = `pyth_historical_${upperSymbol}_${timestamp}`;
      const cachedPrice = cacheService.getPrice(cacheKey);
      
      if (cachedPrice) {
        console.log(`Utilisation du cache pour le prix Pyth de ${upperSymbol}`);
        return cachedPrice;
      }
      
      console.log(`Récupération du prix Pyth pour ${upperSymbol} au timestamp ${timestamp}`);
      
      // Construire l'URL de l'API Hermes
      const url = `${this.HERMES_BASE_URL}/${timestamp}?ids[]=${priceFeedId}`;
      
      console.log(`Requête Pyth API: ${url}`);
      const response = await axios.get(url);
      
      console.log(`Réponse Pyth API pour ${upperSymbol}:`, JSON.stringify(response.data).substring(0, 500));
      
      // Vérifier si la réponse contient des données
      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        console.warn(`Aucune donnée de prix retournée par Pyth pour ${upperSymbol}`);
        return await this.handlePriceError(upperSymbol, timestamp, new Error('Données manquantes'));
      }
      
      const priceData = response.data[0];
      
      // Vérifier si les données de prix sont valides
      if (!priceData.price && priceData.price !== 0) {
        console.warn(`Format de prix Pyth invalide pour ${upperSymbol} - prix manquant`);
        console.log('Données reçues:', JSON.stringify(priceData));
        return await this.handlePriceError(upperSymbol, timestamp, new Error('Prix manquant'));
      }
      
      // Vérifier si l'exposant est disponible
      if (priceData.expo === undefined) {
        console.warn(`Format de prix Pyth invalide pour ${upperSymbol} - exposant manquant`);
        console.log('Données reçues:', JSON.stringify(priceData));
        return await this.handlePriceError(upperSymbol, timestamp, new Error('Exposant manquant'));
      }
      
      // Calculer le prix en USD avec la précision correcte
      const price = priceData.price * Math.pow(10, priceData.expo);
      const confidence = priceData.conf ? priceData.conf * Math.pow(10, priceData.expo) : 0;
      const publishTime = priceData.publishTime || timestamp;
      
      // Créer l'objet de prix
      const priceResult = {
        symbol: upperSymbol,
        price,
        priceUsd: price,
        confidence,
        priceSol: upperSymbol === 'SOL' ? 1 : 0, // SOL/SOL = 1
        timestamp,
        publishTime,
        date: new Date(timestamp * 1000).toISOString(),
        source: 'pyth',
        rawData: priceData // Inclure les données brutes pour le débogage
      };
      
      // Mettre en cache le résultat
      cacheService.setPrice(cacheKey, priceResult, 86400 * 30); // Cache de 30 jours pour les prix historiques
      
      console.log(`Prix historique Pyth trouvé pour ${upperSymbol}: ${price} USD (confiance: ±${confidence})`);
      return priceResult;
    } catch (error) {
      console.error(`Erreur lors de la récupération du prix Pyth pour ${symbol}:`, error.message);
      if (error.response) {
        console.error(`Erreur API - Status: ${error.response.status}, Data:`, JSON.stringify(error.response.data).substring(0, 500));
      }
      // Utiliser la fonction de récupération d'erreur avec retentatives
      return await this.handlePriceError(symbol, timestamp, error);
    }
  },

  /**
   * Récupère le prix historique d'un token à un instant précis via son adresse mint
   * @param {string} tokenMint - Adresse du token
   * @param {number} timestamp - Timestamp Unix en secondes
   * @returns {Promise<Object|null>} - Données de prix ou null si non trouvé
   */
  getHistoricalPrice: async function(tokenMint, timestamp) {
    try {
      // Cas spécial pour SOL wrapped - traitement direct sans passer par Jupiter
      if (tokenMint && tokenMint.toLowerCase() === 'so11111111111111111111111111111111111111112') {
        console.log(`Token ${tokenMint} identifié comme SOL, traitement direct`);
        const priceData = await this.getHistoricalPriceBySymbol('SOL', timestamp);
        
        if (priceData) {
          // Ajouter l'adresse mint à l'objet de prix pour cohérence avec l'API
          return {
            ...priceData,
            mint: tokenMint,
            parsed: true
          };
        }
      } else {
        // Essayer de déterminer le symbole à partir de l'adresse mint
        console.log(`Recherche du symbole pour ${tokenMint}`);
        const symbol = await this.getSymbolFromMint(tokenMint);
        
        if (!symbol) {
          console.warn(`Impossible de déterminer le symbole pour ${tokenMint}, prix historique non disponible via Pyth`);
          return null;
        }
        
        console.log(`Symbole trouvé pour ${tokenMint}: ${symbol}`);
        
        // Utiliser le symbole pour récupérer le prix
        const priceData = await this.getHistoricalPriceBySymbol(symbol, timestamp);
        
        if (priceData) {
          // Ajouter l'adresse mint à l'objet de prix pour cohérence avec l'API
          return {
            ...priceData,
            mint: tokenMint,
            parsed: true
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Erreur lors de la récupération du prix Pyth pour ${tokenMint}:`, error.message);
      return null;
    }
  },

  /**
   * Récupère le prix historique pour plusieurs tokens à un instant précis (par symbole)
   * @param {Array<string>} symbols - Liste de symboles de tokens
   * @param {number} timestamp - Timestamp Unix en secondes
   * @returns {Promise<Object>} - Prix indexés par symbole
   */
  getBatchHistoricalPricesBySymbol: async function(symbols, timestamp) {
    try {
      if (!Array.isArray(symbols) || symbols.length === 0) {
        return {};
      }
      
      // Filtrer uniquement les symboles supportés
      const supportedSymbols = symbols
        .map(s => s.toUpperCase())
        .filter(s => this.isSymbolSupported(s));
      
      if (supportedSymbols.length === 0) {
        return {};
      }
      
      // Construire les identifiants pour la requête batch
      const feedIds = supportedSymbols.map(s => PYTH_PRICE_FEEDS[s]);
      
      // Construire l'URL avec tous les feedIds
      let url = `${this.HERMES_BASE_URL}/${timestamp}?`;
      feedIds.forEach(id => {
        url += `ids[]=${id}&`;
      });
      
      // Supprimer le dernier &
      url = url.slice(0, -1);
      
      const response = await axios.get(url);
      
      // Vérifier si la réponse contient des données
      if (!response.data || !Array.isArray(response.data)) {
        console.warn('Format de réponse batch Pyth invalide');
        return {};
      }
      
      // Mapper les résultats par symbole
      const results = {};
      
      response.data.forEach(priceData => {
        // Trouver le symbole correspondant à ce feedId
        const symbol = Object.keys(PYTH_PRICE_FEEDS).find(
          s => PYTH_PRICE_FEEDS[s] === priceData.id
        );
        
        if (symbol && priceData.price) {
          const price = priceData.price * Math.pow(10, priceData.expo);
          const confidence = priceData.conf * Math.pow(10, priceData.expo);
          
          results[symbol] = {
            symbol,
            price,
            priceUsd: price,
            confidence,
            priceSol: 0,
            timestamp,
            publishTime: priceData.publishTime,
            date: new Date(timestamp * 1000).toISOString(),
            source: 'pyth'
          };
          
          // Mettre en cache chaque résultat individuel
          const cacheKey = `pyth_historical_${symbol}_${timestamp}`;
          cacheService.setPrice(cacheKey, results[symbol], 86400 * 30);
        }
      });
      
      return results;
    } catch (error) {
      console.error(`Erreur lors de la récupération des prix Pyth par lot:`, error.message);
      return {};
    }
  },

  /**
   * Récupère le prix historique pour plusieurs tokens à un instant précis (par adresse mint)
   * @param {Array<string>} tokenMints - Liste d'adresses de tokens
   * @param {number} timestamp - Timestamp Unix en secondes
   * @returns {Promise<Object>} - Prix indexés par adresse de token
   */
  getBatchHistoricalPrices: async function(tokenMints, timestamp) {
    try {
      if (!Array.isArray(tokenMints) || tokenMints.length === 0) {
        return {};
      }
      
      // Convertir les adresses en symboles
      const mintToSymbol = {};
      const symbols = [];
      
      // Traiter les adresses par lots pour éviter trop de promesses en parallèle
      const batchSize = 5;
      
      for (let i = 0; i < tokenMints.length; i += batchSize) {
        const batch = tokenMints.slice(i, i + batchSize);
        const symbolPromises = batch.map(async (mint) => {
          const symbol = await this.getSymbolFromMint(mint);
          if (symbol) {
            mintToSymbol[mint] = symbol;
            symbols.push(symbol);
          }
          return { mint, symbol };
        });
        
        await Promise.all(symbolPromises);
      }
      
      if (symbols.length === 0) {
        return {};
      }
      
      // Obtenir les prix par symbole
      const symbolPrices = await this.getBatchHistoricalPricesBySymbol(symbols, timestamp);
      
      // Mapper les résultats par adresse de token
      const results = {};
      
      for (const [mint, symbol] of Object.entries(mintToSymbol)) {
        if (symbolPrices[symbol]) {
          results[mint] = {
            ...symbolPrices[symbol],
            mint
          };
        }
      }
      
      return results;
    } catch (error) {
      console.error(`Erreur lors de la récupération des prix Pyth par lot:`, error.message);
      return {};
    }
  },

  /**
   * Récupère l'identifiant de flux de prix Pyth pour un symbole
   * @param {string} symbol - Symbole du token
   * @returns {string|null} - Identifiant du flux de prix ou null si non supporté
   */
  getPriceFeedId: function(symbol) {
    if (!symbol) return null;
    return PYTH_PRICE_FEEDS[symbol.toUpperCase()] || null;
  },

  /**
   * Récupère l'identifiant de flux de prix Pyth pour une adresse de token
   * @param {string} tokenMint - Adresse du token
   * @returns {Promise<string|null>} - Identifiant du flux de prix ou null si non supporté
   */
  async getPriceFeedIdFromMint(tokenMint) {
    const symbol = await this.getSymbolFromMint(tokenMint);
    return symbol ? this.getPriceFeedId(symbol) : null;
  },

  /**
   * Récupère le symbole d'un token à partir de son adresse
   * @param {string} tokenMint - Adresse du token
   * @returns {Promise<string|null>} - Symbole du token ou null si non supporté
   */
  getTokenSymbol: function(tokenMint) {
    return this.getSymbolFromMint(tokenMint);
  },

  /**
   * Récupère les prix approximatifs des tokens spam si disponibles
   * @param {string} tokenMint - Adresse du token
   * @param {number} timestamp - Timestamp Unix en secondes
   * @returns {Promise<Object|null>} - Données de prix ou null si non trouvé
   */
  async getSpamTokenPrice(tokenMint, timestamp) {
    // Pour les tokens de spam, on retourne un prix minimal symbolique
    if (this.isKnownSpamAddress(tokenMint)) {
      return {
        mint: tokenMint,
        symbol: 'SPAM',
        price: 0.000001,
        priceUsd: 0.000001,
        priceSol: 0.0000001,
        confidence: 0,
        timestamp,
        date: new Date(timestamp * 1000).toISOString(),
        source: 'spam_detection',
        isSpam: true
      };
    }
    return null;
  }
};

module.exports = pythService;