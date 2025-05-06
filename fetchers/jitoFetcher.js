/**
 * Fetcher spécifique pour la plateforme Jito (staking liquide) sur Solana
 * Implémenté selon l'architecture exacte du projet portfolio
 */
const { Fetcher, PLATFORM_TYPES } = require('../services/fetcherService');
const networkService = require('../services/networkService');
const jitoService = require('../services/jitoService');
const priceService = require('../services/priceService');
const cacheService = require('../services/cacheService');
const solanaWebService = require('../services/solanaWebService');

// Constantes spécifiques à Jito
const JITO_PROGRAM_ID = 'jito11111111111111111111111111111111111111';
const JITOSOL_TOKEN = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn';

// Référence directe au réseau Solana
const SOLANA_NETWORK_ID = networkService.NETWORK_TYPES.SOLANA;

class JitoFetcher extends Fetcher {
  constructor() {
    // ID unique, networkId, platformId, platformType (exactement comme portfolio)
    super('jito-solana', SOLANA_NETWORK_ID, 'jito', PLATFORM_TYPES.STAKING);
  }

  /**
   * Exécute le fetcher pour récupérer les positions Jito
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Éléments de portfolio pour Jito
   */
  async execute(owner) {
    console.log(`[JitoFetcher] Récupération des positions Jito pour ${owner}`);
    
    // Vérifier le cache d'abord
    const cacheKey = `jito_${owner}`;
    const cachedData = cacheService.get(cacheKey);
    
    if (cachedData) {
      console.log(`[JitoFetcher] Données récupérées depuis le cache pour ${owner}`);
      return cachedData;
    }
    
    try {
      // 1. Récupérer les positions de staking JitoSOL
      const jitosolPositions = await this._fetchJitosolPositions(owner);
      
      // Si aucun élément de portfolio n'est trouvé, retourner un tableau vide
      if (jitosolPositions.length === 0) {
        console.log(`[JitoFetcher] Aucune position Jito trouvée pour ${owner}`);
        return [];
      }
      
      // Mettre en cache pour 5 minutes
      cacheService.set(cacheKey, jitosolPositions, 300);
      
      return jitosolPositions;
    } catch (error) {
      console.error(`[JitoFetcher] Erreur dans l'exécution: ${error.message}`);
      return []; // Retourner un tableau vide en cas d'erreur
    }
  }
  
  /**
   * Récupère les positions de staking JitoSOL de l'utilisateur
   * @private
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Positions de staking formatées
   */
  async _fetchJitosolPositions(owner) {
    try {
      console.log(`[JitoFetcher] Récupération des positions JitoSOL pour ${owner}`);
      
      // 1. Récupérer les tokens JitoSOL détenus par l'utilisateur
      const tokenAccounts = await solanaWebService.getTokenAccountsByOwner(owner);
      
      // Filtrer pour ne garder que les tokens JitoSOL
      const jitosolAccounts = tokenAccounts.filter(account => 
        account.mint === JITOSOL_TOKEN && parseFloat(account.amount) > 0
      );
      
      if (jitosolAccounts.length === 0) {
        console.log(`[JitoFetcher] Aucun token JitoSOL trouvé pour ${owner}`);
        return [];
      }
      
      console.log(`[JitoFetcher] ${jitosolAccounts.length} tokens JitoSOL trouvés pour ${owner}`);
      
      // 2. Récupérer les détails de staking via le service Jito
      const stakingDetails = await jitoService.getStakingDetails();
      
      // 3. Formater les positions selon le format portfolio.js
      const portfolioElements = [];
      
      for (const account of jitosolAccounts) {
        try {
          // Récupération du prix de JitoSOL et SOL
          const jitosolPrice = await this._getPrice(JITOSOL_TOKEN);
          const solPrice = await this._getPrice('So11111111111111111111111111111111111111112');
          
          // Calcul des valeurs
          const jitosolAmount = parseFloat(account.uiAmount);
          const solAmount = jitosolAmount * stakingDetails.jitosolToSolRate;
          const jitosolValue = jitosolAmount * jitosolPrice;
          
          // Structure d'élément portfolio pour une position de staking JitoSOL
          const portfolioElement = {
            networkId: this.networkId,
            platformId: this.platformId,
            type: 'staking',
            label: 'Liquid Staking',
            name: 'Jito jitoSOL',
            value: { amount: jitosolValue, currency: 'usd' },
            attributes: {
              stakingType: 'liquid',
              stakingToken: 'jitosol',
              tags: ['staking', 'liquid-staking', 'jito', 'mev']
            },
            data: {
              jitosolAddress: account.tokenAccountAddress,
              jitosolAmount: jitosolAmount,
              jitosolToSolRate: stakingDetails.jitosolToSolRate,
              apy: stakingDetails.apy * 100,
              ref: account.tokenAccountAddress,
              sourceRefs: [
                {
                  address: account.tokenAccountAddress,
                  name: 'Token Account'
                },
                {
                  address: JITOSOL_TOKEN,
                  name: 'Token'
                },
                {
                  address: JITO_PROGRAM_ID,
                  name: 'Program'
                }
              ],
              link: `https://jito.network/stake`
            },
            baseTokens: [
              {
                networkId: this.networkId,
                type: 'token',
                value: { amount: jitosolValue, currency: 'usd' },
                name: 'Jito staked SOL',
                symbol: 'jitoSOL',
                data: {
                  address: JITOSOL_TOKEN,
                  amount: jitosolAmount,
                  price: { amount: jitosolPrice, currency: 'usd' },
                  decimals: 9
                }
              }
            ],
            underlyingTokens: [
              {
                networkId: this.networkId,
                type: 'token',
                value: { amount: solAmount * solPrice, currency: 'usd' },
                name: 'Solana',
                symbol: 'SOL',
                data: {
                  address: 'So11111111111111111111111111111111111111112',
                  amount: solAmount,
                  price: { amount: solPrice, currency: 'usd' },
                  decimals: 9
                }
              }
            ]
          };
          
          portfolioElements.push(portfolioElement);
        } catch (positionError) {
          console.error(`[JitoFetcher] Erreur lors du traitement d'une position JitoSOL: ${positionError.message}`);
          // Continuer avec les autres positions
        }
      }
      
      return portfolioElements;
      
    } catch (error) {
      console.warn(`[JitoFetcher] Erreur lors de la récupération des positions JitoSOL: ${error.message}`);
      
      // Plan B : utiliser des données simulées si configuré
      if (process.env.USE_SIMULATED_DATA === 'true') {
        console.log(`[JitoFetcher] Utilisation de données simulées pour ${owner}`);
        return this._getSimulatedPositions();
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
      console.warn(`[JitoFetcher] Erreur lors de la récupération du prix pour ${tokenAddress}: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Génère des données de positions simulées pour les tests
   * @private
   * @returns {Array} - Positions simulées
   */
  _getSimulatedPositions() {
    const solPrice = 750; // Prix fictif du SOL
    const jitosolPrice = 785; // Prix fictif du JitoSOL (légèrement supérieur à cause des récompenses + MEV)
    
    // Positions simulées pour les tests
    return [
      {
        networkId: this.networkId,
        platformId: this.platformId,
        type: 'staking',
        label: 'Liquid Staking',
        name: 'Jito jitoSOL',
        value: { amount: 785, currency: 'usd' },
        attributes: {
          stakingType: 'liquid',
          stakingToken: 'jitosol',
          tags: ['staking', 'liquid-staking', 'jito', 'mev']
        },
        data: {
          jitosolAddress: 'simu-jitosol-token-account',
          jitosolAmount: 1,
          jitosolToSolRate: 1.045,
          apy: 7.2,
          ref: 'simu-jitosol-token-account',
          sourceRefs: [
            {
              address: 'simu-jitosol-token-account',
              name: 'Token Account'
            },
            {
              address: JITOSOL_TOKEN,
              name: 'Token'
            },
            {
              address: JITO_PROGRAM_ID,
              name: 'Program'
            }
          ],
          link: `https://jito.network/stake`
        },
        baseTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 785, currency: 'usd' },
            name: 'Jito staked SOL',
            symbol: 'jitoSOL',
            data: {
              address: JITOSOL_TOKEN,
              amount: 1,
              price: { amount: jitosolPrice, currency: 'usd' },
              decimals: 9
            }
          }
        ],
        underlyingTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 783.75, currency: 'usd' },
            name: 'Solana',
            symbol: 'SOL',
            data: {
              address: 'So11111111111111111111111111111111111111112',
              amount: 1.045,
              price: { amount: solPrice, currency: 'usd' },
              decimals: 9
            }
          }
        ]
      }
    ];
  }
}

// Exporter une instance
module.exports = new JitoFetcher();