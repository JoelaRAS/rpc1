const axios = require('axios');
const birdeyeService = require('./birdeyeService');
const coinGeckoService = require('./coinGeckoService');
const cryptoCompareService = require('./cryptoCompareService');
const jupiterService = require('./jupiterService');

// Cache en mémoire pour les prix (structure simplifiée)
const priceCache = {
  historical: new Map(), // Map(token-timestamp -> price)
  tokenIds: new Map(),   // Map(tokenAddress -> {coingeckoId, symbol, name})
  current: new Map(),    // Map(tokenAddress -> currentPrice)
  // TTL 5 minutes pour les prix actuels, 1 jour pour les données historiques
  ttl: {
    current: 5 * 60 * 1000,
    historical: 24 * 60 * 60 * 1000
  }
};

// Configuration - tokens populaires sur Solana
const POPULAR_TOKENS = {
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Wrapped SOL', coingeckoId: 'solana' },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin', coingeckoId: 'usd-coin' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether', coingeckoId: 'tether' },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk', coingeckoId: 'bonk' },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { symbol: 'mSOL', name: 'Marinade Staked SOL', coingeckoId: 'msol' }
};

class PriceService {
  /**
   * Récupère l'historique des prix pour un token à un timestamp donné
   * @param {string} tokenAddress - Adresse du token
   * @param {number} timestamp - Timestamp unix en secondes
   * @returns {Promise<Object>} - Données de prix historique avec méta-informations
   */
  async getHistoricalPrice(tokenAddress, timestamp) {
    console.log(`PriceService: Récupération du prix historique pour ${tokenAddress} à ${new Date(timestamp * 1000).toISOString()}`);
    
    // Vérifier le cache d'abord
    const cacheKey = `${tokenAddress}-${timestamp}`;
    const cachedPrice = priceCache.historical.get(cacheKey);
    
    if (cachedPrice && (Date.now() - cachedPrice.lastUpdated) < priceCache.ttl.historical) {
      console.log(`PriceService: Prix trouvé en cache pour ${tokenAddress}`);
      return cachedPrice;
    }
    
    // Récupérer les métadonnées du token si non disponibles
    let tokenInfo = priceCache.tokenIds.get(tokenAddress);
    
    if (!tokenInfo) {
      tokenInfo = await this.getTokenInfo(tokenAddress);
      
      // Si on n'a pas pu récupérer les infos, vérifier si c'est un token populaire connu
      if (!tokenInfo && POPULAR_TOKENS[tokenAddress]) {
        tokenInfo = POPULAR_TOKENS[tokenAddress];
        priceCache.tokenIds.set(tokenAddress, tokenInfo);
      }
      
      // Si on a toujours pas d'info, on ne peut pas récupérer l'historique
      if (!tokenInfo) {
        console.warn(`PriceService: Impossible de récupérer les métadonnées pour ${tokenAddress}`);
        return null;
      }
    }
    
    // Stratégie: essayer plusieurs sources en séquence
    let priceData = null;
    let source = null;
    
    // 1. Essayer via Birdeye (meilleure source pour l'historique récent)
    try {
      console.log(`PriceService: Essai via Birdeye pour ${tokenInfo.symbol}`);
      const timestampMs = timestamp * 1000; // Convertir en millisecondes
      const oneDayBefore = timestampMs - 12 * 60 * 60 * 1000; // 12h avant
      const oneDayAfter = timestampMs + 12 * 60 * 60 * 1000;  // 12h après
      
      const response = await birdeyeService.getTokenPriceHistory(
        tokenAddress,
        oneDayBefore,
        oneDayAfter,
        '15m' // Résolution de 15 minutes
      );
      
      if (response?.data?.length > 0) {
        // Trouver le prix le plus proche du timestamp
        const prices = response.data;
        let closestPrice = prices[0];
        let minDiff = Math.abs(timestampMs - prices[0].unixTime);
        
        for (let i = 1; i < prices.length; i++) {
          const diff = Math.abs(timestampMs - prices[i].unixTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestPrice = prices[i];
          }
        }
        
        priceData = {
          price: closestPrice.value,
          timestamp: closestPrice.unixTime / 1000, // Convertir en secondes
          timeDifference: Math.round(minDiff / 1000 / 60), // Différence en minutes
          confidence: minDiff < 60 * 60 * 1000 ? 'high' : 'medium' // Confiance élevée si < 1h de différence
        };
        source = 'birdeye';
      }
    } catch (error) {
      console.warn(`PriceService: Erreur Birdeye pour ${tokenAddress}: ${error.message}`);
    }
    
    // 2. Si pas trouvé via Birdeye, essayer via CoinGecko
    if (!priceData && tokenInfo.coingeckoId) {
      try {
        console.log(`PriceService: Essai via CoinGecko pour ${tokenInfo.coingeckoId}`);
        const response = await coinGeckoService.getPriceAtTimestamp(
          tokenInfo.coingeckoId,
          timestamp
        );
        
        if (response?.market_data?.current_price?.usd) {
          priceData = {
            price: response.market_data.current_price.usd,
            timestamp: timestamp,
            timeDifference: 0,
            confidence: 'high'
          };
          source = 'coingecko';
        }
      } catch (error) {
        console.warn(`PriceService: Erreur CoinGecko pour ${tokenAddress}: ${error.message}`);
      }
    }
    
    // 3. Si toujours pas trouvé et token populaire, essayer CryptoCompare
    if (!priceData && tokenInfo.symbol) {
      try {
        console.log(`PriceService: Essai via CryptoCompare pour ${tokenInfo.symbol}`);
        const response = await cryptoCompareService.getPriceAtTimestamp(
          tokenInfo.symbol,
          timestamp
        );
        
        if (response?.USD) {
          priceData = {
            price: response.USD,
            timestamp: timestamp,
            timeDifference: 0,
            confidence: 'medium'
          };
          source = 'cryptocompare';
        }
      } catch (error) {
        console.warn(`PriceService: Erreur CryptoCompare pour ${tokenAddress}: ${error.message}`);
      }
    }
    
    // 4. Dernier recours - essayer Jupiter pour le prix actuel
    if (!priceData && tokenInfo.symbol) {
      try {
        console.log(`PriceService: Essai via Jupiter (prix actuel) pour ${tokenInfo.symbol}`);
        const result = await this.getCurrentPrice(tokenAddress);
        
        if (result?.price) {
          priceData = {
            price: result.price,
            timestamp: Math.floor(Date.now() / 1000),
            timeDifference: Math.floor((Date.now() / 1000) - timestamp) / 60, // Minutes de différence
            confidence: 'low',
            warning: 'Prix actuel, non historique'
          };
          source = 'jupiter_current';
        }
      } catch (error) {
        console.warn(`PriceService: Erreur Jupiter pour ${tokenAddress}: ${error.message}`);
      }
    }
    
    // Si on a trouvé un prix, l'ajouter au cache
    if (priceData) {
      const result = {
        address: tokenAddress,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        price: priceData.price,
        timestamp: priceData.timestamp,
        timeDifference: priceData.timeDifference,
        confidence: priceData.confidence,
        warning: priceData.warning,
        source,
        lastUpdated: Date.now()
      };
      
      priceCache.historical.set(cacheKey, result);
      return result;
    }
    
    return null;
  }
  
  /**
   * Récupère le prix actuel d'un token
   * @param {string} tokenAddress - Adresse du token
   * @returns {Promise<Object>} - Données de prix actuel
   */
  async getCurrentPrice(tokenAddress) {
    // Vérifier le cache d'abord
    const cachedPrice = priceCache.current.get(tokenAddress);
    
    if (cachedPrice && (Date.now() - cachedPrice.lastUpdated) < priceCache.ttl.current) {
      return cachedPrice;
    }
    
    let price = null;
    let source = null;
    
    // 1. Essayer via Birdeye (souvent le plus à jour)
    try {
      const tokenInfo = await birdeyeService.getTokenMetadata(tokenAddress);
      
      if (tokenInfo?.data?.price) {
        price = tokenInfo.data.price;
        source = 'birdeye';
      }
    } catch (error) {
      console.warn(`PriceService: Erreur Birdeye pour prix actuel de ${tokenAddress}: ${error.message}`);
    }
    
    // 2. Si pas trouvé via Birdeye, essayer via Jupiter
    if (!price) {
      try {
        // Utiliser SOL comme référence
        const solMint = 'So11111111111111111111111111111111111111112';
        
        const jupiterPrice = await jupiterService.getPrice(tokenAddress, solMint);
        
        if (jupiterPrice?.price) {
          // Récupérer le prix actuel de SOL pour convertir
          const solPrice = await this.getCurrentPrice(solMint);
          
          if (solPrice?.price) {
            // Convertir le prix relatif en USD
            price = jupiterPrice.price * solPrice.price;
            source = 'jupiter';
          }
        }
      } catch (error) {
        console.warn(`PriceService: Erreur Jupiter pour prix actuel de ${tokenAddress}: ${error.message}`);
      }
    }
    
    // 3. Si toujours pas trouvé, essayer via CoinGecko
    if (!price) {
      try {
        // Récupérer d'abord l'ID CoinGecko
        const tokenInfo = priceCache.tokenIds.get(tokenAddress) || 
                          POPULAR_TOKENS[tokenAddress] || 
                          await this.getTokenInfo(tokenAddress);
        
        if (tokenInfo?.coingeckoId) {
          const response = await coinGeckoService.getPrice(tokenInfo.coingeckoId, 'usd');
          
          if (response?.[tokenInfo.coingeckoId]?.usd) {
            price = response[tokenInfo.coingeckoId].usd;
            source = 'coingecko';
          }
        }
      } catch (error) {
        console.warn(`PriceService: Erreur CoinGecko pour prix actuel de ${tokenAddress}: ${error.message}`);
      }
    }
    
    if (price) {
      const result = {
        address: tokenAddress,
        price,
        source,
        lastUpdated: Date.now()
      };
      
      priceCache.current.set(tokenAddress, result);
      return result;
    }
    
    return null;
  }
  
  /**
   * Récupère les informations d'un token
   * @param {string} tokenAddress - Adresse du token
   * @returns {Promise<Object>} - Informations du token
   */
  async getTokenInfo(tokenAddress) {
    // Vérifier le cache d'abord
    const cachedInfo = priceCache.tokenIds.get(tokenAddress);
    
    if (cachedInfo) {
      return cachedInfo;
    }
    
    let tokenInfo = null;
    
    // 1. Essayer via Birdeye
    try {
      const response = await birdeyeService.getTokenMetadata(tokenAddress);
      
      if (response?.data) {
        tokenInfo = {
          symbol: response.data.symbol,
          name: response.data.name,
          decimals: response.data.decimals,
          coingeckoId: response.data.coingeckoId,
          logoURI: response.data.logoURI
        };
      }
    } catch (error) {
      console.warn(`PriceService: Erreur Birdeye pour métadonnées de ${tokenAddress}: ${error.message}`);
    }
    
    // 2. Si pas trouvé ou pas de coingeckoId, essayer de le trouver via Jupiter
    if (!tokenInfo || !tokenInfo.coingeckoId) {
      try {
        // Récupérer la liste des tokens supportés par Jupiter
        const tokens = await jupiterService.getSupportedTokens();
        
        const jupiterToken = tokens.find(t => t.address === tokenAddress);
        
        if (jupiterToken) {
          tokenInfo = tokenInfo || {};
          tokenInfo.symbol = tokenInfo.symbol || jupiterToken.symbol;
          tokenInfo.name = tokenInfo.name || jupiterToken.name;
          tokenInfo.decimals = tokenInfo.decimals || jupiterToken.decimals;
          tokenInfo.logoURI = tokenInfo.logoURI || jupiterToken.logoURI;
          
          // Si on n'a toujours pas de coingeckoId, essayer de le trouver via recherche
          if (!tokenInfo.coingeckoId && tokenInfo.symbol) {
            const searchResult = await coinGeckoService.searchToken(tokenInfo.symbol);
            
            if (searchResult?.coins?.length > 0) {
              // Essayer de trouver une correspondance exacte
              const match = searchResult.coins.find(c => 
                c.symbol.toLowerCase() === tokenInfo.symbol.toLowerCase()
              );
              
              if (match) {
                tokenInfo.coingeckoId = match.id;
                tokenInfo.coingeckoSymbol = match.symbol;
                tokenInfo.coingeckoName = match.name;
              }
            }
          }
        }
      } catch (error) {
        console.warn(`PriceService: Erreur Jupiter pour métadonnées de ${tokenAddress}: ${error.message}`);
      }
    }
    
    if (tokenInfo) {
      priceCache.tokenIds.set(tokenAddress, tokenInfo);
    }
    
    return tokenInfo;
  }
  
  /**
   * Récupère les prix historiques pour plusieurs tokens à un timestamp donné
   * @param {Array<string>} tokenAddresses - Liste d'adresses de tokens
   * @param {number} timestamp - Timestamp unix en secondes
   * @returns {Promise<Object>} - Map des prix par adresse de token
   */
  async getHistoricalPricesForTokens(tokenAddresses, timestamp) {
    console.log(`PriceService: Récupération des prix pour ${tokenAddresses.length} tokens à ${new Date(timestamp * 1000).toISOString()}`);
    
    const results = {};
    
    // Traiter jusqu'à 3 tokens en parallèle pour éviter de surcharger les APIs
    const concurrencyLimit = 3;
    const chunks = [];
    
    for (let i = 0; i < tokenAddresses.length; i += concurrencyLimit) {
      chunks.push(tokenAddresses.slice(i, i + concurrencyLimit));
    }
    
    for (const chunk of chunks) {
      const promises = chunk.map(address => this.getHistoricalPrice(address, timestamp));
      const chunkResults = await Promise.all(promises);
      
      chunkResults.forEach((result, index) => {
        if (result) {
          results[chunk[index]] = result;
        }
      });
    }
    
    return results;
  }
}

module.exports = new PriceService();