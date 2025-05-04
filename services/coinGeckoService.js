const axios = require('axios');

class CoinGeckoService {
  constructor() {
    this.apiKey = process.env.COINGECKO_API_KEY || null;
    this.baseURL = this.apiKey 
      ? 'https://pro-api.coingecko.com/api/v3' 
      : 'https://api.coingecko.com/api/v3';
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
}

module.exports = new CoinGeckoService();