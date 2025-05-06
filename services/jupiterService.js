const axios = require('axios');
const priceService = require('./priceService');
const solanaWebService = require('./solanaWebService');

// Constantes
const JUPITER_PROGRAM_ID = 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB';
const JUPITER_API_BASE = 'https://price.jup.ag/v6';

class JupiterService {
  constructor() {
    this.apiKey = process.env.JUPITER_API_KEY || null;
    this.baseURL = 'https://quote-api.jup.ag/v6';
    this.liteApiBaseURL = 'https://lite-api.jup.ag';
    this.limitOrderURL = 'https://jup.ag/api/limit';
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
   * Récupère des informations sur un token (alias pour getEnrichedTokenInfo)
   * @param {string} mintAddress - Adresse du token
   * @returns {Promise<Object>} - Informations sur le token
   */
  async getTokenInfo(mintAddress) {
    try {
      // Utiliser l'API dédiée de Jupiter pour récupérer les informations du token spécifique
      const response = await axios.get(`${this.liteApiBaseURL}/tokens/v1/token/${mintAddress}`);
      
      // Si la requête réussit, retourner les informations détaillées du token
      if (response.data) {
        return {
          mint: mintAddress,
          address: response.data.address,
          symbol: response.data.symbol,
          name: response.data.name,
          decimals: response.data.decimals,
          logoURI: response.data.logoURI,
          tags: response.data.tags || [],
          extensions: response.data.extensions || {},
          freeze_authority: response.data.freeze_authority,
          mint_authority: response.data.mint_authority,
          permanent_delegate: response.data.permanent_delegate,
          daily_volume: response.data.daily_volume,
          created_at: response.data.created_at,
          minted_at: response.data.minted_at
        };
      }
      
      // Fallback vers la méthode existante si l'API dédiée échoue
      return this.getEnrichedTokenInfo(mintAddress, 0);
    } catch (error) {
      console.error(`Erreur lors de la récupération des informations du token ${mintAddress}:`, error.message);
      // Fallback vers la méthode existante
      return this.getEnrichedTokenInfo(mintAddress, 0);
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

  /**
   * Récupère les ordres limites actifs d'un utilisateur
   * @param {string} walletAddress - Adresse du portefeuille de l'utilisateur
   * @returns {Promise<Array>} - Liste des ordres limites actifs
   */
  async getLimitOrders(walletAddress) {
    try {
      if (!walletAddress) {
        throw new Error('Adresse du portefeuille requise pour récupérer les ordres limites');
      }
      
      // Utiliser l'API Jupiter pour récupérer les ordres limites
      const response = await axios.get(`${this.limitOrderURL}/orders`, {
        params: { wallet: walletAddress },
        headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
      });
      
      if (response.data && Array.isArray(response.data.items)) {
        return response.data.items.map(order => ({
          address: order.id || order.orderId,
          inputMint: order.inToken,
          outputMint: order.outToken,
          inputAmount: order.inAmount,
          minOutputAmount: order.outAmount,
          createdAt: order.createdAt,
          expiresAt: order.expiryTime ? new Date(order.expiryTime).toISOString() : null,
          status: order.status || 'active',
          ownerAddress: walletAddress,
          price: order.price ? {
            numerator: order.price.numerator,
            denominator: order.price.denominator,
            value: parseFloat(order.price.numerator) / parseFloat(order.price.denominator)
          } : null
        }));
      }
      
      return [];
    } catch (error) {
      console.error(`Erreur lors de la récupération des ordres limites pour ${walletAddress}:`, error);
      // En cas d'erreur, retourner un tableau vide au lieu de propager l'erreur
      return [];
    }
  }

  /**
   * Récupère les limit orders d'un utilisateur sur Jupiter
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} Liste des limit orders
   */
  async getLimitOrdersByOwner(owner) {
    try {
      // Dans une implémentation réelle, on ferait appel à l'API Jupiter
      // Pour la simplicité, on retourne un tableau vide (l'utilisateur n'a pas d'orders)
      return [];
    } catch (error) {
      console.error(`[JupiterService] Erreur lors de la récupération des limit orders: ${error.message}`);
      return [];
    }
  }

  /**
   * Récupère le prix d'un token sur le DEX Jupiter
   * @param {string} mint - Adresse du token
   * @returns {Promise<number>} Prix en USD
   */
  async getTokenPrice(mint) {
    try {
      // Utiliser le service de prix plutôt que de dupliquer la logique
      const priceData = await priceService.getCurrentPrice(mint);
      return priceData?.price || 0;
    } catch (error) {
      console.error(`[JupiterService] Erreur lors de la récupération du prix pour ${mint}: ${error.message}`);
      return 0;
    }
  }
}

module.exports = new JupiterService();