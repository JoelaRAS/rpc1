const axios = require('axios');

class CoinGeckoService {
  constructor() {
    this.apiKey = process.env.COINGECKO_API_KEY || null;
    this.baseURL = this.apiKey 
      ? 'https://pro-api.coingecko.com/api/v3' 
      : 'https://api.coingecko.com/api/v3';
    
    // Table de correspondance pour les adresses de tokens Solana vers les ID CoinGecko
    this.tokenAddressToId = {
      'So11111111111111111111111111111111111111112': 'solana', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'usd-coin', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'tether', // USDT
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'msol', // mSOL
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'bonk' // BONK
    };
  }

  /**
   * Récupère le prix d'un token
   * @param {string} id - ID CoinGecko du token
   * @param {string} currency - Devise (ex: usd, eur)
   * @returns {Promise<Object>} - Données de prix du token
   */
  async getPrice(id, currency = 'usd') {
    try {
      const params = {
        ids: id,
        vs_currencies: currency,
        include_24hr_change: true
      };
      
      const headers = {};
      if (this.apiKey) {
        headers['x-cg-pro-api-key'] = this.apiKey;
      }

      const response = await axios.get(`${this.baseURL}/simple/price`, {
        params,
        headers
      });

      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la récupération du prix pour ${id}:`, error);
      throw error;
    }
  }

  /**
   * Récupère le prix actuel d'un token par son ID CoinGecko
   * @param {string} id - ID CoinGecko du token
   * @param {string} currency - Devise (ex: usd, eur)
   * @returns {Promise<number>} - Prix actuel du token
   */
  async getCurrentPrice(id, currency = 'usd') {
    try {
      const priceData = await this.getPrice(id, currency);
      
      if (priceData && priceData[id] && priceData[id][currency]) {
        return priceData[id][currency];
      }
      
      console.error(`Prix non disponible pour ${id} en ${currency}`);
      return 0;
    } catch (error) {
      console.error(`Erreur lors de la récupération du prix actuel pour ${id}:`, error);
      return 0;
    }
  }

  /**
   * Récupère les données d'un token spécifique
   * @param {string} id - ID CoinGecko du token
   * @returns {Promise<Object>} - Données du token
   */
  async getToken(id) {
    try {
      const params = {
        localization: false,
        tickers: false,
        market_data: true,
        community_data: false,
        developer_data: false
      };
      
      const headers = {};
      if (this.apiKey) {
        headers['x-cg-pro-api-key'] = this.apiKey;
      }

      const response = await axios.get(`${this.baseURL}/coins/${id}`, {
        params,
        headers
      });

      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la récupération du token ${id}:`, error);
      throw error;
    }
  }

  /**
   * Cherche un token par nom ou symbole
   * @param {string} query - Terme de recherche
   * @returns {Promise<Object>} - Résultats de recherche
   */
  async searchToken(query) {
    try {
      const params = { query };
      
      const headers = {};
      if (this.apiKey) {
        headers['x-cg-pro-api-key'] = this.apiKey;
      }

      const response = await axios.get(`${this.baseURL}/search`, {
        params,
        headers
      });

      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la recherche pour "${query}":`, error);
      throw error;
    }
  }

  /**
   * Récupère les tokens tendance du moment
   * @returns {Promise<Object>} - Liste des tokens tendance
   */
  async getTrending() {
    try {
      const params = {};
      const headers = {};
      
      if (this.apiKey) {
        headers['x-cg-pro-api-key'] = this.apiKey;
      }

      const response = await axios.get(`${this.baseURL}/search/trending`, {
        params,
        headers
      });

      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des tokens tendance:', error);
      throw error;
    }
  }

  /**
   * Récupère l'historique des prix d'un token à une date spécifique
   * @param {string} id - ID CoinGecko du token
   * @param {number} timestamp - Timestamp Unix en secondes
   * @param {string} currency - Devise (ex: usd, eur)
   * @returns {Promise<Object>} - Données de prix historiques brutes
   */
  async getPriceAtTimestamp(id, timestamp, currency = 'usd') {
    try {
      const date = new Date(timestamp * 1000).toISOString().split('T')[0]; // Format YYYY-MM-DD
      
      const headers = {};
      if (this.apiKey) {
        headers['x-cg-pro-api-key'] = this.apiKey;
      }

      // Utiliser l'endpoint history pour obtenir les données à une date spécifique
      const response = await axios.get(`${this.baseURL}/coins/${id}/history`, {
        params: {
          date: date,
          localization: false
        },
        headers
      });

      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la récupération du prix historique pour ${id} à ${timestamp}:`, error);
      return null; // Retourner null au lieu de throw pour maintenir le service fonctionnel
    }
  }

  /**
   * Récupère le prix d'un token à partir de son adresse (compatibilité avec l'interface du priceService)
   * @param {string} tokenAddress - Adresse du token (format Solana)
   * @returns {Promise<Object>} - Données de prix formatées
   */
  async getTokenPrice(tokenAddress) {
    try {
      // Convertir l'adresse du token en ID CoinGecko si connue
      const tokenId = this.tokenAddressToId[tokenAddress] || tokenAddress;
      
      // Si c'est une adresse non reconnue, on ne peut pas continuer
      if (!this.tokenAddressToId[tokenAddress]) {
        console.warn(`Adresse de token inconnue dans CoinGeckoService: ${tokenAddress}`);
        return null;
      }
      
      // Récupérer les données de prix
      const priceData = await this.getPrice(tokenId, 'usd');
      
      if (priceData && priceData[tokenId] && priceData[tokenId].usd) {
        // Formater la réponse pour correspondre au format attendu par priceService
        return {
          mint: tokenAddress,
          symbol: tokenId.toUpperCase(),
          name: tokenId.charAt(0).toUpperCase() + tokenId.slice(1).replace('-', ' '),
          price: priceData[tokenId].usd,
          priceUsd: priceData[tokenId].usd,
          change24h: priceData[tokenId].usd_24h_change || 0
        };
      }
      
      console.warn(`Prix non disponible sur CoinGecko pour ${tokenAddress} (${tokenId})`);
      return null;
    } catch (error) {
      console.error(`Erreur lors de la récupération du prix via CoinGecko pour ${tokenAddress}:`, error.message);
      return null;
    }
  }
  
  /**
   * Récupère l'historique des prix d'un token à une date spécifique
   * @param {string} tokenId - ID du token ou adresse
   * @param {number} timestamp - Timestamp Unix en secondes
   * @returns {Promise<Object>} - Données de prix historiques formatées
   */
  async getHistoricalPrice(tokenId, timestamp) {
    try {
      // Convertir l'adresse du token en ID CoinGecko si connue
      const geckoId = this.tokenAddressToId[tokenId] || tokenId;
      
      // Si c'est une adresse non reconnue, on ne peut pas continuer
      if (!this.tokenAddressToId[tokenId] && tokenId.length > 20) {
        console.warn(`Adresse de token inconnue pour l'historique dans CoinGeckoService: ${tokenId}`);
        return null;
      }
      
      const historicalData = await this.getPriceAtTimestamp(geckoId, timestamp);
      
      if (historicalData && historicalData.market_data && historicalData.market_data.current_price) {
        const price = historicalData.market_data.current_price.usd;
        
        if (price) {
          return {
            price,
            timestamp,
            date: new Date(timestamp * 1000).toISOString(),
            source: 'coingecko'
          };
        }
      }
      
      console.warn(`Données historiques non disponibles sur CoinGecko pour ${tokenId} à ${new Date(timestamp * 1000).toISOString()}`);
      return null;
    } catch (error) {
      console.error(`Erreur lors de la récupération de l'historique des prix via CoinGecko pour ${tokenId}:`, error.message);
      return null;
    }
  }
  
  /**
   * Récupère le prix de SOL en USD
   * @returns {Promise<Object>} Prix de SOL
   */
  async getSolPrice() {
    try {
      const priceData = await this.getPrice('solana', 'usd');
      return priceData.solana;
    } catch (error) {
      console.error('Erreur lors de la récupération du prix de SOL via CoinGecko:', error.message);
      return { usd: 0 };
    }
  }
}

module.exports = new CoinGeckoService();