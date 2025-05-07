const axios = require('axios');

class CryptoCompareService {
  constructor() {
    this.apiKey = process.env.CRYPTOCOMPARE_API_KEY;
    this.baseURL = 'https://min-api.cryptocompare.com/data';
    
    // Table de correspondance pour les adresses de tokens Solana vers les symboles CryptoCompare
    this.tokenAddressToSymbol = {
      'So11111111111111111111111111111111111111112': 'SOL', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT', // USDT
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'MSOL', // mSOL
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK' // BONK
    };
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

  /**
   * Récupère le prix actuel d'un token en USD (fonction simplifiée)
   * @param {string} symbol - Symbole du token (ex: SOL)
   * @param {string} currency - Devise (ex: USD)
   * @returns {Promise<Object>} - Prix actuel
   */
  async getCurrentPrice(symbol, currency = 'USD') {
    try {
      const response = await axios.get(`${this.baseURL}/price`, {
        params: {
          fsym: symbol.toUpperCase(),
          tsyms: currency,
          api_key: this.apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la récupération du prix actuel de ${symbol} via CryptoCompare:`, error.message);
      throw error;
    }
  }

  /**
   * Récupère le prix d'un token à un timestamp donné
   * @param {string} symbol - Symbole du token (ex: SOL)
   * @param {number} timestamp - Timestamp Unix en secondes
   * @param {string} currency - Devise (ex: USD)
   * @returns {Promise<Object>} - Prix à l'horodatage spécifié
   */
  async getPriceAtTimestamp(symbol, timestamp, currency = 'USD') {
    try {
      // CryptoCompare utilise des timestamps en secondes
      const timestampSeconds = Math.floor(timestamp);
      
      const response = await axios.get(`${this.baseURL}/pricehistorical`, {
        params: {
          fsym: symbol.toUpperCase(),
          tsyms: currency,
          ts: timestampSeconds,
          api_key: this.apiKey
        }
      });
      
      // CryptoCompare renvoie { BTC: { USD: 12345.67 } }
      return response.data[symbol.toUpperCase()];
    } catch (error) {
      console.error(`Erreur lors de la récupération du prix historique de ${symbol} à ${new Date(timestamp * 1000).toISOString()} via CryptoCompare:`, error.message);
      throw error;
    }
  }

  /**
   * Récupère le prix d'un token à partir de son adresse (compatibilité avec l'interface du priceService)
   * @param {string} tokenAddress - Adresse du token (format Solana)
   * @returns {Promise<Object>} - Données de prix formatées
   */
  async getTokenPrice(tokenAddress) {
    try {
      // Convertir l'adresse du token en symbole CryptoCompare si connue
      const symbol = this.tokenAddressToSymbol[tokenAddress];
      
      // Si c'est une adresse non reconnue, on ne peut pas continuer
      if (!symbol) {
        console.warn(`Adresse de token inconnue dans CryptoCompareService: ${tokenAddress}`);
        return null;
      }
      
      // Récupérer les données de prix
      const priceData = await this.getCurrentPrice(symbol);
      
      if (priceData && priceData.USD) {
        // Formater la réponse pour correspondre au format attendu par priceService
        return {
          mint: tokenAddress,
          symbol: symbol,
          name: symbol, // Nom simpliste
          price: priceData.USD,
          priceUsd: priceData.USD,
          change24h: 0 // CryptoCompare nécessite un autre appel pour obtenir le changement sur 24h
        };
      }
      
      console.warn(`Prix non disponible sur CryptoCompare pour ${tokenAddress} (${symbol})`);
      return null;
    } catch (error) {
      console.error(`Erreur lors de la récupération du prix via CryptoCompare pour ${tokenAddress}:`, error.message);
      return null;
    }
  }
  
  /**
   * Récupère l'historique des prix d'un token à une date spécifique
   * @param {string} symbol - Symbole du token
   * @param {number} timestamp - Timestamp Unix en secondes
   * @returns {Promise<Object>} - Données de prix historiques formatées
   */
  async getHistoricalPrice(symbol, timestamp) {
    try {
      // Convertir l'adresse du token en symbole CryptoCompare si nécessaire
      const tokenSymbol = this.tokenAddressToSymbol[symbol] || symbol;
      
      // Si c'est une adresse inconnue et non un symbole, on ne peut pas continuer
      if (!this.tokenAddressToSymbol[symbol] && symbol.length > 10) {
        console.warn(`Adresse de token inconnue pour l'historique dans CryptoCompareService: ${symbol}`);
        return null;
      }
      
      const historicalData = await this.getPriceAtTimestamp(tokenSymbol, timestamp);
      
      if (historicalData && historicalData.USD) {
        return {
          price: historicalData.USD,
          timestamp,
          date: new Date(timestamp * 1000).toISOString(),
          source: 'cryptocompare'
        };
      }
      
      console.warn(`Données historiques non disponibles sur CryptoCompare pour ${symbol} à ${new Date(timestamp * 1000).toISOString()}`);
      return null;
    } catch (error) {
      console.error(`Erreur lors de la récupération de l'historique des prix via CryptoCompare pour ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Récupère le prix de SOL en USD
   * @returns {Promise<Object>} Prix de SOL
   */
  async getSolPrice() {
    try {
      const priceData = await this.getCurrentPrice('SOL', 'USD');
      return priceData;
    } catch (error) {
      console.error('Erreur lors de la récupération du prix de SOL via CryptoCompare:', error.message);
      return { USD: 0 };
    }
  }
}

module.exports = new CryptoCompareService();