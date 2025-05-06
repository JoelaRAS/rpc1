/**
 * Fetcher spécifique pour la plateforme Jupiter (limit orders) sur Solana
 * Implémenté selon l'architecture exacte du projet portfolio
 */
const { Fetcher, PLATFORM_TYPES } = require('../services/fetcherService');
const networkService = require('../services/networkService');
const jupiterService = require('../services/jupiterService');
const priceService = require('../services/priceService');
const cacheService = require('../services/cacheService');
const solanaWebService = require('../services/solanaWebService');

// Constantes spécifiques à Jupiter
const JUPITER_PROGRAM_ID = 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB';

// Référence directe au réseau Solana
const SOLANA_NETWORK_ID = networkService.NETWORK_TYPES.SOLANA;

class JupiterFetcher extends Fetcher {
  constructor() {
    // ID unique, networkId, platformId, platformType (exactement comme portfolio)
    super('jupiter-solana', SOLANA_NETWORK_ID, 'jupiter', PLATFORM_TYPES.MULTIPLE);
  }

  /**
   * Exécute le fetcher pour récupérer les positions Jupiter
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Éléments de portfolio pour Jupiter
   */
  async execute(owner) {
    console.log(`[JupiterFetcher] Récupération des positions Jupiter pour ${owner}`);
    
    // Vérifier le cache d'abord
    const cacheKey = `jupiter_${owner}`;
    const cachedData = cacheService.get(cacheKey);
    
    if (cachedData) {
      console.log(`[JupiterFetcher] Données récupérées depuis le cache pour ${owner}`);
      return cachedData;
    }
    
    try {
      // Récupérer les positions de limit order
      const limitOrders = await this._fetchLimitOrders(owner);
      
      // Si aucun élément de portfolio n'est trouvé, retourner un tableau vide
      if (limitOrders.length === 0) {
        console.log(`[JupiterFetcher] Aucune position Jupiter trouvée pour ${owner}`);
        return [];
      }
      
      // Mettre en cache pour 5 minutes
      cacheService.set(cacheKey, limitOrders, 300);
      
      return limitOrders;
    } catch (error) {
      console.error(`[JupiterFetcher] Erreur dans l'exécution: ${error.message}`);
      return []; // Retourner un tableau vide en cas d'erreur
    }
  }
  
  /**
   * Récupère les ordres limites de l'utilisateur
   * @private
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Positions Jupiter formatées
   */
  async _fetchLimitOrders(owner) {
    try {
      console.log(`[JupiterFetcher] Récupération des limit orders pour ${owner}`);
      
      // Appel API pour récupérer les limit orders
      const limitOrders = await jupiterService.getLimitOrdersByOwner(owner);
      
      if (!limitOrders || limitOrders.length === 0) {
        console.log(`[JupiterFetcher] Aucun limit order trouvé pour ${owner}`);
        return [];
      }
      
      console.log(`[JupiterFetcher] ${limitOrders.length} limit orders trouvés pour ${owner}`);
      
      // Formater les orders selon le format portfolio.js
      const portfolioElements = [];
      
      for (const order of limitOrders) {
        try {
          // Récupération des informations des tokens
          const inputTokenInfo = await jupiterService.getTokenInfo(order.inputMint);
          const outputTokenInfo = await jupiterService.getTokenInfo(order.outputMint);
          
          // Récupération des prix pour calculer la valeur
          const inputPrice = await this._getPrice(order.inputMint);
          const outputPrice = await this._getPrice(order.outputMint);
          
          // Calculer la valeur de l'ordre
          const inputValue = parseFloat(order.inAmount) * inputPrice / Math.pow(10, inputTokenInfo?.decimals || 9);
          
          // Structure d'élément portfolio pour un limit order
          const portfolioElement = {
            networkId: this.networkId,
            platformId: this.platformId,
            type: 'limit-order',
            label: 'Limit Order',
            name: 'Jupiter',
            value: { amount: inputValue, currency: 'usd' },
            data: {
              orderId: order.orderId,
              inputMint: order.inputMint,
              outputMint: order.outputMint,
              inputAmount: parseFloat(order.inAmount) / Math.pow(10, inputTokenInfo?.decimals || 9),
              outputAmount: parseFloat(order.outAmount) / Math.pow(10, outputTokenInfo?.decimals || 9),
              inputSymbol: inputTokenInfo?.symbol || 'Unknown',
              outputSymbol: outputTokenInfo?.symbol || 'Unknown', 
              state: order.orderStatus,
              createdAt: order.createdAt,
              expiresAt: order.expiresAt,
              ref: order.orderId,
              sourceRefs: [
                {
                  address: order.orderId,
                  name: 'Order'
                },
                {
                  address: JUPITER_PROGRAM_ID,
                  name: 'Program'
                }
              ],
              link: `https://jup.ag/limit/order/${order.orderId}`
            },
            baseTokens: [
              {
                networkId: this.networkId,
                type: 'token',
                value: { amount: inputValue, currency: 'usd' },
                name: inputTokenInfo?.name || 'Unknown Token',
                symbol: inputTokenInfo?.symbol || 'Unknown',
                data: {
                  address: order.inputMint,
                  amount: parseFloat(order.inAmount) / Math.pow(10, inputTokenInfo?.decimals || 9),
                  price: { amount: inputPrice, currency: 'usd' },
                  decimals: inputTokenInfo?.decimals || 9
                }
              }
            ]
          };
          
          portfolioElements.push(portfolioElement);
        } catch (orderError) {
          console.error(`[JupiterFetcher] Erreur lors du traitement d'un order: ${orderError.message}`);
          // Continuer avec les autres orders
        }
      }
      
      return portfolioElements;
      
    } catch (error) {
      console.warn(`[JupiterFetcher] Erreur lors de la récupération des limit orders: ${error.message}`);
      
      // Plan B : utiliser des données simulées si configuré
      if (process.env.USE_SIMULATED_DATA === 'true') {
        console.log(`[JupiterFetcher] Utilisation de données simulées pour ${owner}`);
        return this._getSimulatedOrders();
      }
      
      return [];
    }
  }
  
  /**
   * Récupère le prix d'un token
   * @private
   * @param {string} tokenAddress - Adresse du token
   * @returns {Promise<number>} - Prix du token en USD
   */
  async _getPrice(tokenAddress) {
    try {
      const priceData = await priceService.getCurrentPrice(tokenAddress);
      return priceData?.price || 0;
    } catch (error) {
      console.warn(`[JupiterFetcher] Erreur lors de la récupération du prix pour ${tokenAddress}: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Génère des données d'orders simulés pour les tests
   * @private
   * @returns {Array} - Orders simulés
   */
  _getSimulatedOrders() {
    // Orders simulés pour les tests
    return [
      {
        networkId: this.networkId,
        platformId: this.platformId,
        type: 'limit-order',
        label: 'Limit Order',
        name: 'Jupiter',
        value: { amount: 500, currency: 'usd' },
        data: {
          orderId: 'simu-order-id-1',
          inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          outputMint: 'So11111111111111111111111111111111111111112',
          inputAmount: 500,
          outputAmount: 0.66,
          inputSymbol: 'USDC',
          outputSymbol: 'SOL',
          state: 'open',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          ref: 'simu-order-id-1',
          sourceRefs: [
            {
              address: 'simu-order-id-1',
              name: 'Order'
            },
            {
              address: JUPITER_PROGRAM_ID,
              name: 'Program'
            }
          ],
          link: `https://jup.ag/limit`
        },
        baseTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 500, currency: 'usd' },
            name: 'USD Coin',
            symbol: 'USDC',
            data: {
              address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              amount: 500,
              price: { amount: 1, currency: 'usd' },
              decimals: 6
            }
          }
        ]
      },
      {
        networkId: this.networkId,
        platformId: this.platformId,
        type: 'limit-order',
        label: 'Limit Order',
        name: 'Jupiter',
        value: { amount: 377.5, currency: 'usd' },
        data: {
          orderId: 'simu-order-id-2',
          inputMint: 'So11111111111111111111111111111111111111112',
          outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          inputAmount: 0.5,
          outputAmount: 400,
          inputSymbol: 'SOL',
          outputSymbol: 'USDC',
          state: 'open',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          ref: 'simu-order-id-2',
          sourceRefs: [
            {
              address: 'simu-order-id-2',
              name: 'Order'
            },
            {
              address: JUPITER_PROGRAM_ID,
              name: 'Program'
            }
          ],
          link: `https://jup.ag/limit`
        },
        baseTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 377.5, currency: 'usd' },
            name: 'Solana',
            symbol: 'SOL',
            data: {
              address: 'So11111111111111111111111111111111111111112',
              amount: 0.5,
              price: { amount: 755, currency: 'usd' },
              decimals: 9
            }
          }
        ]
      }
    ];
  }
}

// Exporter une instance
module.exports = new JupiterFetcher();