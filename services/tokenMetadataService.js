const axios = require('axios');
const birdeyeService = require('./birdeyeService');
const jupiterService = require('./jupiterService');

/**
 * Service spécialisé dans la gestion des métadonnées de tokens selon le modèle du projet portfolio
 */
class TokenMetadataService {
  constructor() {
    // Cache pour les métadonnées de tokens
    this.tokenMetadataCache = new Map();
    // TTL du cache en milliseconds (24h)
    this.cacheTTL = 24 * 60 * 60 * 1000;
    // Token lists connus
    this.tokenLists = [
      'https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json',
      'https://raw.githubusercontent.com/solflare-wallet/token-list/master/solana-tokenlist.json'
    ];
    // Map des tokens indexés par réseau et adresse
    this.tokenInfoByNetworkAndAddress = new Map();
    // Si les listes de tokens ont été chargées
    this.tokenListsLoaded = false;
  }
  
  /**
   * Initialise le service en chargeant les listes de tokens
   */
  async init() {
    if (!this.tokenListsLoaded) {
      await this.loadTokenLists();
      this.tokenListsLoaded = true;
    }
  }
  
  /**
   * Charge les listes de tokens depuis plusieurs sources
   */
  async loadTokenLists() {
    try {
      console.log('TokenMetadataService: Chargement des listes de tokens...');
      
      const promises = this.tokenLists.map(url => 
        axios.get(url)
          .then(res => res.data)
          .catch(err => {
            console.warn(`TokenMetadataService: Erreur lors du chargement de la liste de tokens ${url}: ${err.message}`);
            return { tokens: [] };
          })
      );
      
      const results = await Promise.all(promises);
      
      // Combiner toutes les listes de tokens
      const allTokens = results.reduce((acc, result) => {
        if (result && result.tokens && Array.isArray(result.tokens)) {
          return [...acc, ...result.tokens];
        }
        return acc;
      }, []);
      
      // Indexer les tokens par réseau et adresse
      allTokens.forEach(tokenInfo => {
        // Convertir chainId en networkId pour suivre le format du projet portfolio
        const networkId = this._chainIdToNetworkId(tokenInfo.chainId);
        
        if (!this.tokenInfoByNetworkAndAddress.has(networkId)) {
          this.tokenInfoByNetworkAndAddress.set(networkId, new Map());
        }
        
        const networkTokens = this.tokenInfoByNetworkAndAddress.get(networkId);
        networkTokens.set(tokenInfo.address.toLowerCase(), {
          networkId,
          address: tokenInfo.address,
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          decimals: tokenInfo.decimals,
          logoURI: tokenInfo.logoURI,
          tags: tokenInfo.tags || [],
          extensions: tokenInfo.extensions || {}
        });
      });
      
      console.log(`TokenMetadataService: ${allTokens.length} tokens chargés depuis les listes`);
    } catch (error) {
      console.error(`TokenMetadataService: Erreur lors du chargement des listes de tokens: ${error.message}`);
    }
  }
  
  /**
   * Convertit un chainId en networkId (format du projet portfolio)
   * @private
   * @param {number} chainId - L'ID de la chaîne
   * @returns {string} - L'ID du réseau
   */
  _chainIdToNetworkId(chainId) {
    // Pour Solana
    if (chainId === 101) {
      return 'solana';
    }
    
    // Pour d'autres réseaux, si nécessaire
    return `chain-${chainId}`;
  }
  
  /**
   * Récupère les métadonnées d'un token
   * @param {string} tokenAddress - Adresse du token
   * @param {string} networkId - ID du réseau (par défaut "solana")
   * @returns {Promise<Object>} - Métadonnées du token
   */
  async getTokenMetadata(tokenAddress, networkId = 'solana') {
    if (!tokenAddress) {
      return null;
    }
    
    // Normaliser l'adresse du token
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Vérifier le cache d'abord
    const cacheKey = `${networkId}-${normalizedAddress}`;
    const cachedMetadata = this.tokenMetadataCache.get(cacheKey);
    
    if (cachedMetadata && (Date.now() - cachedMetadata.timestamp) < this.cacheTTL) {
      return cachedMetadata.data;
    }
    
    // Initialiser les listes de tokens si pas encore fait
    if (!this.tokenListsLoaded) {
      await this.init();
    }
    
    // Essayer de trouver dans les listes de tokens préchargées
    if (this.tokenInfoByNetworkAndAddress.has(networkId)) {
      const networkTokens = this.tokenInfoByNetworkAndAddress.get(networkId);
      if (networkTokens.has(normalizedAddress)) {
        const tokenInfo = networkTokens.get(normalizedAddress);
        
        // Mettre à jour le cache
        this.tokenMetadataCache.set(cacheKey, {
          data: tokenInfo,
          timestamp: Date.now()
        });
        
        return tokenInfo;
      }
    }
    
    // Si non trouvé dans les listes préconfigurées, essayer via Birdeye
    try {
      const birdeyeMetadata = await birdeyeService.getTokenMetadata(tokenAddress);
      
      if (birdeyeMetadata && birdeyeMetadata.data) {
        const tokenInfo = {
          networkId,
          address: tokenAddress,
          name: birdeyeMetadata.data.name || 'Unknown Token',
          symbol: birdeyeMetadata.data.symbol || 'UNKNOWN',
          decimals: birdeyeMetadata.data.decimals || 0,
          logoURI: birdeyeMetadata.data.logoURI || null,
          tags: []
        };
        
        // Mettre à jour le cache
        this.tokenMetadataCache.set(cacheKey, {
          data: tokenInfo,
          timestamp: Date.now()
        });
        
        return tokenInfo;
      }
    } catch (error) {
      console.warn(`TokenMetadataService: Erreur Birdeye pour ${tokenAddress}: ${error.message}`);
    }
    
    // Si toujours pas trouvé, essayer via Jupiter
    try {
      const jupiterTokenInfo = await jupiterService.getTokenInfo(tokenAddress);
      
      if (jupiterTokenInfo) {
        const tokenInfo = {
          networkId,
          address: tokenAddress,
          name: jupiterTokenInfo.name || 'Unknown Token',
          symbol: jupiterTokenInfo.symbol || 'UNKNOWN',
          decimals: jupiterTokenInfo.decimals || 0,
          logoURI: jupiterTokenInfo.logoURI || null,
          tags: []
        };
        
        // Mettre à jour le cache
        this.tokenMetadataCache.set(cacheKey, {
          data: tokenInfo,
          timestamp: Date.now()
        });
        
        return tokenInfo;
      }
    } catch (error) {
      console.warn(`TokenMetadataService: Erreur Jupiter pour ${tokenAddress}: ${error.message}`);
    }
    
    // En dernier recours, retourner des informations minimales
    const minimalTokenInfo = {
      networkId,
      address: tokenAddress,
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      decimals: 9,  // Valeur par défaut pour Solana
      logoURI: null,
      tags: []
    };
    
    // Ne pas mettre en cache les infos minimales pour permettre des tentatives futures
    
    return minimalTokenInfo;
  }
  
  /**
   * Récupère les métadonnées pour plusieurs tokens en parallèle
   * @param {string[]} tokenAddresses - Liste d'adresses de tokens
   * @param {string} networkId - ID du réseau (par défaut "solana")
   * @returns {Promise<Object>} - Map des métadonnées par adresse de token
   */
  async getMultipleTokenMetadata(tokenAddresses, networkId = 'solana') {
    if (!Array.isArray(tokenAddresses) || tokenAddresses.length === 0) {
      return {};
    }
    
    // Initialiser les listes de tokens si pas encore fait
    if (!this.tokenListsLoaded) {
      await this.init();
    }
    
    // Traitement par lots pour éviter de surcharger les APIs
    const batchSize = 10;
    const result = {};
    
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      
      // Récupérer les métadonnées en parallèle
      const promises = batch.map(address => this.getTokenMetadata(address, networkId));
      const metadataResults = await Promise.all(promises);
      
      // Ajouter les résultats au map final
      batch.forEach((address, index) => {
        if (metadataResults[index]) {
          result[address] = metadataResults[index];
        }
      });
    }
    
    return result;
  }
  
  /**
   * Vide le cache des métadonnées
   */
  clearCache() {
    this.tokenMetadataCache.clear();
    console.log('TokenMetadataService: Cache vidé');
  }
}

module.exports = new TokenMetadataService();