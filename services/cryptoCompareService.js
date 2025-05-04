const axios = require('axios');

class CryptoCompareService {
  constructor() {
    this.apiKey = process.env.CRYPTOCOMPARE_API_KEY;
    this.baseURL = 'https://min-api.cryptocompare.com/data';
  }

  /**
   * Récupère le prix historique d'un token sur une période donnée
   * @param {string} fsym - Symbole du token (ex: BTC)
   * @param {string} tsym - Symbole de la monnaie cible (ex: USD)
   * @param {number} limit - Nombre de données à récupérer
   * @param {string} frequency - Fréquence des données ('minute', 'hour', 'day')
   * @returns {Promise<Object>} - Données historiques
   */
  async getHistoricalPrice(fsym, tsym, limit = 30, frequency = 'day') {
    try {
      let endpoint;
      switch (frequency) {
        case 'minute':
          endpoint = '/v2/histominute';
          break;
        case 'hour':
          endpoint = '/v2/histohour';
          break;
        case 'day':
        default:
          endpoint = '/v2/histoday';
          break;
      }

      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        params: {
          fsym,
          tsym,
          limit,
          api_key: this.apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des données historiques via CryptoCompare:', error);
      throw error;
    }
  }

  /**
   * Récupère le prix actuel d'un ou plusieurs tokens
   * @param {string|Array<string>} fsyms - Symbole(s) du/des token(s)
   * @param {string|Array<string>} tsyms - Symbole(s) de la/les monnaie(s) cible(s)
   * @returns {Promise<Object>} - Prix actuel(s)
   */
  async getPrice(fsyms, tsyms) {
    try {
      // Convertir en chaîne si c'est un tableau
      const fromSymbols = Array.isArray(fsyms) ? fsyms.join(',') : fsyms;
      const toSymbols = Array.isArray(tsyms) ? tsyms.join(',') : tsyms;

      const response = await axios.get(`${this.baseURL}/pricemultifull`, {
        params: {
          fsyms: fromSymbols,
          tsyms: toSymbols,
          api_key: this.apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des prix via CryptoCompare:', error);
      throw error;
    }
  }

  /**
   * Récupère les tops du marché (volume, capitalisation, etc.)
   * @param {string} tsym - Symbole de la monnaie cible (ex: USD)
   * @param {number} limit - Nombre de tokens à récupérer
   * @returns {Promise<Object>} - Données des tops du marché
   */
  async getTopListByMarketCap(tsym = 'USD', limit = 20) {
    try {
      const response = await axios.get(`${this.baseURL}/top/mktcapfull`, {
        params: {
          tsym,
          limit,
          api_key: this.apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des tops du marché via CryptoCompare:', error);
      throw error;
    }
  }

  /**
   * Récupère les taux de change pour une monnaie de référence
   * @param {string} base - Symbole de la monnaie de base (ex: USD)
   * @returns {Promise<Object>} - Taux de change
   */
  async getExchangeRates(base = 'USD') {
    try {
      const response = await axios.get(`${this.baseURL}/exchange/rates`, {
        params: {
          base,
          api_key: this.apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des taux de change via CryptoCompare:', error);
      throw error;
    }
  }
}

module.exports = new CryptoCompareService();