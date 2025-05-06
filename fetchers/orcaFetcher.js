/**
 * Fetcher spécifique pour la plateforme Orca (liquidity pools) sur Solana
 * Implémenté selon l'architecture exacte du projet portfolio
 */
const { Fetcher, PLATFORM_TYPES } = require('../services/fetcherService');
const networkService = require('../services/networkService');
const priceService = require('../services/priceService');
const cacheService = require('../services/cacheService');
const solanaWebService = require('../services/solanaWebService');

// Constantes spécifiques à Orca
const ORCA_PROGRAM_ID = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
const ORCA_WHIRLPOOL_ID = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';

// Référence directe au réseau Solana
const SOLANA_NETWORK_ID = networkService.NETWORK_TYPES.SOLANA;

class OrcaFetcher extends Fetcher {
  constructor() {
    // ID unique, networkId, platformId, platformType (exactement comme portfolio)
    super('orca-solana', SOLANA_NETWORK_ID, 'orca', PLATFORM_TYPES.LIQUIDITY_POOL);
  }

  /**
   * Exécute le fetcher pour récupérer les positions Orca (liquidité)
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Éléments de portfolio pour Orca
   */
  async execute(owner) {
    console.log(`[OrcaFetcher] Récupération des positions Orca pour ${owner}`);
    
    // Structure d'élément portfolio exactement comme dans portfolio.js
    const portfolioElement = {
      networkId: this.networkId,
      platformId: this.platformId,
      type: 'liquidity-pool',  // Type utilisé dans portfolio.js pour les pools de liquidité
      label: 'Liquidity Pool', // Label standardisé selon portfolio.js
      name: 'Orca',
      value: { amount: 0, currency: 'usd' },
      data: {
        pools: [],
        ref: owner,
        sourceRefs: [
          {
            address: ORCA_PROGRAM_ID,
            name: 'Program'
          }
        ],
        link: 'https://orca.so/'
      }
    };

    try {
      // Vérifier le cache d'abord
      const cacheKey = `orca_${owner}`;
      const cachedData = cacheService.get(cacheKey);
      
      if (cachedData) {
        console.log(`[OrcaFetcher] Données récupérées depuis le cache pour ${owner}`);
        return [cachedData];
      }
      
      // 1. Récupérer les positions Orca Whirlpools (concentrated liquidity)
      const whirlpoolPositions = await this._fetchWhirlpoolPositions(owner);
      
      if (whirlpoolPositions.length === 0) {
        console.log(`[OrcaFetcher] Aucune position Orca trouvée pour ${owner}`);
        return [];
      }
      
      // 2. Ajouter les positions au format portfolio.js
      portfolioElement.data.pools = whirlpoolPositions;
      
      // 3. Calculer la valeur totale des positions
      let totalValue = 0;
      for (const pool of whirlpoolPositions) {
        totalValue += pool.value.amount || 0;
      }
      portfolioElement.value = { amount: totalValue, currency: 'usd' };
      
      // Mettre en cache pour 5 minutes
      cacheService.set(cacheKey, portfolioElement, 300);
      
      return [portfolioElement];
      
    } catch (error) {
      console.error(`[OrcaFetcher] Erreur dans l'exécution: ${error.message}`);
      return []; // Retourner un tableau vide en cas d'erreur
    }
  }
  
  /**
   * Récupère les positions Whirlpool de l'utilisateur
   * @private
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Positions Whirlpool formatées
   */
  async _fetchWhirlpoolPositions(owner) {
    try {
      console.log(`[OrcaFetcher] Recherche des positions Whirlpool pour ${owner}`);
      
      // Récupérer les PDA des positions Whirlpool
      const positionPdas = await solanaWebService.getTokenPositionsByOwnerAndProgram(
        owner,
        ORCA_PROGRAM_ID
      );
      
      if (!positionPdas || positionPdas.length === 0) {
        console.log(`[OrcaFetcher] Aucune position Whirlpool trouvée pour ${owner}`);
        return [];
      }
      
      console.log(`[OrcaFetcher] ${positionPdas.length} positions Whirlpool trouvées pour ${owner}`);
      
      // Récupérer les détails de chaque position
      const positionsData = await Promise.all(
        positionPdas.map(async (pda) => {
          try {
            const positionData = await solanaWebService.getWhirlpoolPositionData(pda);
            return positionData;
          } catch (err) {
            console.error(`[OrcaFetcher] Erreur lors de la récupération des données de position ${pda}: ${err.message}`);
            return null;
          }
        })
      );
      
      // Filtrer les positions valides
      const validPositions = positionsData.filter(position => position !== null);
      
      // Formater les positions selon le format portfolio.js
      const formattedPositions = [];
      
      for (const position of validPositions) {
        // Récupérer les prix des tokens
        const token0Price = await this._getPrice(position.token0.address);
        const token1Price = await this._getPrice(position.token1.address);
        
        // Calculer les valeurs
        const token0Value = position.token0.amount * token0Price;
        const token1Value = position.token1.amount * token1Price;
        const totalValue = token0Value + token1Value;
        
        // Dans une implémentation réelle, les APR/APY seraient récupérés depuis l'API Orca
        const yieldData = await this._getYieldData(position.poolAddress);
        const apr = yieldData?.apr || 0;
        const apy = yieldData?.apy || 0;
        
        // Créer l'objet pool au format exact de portfolio.js
        const pool = {
          networkId: this.networkId,
          type: 'liquidity-position',
          value: { amount: totalValue, currency: 'usd' },
          attributes: {
            isDeprecated: false,
            tags: ['concentrated-liquidity', 'whirlpool']
          },
          name: `${position.token0.symbol}-${position.token1.symbol}`,
          imageUri: 'https://www.orca.so/orca-logo.svg',
          data: {
            address: position.poolAddress,
            positionAddress: position.positionAddress,
            fee: position.fee,
            lowerTick: position.lowerTick,
            upperTick: position.upperTick,
            liquidity: position.liquidity,
            yield: {
              apr: apr,
              apy: apy
            }
          },
          baseTokens: [
            {
              networkId: this.networkId,
              type: 'token',
              value: { amount: token0Value, currency: 'usd' },
              name: position.token0.name,
              symbol: position.token0.symbol,
              data: {
                address: position.token0.address,
                amount: position.token0.amount,
                price: { amount: token0Price, currency: 'usd' },
                decimals: position.token0.decimals
              }
            },
            {
              networkId: this.networkId,
              type: 'token',
              value: { amount: token1Value, currency: 'usd' },
              name: position.token1.name,
              symbol: position.token1.symbol,
              data: {
                address: position.token1.address,
                amount: position.token1.amount,
                price: { amount: token1Price, currency: 'usd' },
                decimals: position.token1.decimals
              }
            }
          ],
          ref: position.positionAddress,
          sourceRefs: [
            {
              address: position.positionAddress,
              name: 'Position'
            },
            {
              address: position.poolAddress,
              name: 'Pool'
            },
            {
              address: ORCA_PROGRAM_ID,
              name: 'Program'
            }
          ]
        };
        
        formattedPositions.push(pool);
      }
      
      return formattedPositions;
      
    } catch (error) {
      console.warn(`[OrcaFetcher] Erreur lors de la récupération des positions Whirlpool: ${error.message}`);
      
      // Plan B : utiliser les données simulées (uniquement en mode développement ou si explicitement configuré)
      if (process.env.USE_SIMULATED_DATA === 'true') {
        console.log(`[OrcaFetcher] Utilisation de données simulées pour ${owner}`);
        return this._getSimulatedPositions();
      }
      
      return [];
    }
  }
  
  /**
   * Récupère les données de rendement pour un pool spécifique
   * @private
   * @param {string} poolAddress - Adresse du pool
   * @returns {Promise<object>} - Données de rendement (apr, apy)
   */
  async _getYieldData(poolAddress) {
    try {
      // Dans une implémentation réelle, appeler une API pour obtenir les données de rendement
      // const yieldData = await axios.get(`https://api.orca.so/pools/${poolAddress}/yield`);
      
      // Pour l'exemple, on retourne des valeurs simulées
      return {
        apr: 0.15, // 15% APR
        apy: 0.17  // 17% APY
      };
    } catch (error) {
      console.warn(`[OrcaFetcher] Erreur lors de la récupération des données de rendement: ${error.message}`);
      return {
        apr: 0,
        apy: 0
      };
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
      console.warn(`[OrcaFetcher] Erreur lors de la récupération du prix pour ${tokenAddress}: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Génère des données de positions simulées pour les tests
   * @private
   * @returns {Array} - Positions simulées
   */
  _getSimulatedPositions() {
    // Positions simulées pour les tests
    return [
      {
        networkId: this.networkId,
        type: 'liquidity-position',
        value: { amount: 754.25, currency: 'usd' },
        attributes: {
          isDeprecated: false,
          tags: ['concentrated-liquidity', 'whirlpool']
        },
        name: 'USDC-SOL',
        imageUri: 'https://www.orca.so/orca-logo.svg',
        data: {
          address: 'HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ',
          positionAddress: '8JnNWJ2RVdbNspU4QNP7mZ6xWn4XjGYcuEys8LSNaVK3',
          fee: 0.003,
          lowerTick: -1000,
          upperTick: 1000,
          liquidity: '1234567890',
          yield: {
            apr: 0.15,
            apy: 0.17
          }
        },
        baseTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 150.25, currency: 'usd' },
            name: 'USD Coin',
            symbol: 'USDC',
            data: {
              address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              amount: 150.25,
              price: { amount: 1, currency: 'usd' },
              decimals: 6
            }
          },
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 604, currency: 'usd' },
            name: 'Solana',
            symbol: 'SOL',
            data: {
              address: 'So11111111111111111111111111111111111111112',
              amount: 0.8,
              price: { amount: 755, currency: 'usd' },
              decimals: 9
            }
          }
        ],
        ref: '8JnNWJ2RVdbNspU4QNP7mZ6xWn4XjGYcuEys8LSNaVK3',
        sourceRefs: [
          {
            address: '8JnNWJ2RVdbNspU4QNP7mZ6xWn4XjGYcuEys8LSNaVK3',
            name: 'Position'
          },
          {
            address: 'HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ',
            name: 'Pool'
          },
          {
            address: ORCA_PROGRAM_ID,
            name: 'Program'
          }
        ]
      },
      {
        networkId: this.networkId,
        type: 'liquidity-position',
        value: { amount: 400, currency: 'usd' },
        attributes: {
          isDeprecated: false,
          tags: ['concentrated-liquidity', 'whirlpool']
        },
        name: 'ORCA-USDC',
        imageUri: 'https://www.orca.so/orca-logo.svg',
        data: {
          address: '3ktkKJSU1VPJWjEJgvoZmNSUTJXHwaw3EB3yXDvyUTAW',
          positionAddress: '5rYojLQ46VwzyTqfGjp8zMxmSKQNy6zM9e2KxDH6J5ZQ',
          fee: 0.001,
          lowerTick: -500,
          upperTick: 1500,
          liquidity: '9876543210',
          yield: {
            apr: 0.12,
            apy: 0.13
          }
        },
        baseTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 100, currency: 'usd' },
            name: 'Orca',
            symbol: 'ORCA',
            data: {
              address: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
              amount: 100,
              price: { amount: 1, currency: 'usd' },
              decimals: 6
            }
          },
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 300, currency: 'usd' },
            name: 'USD Coin',
            symbol: 'USDC',
            data: {
              address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              amount: 300,
              price: { amount: 1, currency: 'usd' },
              decimals: 6
            }
          }
        ],
        ref: '5rYojLQ46VwzyTqfGjp8zMxmSKQNy6zM9e2KxDH6J5ZQ',
        sourceRefs: [
          {
            address: '5rYojLQ46VwzyTqfGjp8zMxmSKQNy6zM9e2KxDH6J5ZQ',
            name: 'Position'
          },
          {
            address: '3ktkKJSU1VPJWjEJgvoZmNSUTJXHwaw3EB3yXDvyUTAW',
            name: 'Pool'
          },
          {
            address: ORCA_PROGRAM_ID,
            name: 'Program'
          }
        ]
      }
    ];
  }
}

// Exporter une instance
module.exports = new OrcaFetcher();