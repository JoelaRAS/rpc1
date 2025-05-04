const axios = require('axios');

class JupiterService {
  constructor() {
    this.apiKey = process.env.JUPITER_API_KEY || null;
    this.baseURL = 'https://quote-api.jup.ag/v6';
  }

  /**
   * Récupère une cotation pour un échange de token
   * @param {string} inputMint - Adresse du token d'entrée
   * @param {string} outputMint - Adresse du token de sortie
   * @param {number} amount - Montant en lamports à échanger
   * @param {Object} options - Options supplémentaires
   * @returns {Promise<Object>} - Informations sur la cotation
   */
  async getQuote(inputMint, outputMint, amount, options = {}) {
    try {
      const { slippageBps = 50, onlyDirectRoutes = false } = options;
      
      const params = {
        inputMint,
        outputMint,
        amount,
        slippageBps,
        onlyDirectRoutes
      };

      const headers = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.get(`${this.baseURL}/quote`, { 
        params,
        headers
      });

      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération de la cotation Jupiter:', error);
      throw error;
    }
  }

  /**
   * Récupère le prix d'un token par rapport à un autre
   * @param {string} inputMint - Adresse du token d'entrée
   * @param {string} outputMint - Adresse du token de sortie
   * @returns {Promise<Object>} - Informations sur le prix
   */
  async getPrice(inputMint, outputMint) {
    try {
      const params = {
        ids: inputMint,
        vsToken: outputMint
      };

      const headers = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.get('https://price.jup.ag/v4/price', {
        params,
        headers
      });

      return response.data.data[inputMint];
    } catch (error) {
      console.error('Erreur lors de la récupération du prix Jupiter:', error);
      throw error;
    }
  }

  /**
   * Récupère la liste des tokens supportés par Jupiter
   * @returns {Promise<Array>} - Liste des tokens supportés
   */
  async getSupportedTokens() {
    try {
      const headers = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.get('https://token.jup.ag/all', { headers });
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des tokens supportés par Jupiter:', error);
      throw error;
    }
  }

  /**
   * Récupère les pools de liquidité pour une paire de tokens
   * @param {string} inputMint - Adresse du token d'entrée
   * @param {string} outputMint - Adresse du token de sortie
   * @returns {Promise<Array>} - Informations sur les pools de liquidité
   */
  async getLiquidityPools(inputMint, outputMint) {
    try {
      const params = {
        inputMint,
        outputMint
      };

      const headers = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.get(`${this.baseURL}/liquidity-pools`, {
        params,
        headers
      });

      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des pools de liquidité Jupiter:', error);
      throw error;
    }
  }

  /**
   * Crée une transaction de swap via Jupiter
   * @param {string} inputMint - Adresse du token d'entrée
   * @param {string} outputMint - Adresse du token de sortie
   * @param {string} amount - Montant en lamports à échanger
   * @param {string} userPublicKey - Clé publique de l'utilisateur
   * @param {Object} options - Options supplémentaires
   * @returns {Promise<Object>} - Transaction de swap
   */
  async createSwapTransaction(inputMint, outputMint, amount, userPublicKey, options = {}) {
    try {
      const { slippageBps = 50 } = options;
      
      // 1. Obtenir une cotation
      const quoteResponse = await this.getQuote(inputMint, outputMint, amount, options);
      
      if (!quoteResponse) {
        throw new Error('Impossible d\'obtenir une cotation');
      }
      
      // 2. Préparer la transaction
      const swapRequestBody = {
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true // Permet de gérer automatiquement le wrapping/unwrapping de SOL
      };
      
      const headers = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      
      // 3. Obtenir la transaction serialisée
      const swapResponse = await axios.post(
        `${this.baseURL}/swap`, 
        swapRequestBody,
        { headers }
      );
      
      // 4. Enrichir la réponse avec des informations plus détaillées sur les tokens
      const enrichedResponse = {
        ...swapResponse.data,
        swapDetails: {
          inputToken: await this.getEnrichedTokenInfo(inputMint, amount),
          outputToken: await this.getEnrichedTokenInfo(outputMint, quoteResponse.outAmount),
          route: quoteResponse.routePlan || [],
          slippage: `${slippageBps / 100}%`
        }
      };
      
      return enrichedResponse;
    } catch (error) {
      console.error('Erreur lors de la création de la transaction de swap:', error);
      throw error;
    }
  }
  
  /**
   * Récupère des informations enrichies sur un token
   * @param {string} mintAddress - Adresse du token
   * @param {string|number} amount - Montant (en format brut)
   * @returns {Promise<Object>} - Informations enrichies sur le token
   */
  async getEnrichedTokenInfo(mintAddress, amount) {
    try {
      // Récupérer les tokens supportés si nous ne les avons pas déjà
      if (!this.supportedTokens) {
        this.supportedTokens = await this.getSupportedTokens();
      }
      
      // Trouver le token dans la liste des tokens supportés
      const tokenInfo = this.supportedTokens.find(token => token.address === mintAddress);
      
      if (!tokenInfo) {
        // Si le token n'est pas trouvé, retourner les informations de base
        return {
          mint: mintAddress,
          symbol: 'UNKNOWN',
          decimals: 9, // Default pour SOL
          amount: amount / Math.pow(10, 9), // Conversion par défaut
          logoURI: null
        };
      }
      
      // Convertir le montant brut en montant UI en utilisant les décimales du token
      const uiAmount = amount / Math.pow(10, tokenInfo.decimals);
      
      return {
        mint: mintAddress,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        decimals: tokenInfo.decimals,
        amount: uiAmount,
        logoURI: tokenInfo.logoURI
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des informations enrichies du token:', error);
      // En cas d'erreur, retourner les informations minimales
      return {
        mint: mintAddress,
        amount
      };
    }
  }
}

module.exports = new JupiterService();