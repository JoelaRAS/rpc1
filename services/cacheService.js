const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');

// Configuration du cache
const CACHE_DIR = path.join(__dirname, '../data/cache');
const PRICE_CACHE_FILE = path.join(CACHE_DIR, 'price-cache.json');
const TOKEN_METADATA_CACHE_FILE = path.join(CACHE_DIR, 'token-metadata-cache.json');
const NFT_CACHE_FILE = path.join(CACHE_DIR, 'nft-cache.json');

// Durées de vie du cache (en millisecondes)
const CACHE_TTL = {
  PRICES: 15 * 60 * 1000, // 15 minutes pour les prix
  TOKEN_METADATA: 24 * 60 * 60 * 1000, // 24 heures pour les métadonnées
  NFT_METADATA: 12 * 60 * 60 * 1000, // 12 heures pour les NFT
  WALLET_DATA: 5 * 60 * 1000 // 5 minutes pour les données de portefeuille
};

// S'assurer que le répertoire de cache existe
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Charge les données du cache depuis un fichier
 * @param {string} cacheFile - Le chemin du fichier de cache
 * @returns {Object} Les données du cache ou un objet vide
 */
function loadCache(cacheFile) {
  try {
    if (fs.existsSync(cacheFile)) {
      const cacheData = fs.readFileSync(cacheFile, 'utf8');
      return JSON.parse(cacheData);
    }
  } catch (error) {
    console.error(`Erreur lors du chargement du cache ${cacheFile}:`, error.message);
  }
  return {};
}

/**
 * Sauvegarde les données dans le fichier de cache
 * @param {string} cacheFile - Le chemin du fichier de cache
 * @param {Object} data - Les données à sauvegarder
 */
function saveCache(cacheFile, data) {
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Erreur lors de la sauvegarde du cache ${cacheFile}:`, error.message);
  }
}

// Cache en mémoire pour les données fréquemment consultées
const memoryCache = {
  prices: new Map(),
  tokenMetadata: new Map(),
  nftMetadata: new Map(),
  walletData: new Map()
};

/**
 * Vérifie si une entrée de cache est expirée
 * @param {Object} cacheEntry - L'entrée de cache
 * @param {number} ttl - Durée de vie en millisecondes
 * @returns {boolean} True si l'entrée est expirée
 */
function isExpired(cacheEntry, ttl) {
  if (!cacheEntry || !cacheEntry.timestamp) return true;
  return (Date.now() - cacheEntry.timestamp) > ttl;
}

// Liste des tokens populaires à précharger
const POPULAR_TOKENS = [
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  // Ajoutez d'autres tokens populaires selon vos besoins
];

/**
 * Précharge les prix des tokens populaires
 * @returns {Promise<void>}
 */
async function prefetchPopularTokens() {
  console.log('Préchargement des tokens populaires...');
  const priceService = require('./priceService');
  
  try {
    // Utiliser getCurrentPrice pour chaque token au lieu de getBatchTokenPrices
    const promises = POPULAR_TOKENS.map(tokenMint => 
      priceService.getCurrentPrice(tokenMint)
        .catch(error => {
          console.warn(`Échec du préchargement du prix pour ${tokenMint}:`, error.message);
          return null;
        })
    );
    
    const results = await Promise.all(promises);
    const validResults = results.filter(result => result !== null);
    console.log(`Préchargement terminé avec succès: ${validResults.length}/${POPULAR_TOKENS.length} tokens`);
  } catch (error) {
    console.error('Erreur lors du préchargement des tokens:', error.message);
  }
}

// Préchargement au démarrage
setTimeout(prefetchPopularTokens, 1000);

// Préchargement périodique (toutes les 10 minutes)
setInterval(prefetchPopularTokens, 10 * 60 * 1000);

// Service de cache
const cacheService = {
  /**
   * Charge le cache de prix au démarrage
   */
  initializePriceCache: function() {
    try {
      const priceCache = loadCache(PRICE_CACHE_FILE);
      Object.keys(priceCache).forEach(key => {
        memoryCache.prices.set(key, priceCache[key]);
      });
      console.log(`Cache de prix chargé: ${memoryCache.prices.size} entrées`);
    } catch (err) {
      console.error('Erreur lors de l\'initialisation du cache de prix:', err);
    }
  },
  
  /**
   * Charge le cache de métadonnées de tokens au démarrage
   */
  initializeTokenMetadataCache: function() {
    try {
      const metadataCache = loadCache(TOKEN_METADATA_CACHE_FILE);
      Object.keys(metadataCache).forEach(key => {
        memoryCache.tokenMetadata.set(key, metadataCache[key]);
      });
      console.log(`Cache de métadonnées de tokens chargé: ${memoryCache.tokenMetadata.size} entrées`);
    } catch (err) {
      console.error('Erreur lors de l\'initialisation du cache de métadonnées:', err);
    }
  },
  
  /**
   * Charge le cache de NFT au démarrage
   */
  initializeNFTCache: function() {
    try {
      const nftCache = loadCache(NFT_CACHE_FILE);
      Object.keys(nftCache).forEach(key => {
        memoryCache.nftMetadata.set(key, nftCache[key]);
      });
      console.log(`Cache de NFT chargé: ${memoryCache.nftMetadata.size} entrées`);
    } catch (err) {
      console.error('Erreur lors de l\'initialisation du cache de NFT:', err);
    }
  },

  /**
   * Initialise tous les caches
   */
  initializeAllCaches: function() {
    this.initializePriceCache();
    this.initializeTokenMetadataCache();
    this.initializeNFTCache();
  },

  /**
   * Obtient le prix d'un token depuis le cache
   * @param {string} tokenId - L'identifiant du token
   * @returns {Object|null} Les données du prix ou null
   */
  getPrice: function(tokenId) {
    const cacheEntry = memoryCache.prices.get(tokenId);
    if (cacheEntry && !isExpired(cacheEntry, CACHE_TTL.PRICES)) {
      return cacheEntry.data;
    }
    return null;
  },
  
  /**
   * Définit le prix d'un token dans le cache
   * @param {string} tokenId - L'identifiant du token
   * @param {Object} priceData - Les données du prix
   */
  setPrice: function(tokenId, priceData) {
    const cacheEntry = {
      timestamp: Date.now(),
      data: priceData
    };
    memoryCache.prices.set(tokenId, cacheEntry);
    
    // Sauvegarde périodique du cache de prix
    const priceCache = {};
    memoryCache.prices.forEach((value, key) => {
      priceCache[key] = value;
    });
    saveCache(PRICE_CACHE_FILE, priceCache);
  },
  
  /**
   * Obtient les métadonnées d'un token depuis le cache
   * @param {string} tokenMint - L'adresse mint du token
   * @returns {Object|null} Les métadonnées du token ou null
   */
  getTokenMetadata: function(tokenMint) {
    const cacheEntry = memoryCache.tokenMetadata.get(tokenMint);
    if (cacheEntry && !isExpired(cacheEntry, CACHE_TTL.TOKEN_METADATA)) {
      return cacheEntry.data;
    }
    return null;
  },
  
  /**
   * Définit les métadonnées d'un token dans le cache
   * @param {string} tokenMint - L'adresse mint du token
   * @param {Object} metadata - Les métadonnées du token
   */
  setTokenMetadata: function(tokenMint, metadata) {
    const cacheEntry = {
      timestamp: Date.now(),
      data: metadata
    };
    memoryCache.tokenMetadata.set(tokenMint, cacheEntry);
    
    // Sauvegarde périodique du cache de métadonnées
    if (memoryCache.tokenMetadata.size % 10 === 0) { // Toutes les 10 entrées
      const metadataCache = {};
      memoryCache.tokenMetadata.forEach((value, key) => {
        metadataCache[key] = value;
      });
      saveCache(TOKEN_METADATA_CACHE_FILE, metadataCache);
    }
  },
  
  /**
   * Obtient les métadonnées d'un NFT depuis le cache
   * @param {string} nftMint - L'adresse mint du NFT
   * @returns {Object|null} Les métadonnées du NFT ou null
   */
  getNFTMetadata: function(nftMint) {
    const cacheEntry = memoryCache.nftMetadata.get(nftMint);
    if (cacheEntry && !isExpired(cacheEntry, CACHE_TTL.NFT_METADATA)) {
      return cacheEntry.data;
    }
    return null;
  },
  
  /**
   * Définit les métadonnées d'un NFT dans le cache
   * @param {string} nftMint - L'adresse mint du NFT
   * @param {Object} metadata - Les métadonnées du NFT
   */
  setNFTMetadata: function(nftMint, metadata) {
    const cacheEntry = {
      timestamp: Date.now(),
      data: metadata
    };
    memoryCache.nftMetadata.set(nftMint, cacheEntry);
    
    // Sauvegarde périodique du cache de NFT
    if (memoryCache.nftMetadata.size % 5 === 0) { // Toutes les 5 entrées
      const nftCache = {};
      memoryCache.nftMetadata.forEach((value, key) => {
        nftCache[key] = value;
      });
      saveCache(NFT_CACHE_FILE, nftCache);
    }
  },
  
  /**
   * Obtient les données d'un portefeuille depuis le cache en mémoire
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Object|null} Les données du portefeuille ou null
   */
  getWalletData: function(walletAddress) {
    const cacheEntry = memoryCache.walletData.get(walletAddress);
    if (cacheEntry && !isExpired(cacheEntry, CACHE_TTL.WALLET_DATA)) {
      return cacheEntry.data;
    }
    return null;
  },
  
  /**
   * Définit les données d'un portefeuille dans le cache en mémoire
   * @param {string} walletAddress - L'adresse du portefeuille
   * @param {Object} walletData - Les données du portefeuille
   */
  setWalletData: function(walletAddress, walletData) {
    memoryCache.walletData.set(walletAddress, {
      timestamp: Date.now(),
      data: walletData
    });
  },
  
  /**
   * Nettoie les entrées expirées du cache en mémoire
   */
  cleanupCache: function() {
    // Nettoyage du cache de prix
    memoryCache.prices.forEach((value, key) => {
      if (isExpired(value, CACHE_TTL.PRICES)) {
        memoryCache.prices.delete(key);
      }
    });
    
    // Nettoyage du cache de métadonnées
    memoryCache.tokenMetadata.forEach((value, key) => {
      if (isExpired(value, CACHE_TTL.TOKEN_METADATA)) {
        memoryCache.tokenMetadata.delete(key);
      }
    });
    
    // Nettoyage du cache de NFT
    memoryCache.nftMetadata.forEach((value, key) => {
      if (isExpired(value, CACHE_TTL.NFT_METADATA)) {
        memoryCache.nftMetadata.delete(key);
      }
    });
    
    // Nettoyage du cache de portefeuilles
    memoryCache.walletData.forEach((value, key) => {
      if (isExpired(value, CACHE_TTL.WALLET_DATA)) {
        memoryCache.walletData.delete(key);
      }
    });
  }
};

// Nettoyer le cache toutes les 30 minutes
setInterval(() => {
  cacheService.cleanupCache();
  console.log('Nettoyage du cache effectué');
}, 30 * 60 * 1000);

module.exports = cacheService;