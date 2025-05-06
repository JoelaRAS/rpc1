/**
 * Fetcher spécifique pour la plateforme Marinade (staking liquide) sur Solana
 * Implémenté selon l'architecture exacte du projet portfolio
 */
const { Fetcher, PLATFORM_TYPES } = require('../services/fetcherService');
const networkService = require('../services/networkService');
const marinadeService = require('../services/marinadeService');
const priceService = require('../services/priceService');
const cacheService = require('../services/cacheService');
const solanaWebService = require('../services/solanaWebService');

// Constantes spécifiques à Marinade
const MARINADE_PROGRAM_ID = 'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD';
const MSOL_TOKEN = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';

// Référence directe au réseau Solana
const SOLANA_NETWORK_ID = networkService.NETWORK_TYPES.SOLANA;

class MarinadeFetcher extends Fetcher {
  constructor() {
    // ID unique, networkId, platformId, platformType (exactement comme portfolio)
    super('marinade-solana', SOLANA_NETWORK_ID, 'marinade', PLATFORM_TYPES.STAKING);
  }

  /**
   * Exécute le fetcher pour récupérer les positions Marinade
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Éléments de portfolio pour Marinade
   */
  async execute(owner) {
    console.log(`[MarinadeFetcher] Récupération des positions Marinade pour ${owner}`);
    
    // Vérifier le cache d'abord
    const cacheKey = `marinade_${owner}`;
    const cachedData = cacheService.get(cacheKey);
    
    if (cachedData) {
      console.log(`[MarinadeFetcher] Données récupérées depuis le cache pour ${owner}`);
      return cachedData;
    }
    
    try {
      // 1. Récupérer les positions de staking mSOL
      const msolPositions = await this._fetchMsolPositions(owner);
      
      // Si aucun élément de portfolio n'est trouvé, retourner un tableau vide
      if (msolPositions.length === 0) {
        console.log(`[MarinadeFetcher] Aucune position Marinade trouvée pour ${owner}`);
        return [];
      }
      
      // Mettre en cache pour 5 minutes
      cacheService.set(cacheKey, msolPositions, 300);
      
      return msolPositions;
    } catch (error) {
      console.error(`[MarinadeFetcher] Erreur dans l'exécution: ${error.message}`);
      return []; // Retourner un tableau vide en cas d'erreur
    }
  }
  
  /**
   * Récupère les positions de staking mSOL de l'utilisateur
   * @private
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Positions de staking formatées
   */
  async _fetchMsolPositions(owner) {
    try {
      console.log(`[MarinadeFetcher] Récupération des positions mSOL pour ${owner}`);
      
      // 1. Récupérer les tokens mSOL détenus par l'utilisateur
      const tokenAccounts = await solanaWebService.getTokenAccountsByOwner(owner);
      
      // Filtrer pour ne garder que les tokens mSOL
      const msolAccounts = tokenAccounts.filter(account => 
        account.mint === MSOL_TOKEN && parseFloat(account.amount) > 0
      );
      
      if (msolAccounts.length === 0) {
        console.log(`[MarinadeFetcher] Aucun token mSOL trouvé pour ${owner}`);
        return [];
      }
      
      console.log(`[MarinadeFetcher] ${msolAccounts.length} tokens mSOL trouvés pour ${owner}`);
      
      // 2. Récupérer les détails de staking via le service Marinade
      const stakingDetails = await marinadeService.getStakingDetails();
      
      // 3. Formater les positions selon le format portfolio.js
      const portfolioElements = [];
      
      for (const account of msolAccounts) {
        try {
          // Récupération du prix de mSOL et SOL
          const msolPrice = await this._getPrice(MSOL_TOKEN);
          const solPrice = await this._getPrice('So11111111111111111111111111111111111111112');
          
          // Calcul des valeurs
          const msolAmount = parseFloat(account.uiAmount);
          const solAmount = msolAmount * stakingDetails.msolToSolRate;
          const msolValue = msolAmount * msolPrice;
          
          // Structure d'élément portfolio pour une position de staking mSOL
          const portfolioElement = {
            networkId: this.networkId,
            platformId: this.platformId,
            type: 'staking',
            label: 'Liquid Staking',
            name: 'Marinade mSOL',
            value: { amount: msolValue, currency: 'usd' },
            attributes: {
              stakingType: 'liquid',
              stakingToken: 'msol',
              tags: ['staking', 'liquid-staking', 'marinade']
            },
            data: {
              msolAddress: account.tokenAccountAddress,
              msolAmount: msolAmount,
              msolToSolRate: stakingDetails.msolToSolRate,
              apy: stakingDetails.apy * 100,
              ref: account.tokenAccountAddress,
              sourceRefs: [
                {
                  address: account.tokenAccountAddress,
                  name: 'Token Account'
                },
                {
                  address: MSOL_TOKEN,
                  name: 'Token'
                },
                {
                  address: MARINADE_PROGRAM_ID,
                  name: 'Program'
                }
              ],
              link: `https://marinade.finance/app/staking`
            },
            baseTokens: [
              {
                networkId: this.networkId,
                type: 'token',
                value: { amount: msolValue, currency: 'usd' },
                name: 'Marinade staked SOL',
                symbol: 'mSOL',
                data: {
                  address: MSOL_TOKEN,
                  amount: msolAmount,
                  price: { amount: msolPrice, currency: 'usd' },
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
          console.error(`[MarinadeFetcher] Erreur lors du traitement d'une position mSOL: ${positionError.message}`);
          // Continuer avec les autres positions
        }
      }
      
      // 4. Vérifier les stakes directs via Marinade (non-mSOL)
      try {
        const directStakes = await marinadeService.getDirectStakes(owner);
        
        if (directStakes && directStakes.length > 0) {
          console.log(`[MarinadeFetcher] ${directStakes.length} stakes directs trouvés pour ${owner}`);
          
          for (const stake of directStakes) {
            // Récupération du prix de SOL
            const solPrice = await this._getPrice('So11111111111111111111111111111111111111112');
            
            // Calcul des valeurs
            const solAmount = parseFloat(stake.amount);
            const solValue = solAmount * solPrice;
            
            // Structure d'élément portfolio pour une position de staking direct
            const portfolioElement = {
              networkId: this.networkId,
              platformId: this.platformId,
              type: 'staking',
              label: 'Direct Staking',
              name: 'Marinade Direct Stake',
              value: { amount: solValue, currency: 'usd' },
              attributes: {
                stakingType: 'direct',
                stakingToken: 'sol',
                tags: ['staking', 'direct-staking', 'marinade']
              },
              data: {
                stakeAddress: stake.address,
                solAmount: solAmount,
                activationEpoch: stake.activationEpoch,
                apy: stakingDetails.apy * 100,
                ref: stake.address,
                sourceRefs: [
                  {
                    address: stake.address,
                    name: 'Stake Account'
                  },
                  {
                    address: MARINADE_PROGRAM_ID,
                    name: 'Program'
                  }
                ],
                link: `https://marinade.finance/app/staking`
              },
              baseTokens: [
                {
                  networkId: this.networkId,
                  type: 'token',
                  value: { amount: solValue, currency: 'usd' },
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
          }
        }
      } catch (stakesError) {
        console.warn(`[MarinadeFetcher] Erreur lors de la récupération des stakes directs: ${stakesError.message}`);
        // Continuer avec les positions mSOL uniquement
      }
      
      return portfolioElements;
      
    } catch (error) {
      console.warn(`[MarinadeFetcher] Erreur lors de la récupération des positions mSOL: ${error.message}`);
      
      // Plan B : utiliser des données simulées si configuré
      if (process.env.USE_SIMULATED_DATA === 'true') {
        console.log(`[MarinadeFetcher] Utilisation de données simulées pour ${owner}`);
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
      console.warn(`[MarinadeFetcher] Erreur lors de la récupération du prix pour ${tokenAddress}: ${error.message}`);
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
    const msolPrice = 780; // Prix fictif du mSOL (légèrement supérieur à cause des récompenses)
    
    // Positions simulées pour les tests
    return [
      {
        networkId: this.networkId,
        platformId: this.platformId,
        type: 'staking',
        label: 'Liquid Staking',
        name: 'Marinade mSOL',
        value: { amount: 780, currency: 'usd' },
        attributes: {
          stakingType: 'liquid',
          stakingToken: 'msol',
          tags: ['staking', 'liquid-staking', 'marinade']
        },
        data: {
          msolAddress: 'simu-msol-token-account',
          msolAmount: 1,
          msolToSolRate: 1.04,
          apy: 6.8,
          ref: 'simu-msol-token-account',
          sourceRefs: [
            {
              address: 'simu-msol-token-account',
              name: 'Token Account'
            },
            {
              address: MSOL_TOKEN,
              name: 'Token'
            },
            {
              address: MARINADE_PROGRAM_ID,
              name: 'Program'
            }
          ],
          link: `https://marinade.finance/app/staking`
        },
        baseTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 780, currency: 'usd' },
            name: 'Marinade staked SOL',
            symbol: 'mSOL',
            data: {
              address: MSOL_TOKEN,
              amount: 1,
              price: { amount: msolPrice, currency: 'usd' },
              decimals: 9
            }
          }
        ],
        underlyingTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 780, currency: 'usd' },
            name: 'Solana',
            symbol: 'SOL',
            data: {
              address: 'So11111111111111111111111111111111111111112',
              amount: 1.04,
              price: { amount: solPrice, currency: 'usd' },
              decimals: 9
            }
          }
        ]
      },
      {
        networkId: this.networkId,
        platformId: this.platformId,
        type: 'staking',
        label: 'Direct Staking',
        name: 'Marinade Direct Stake',
        value: { amount: 1500, currency: 'usd' },
        attributes: {
          stakingType: 'direct',
          stakingToken: 'sol',
          tags: ['staking', 'direct-staking', 'marinade']
        },
        data: {
          stakeAddress: 'simu-stake-account',
          solAmount: 2,
          activationEpoch: 300,
          apy: 6.5,
          ref: 'simu-stake-account',
          sourceRefs: [
            {
              address: 'simu-stake-account',
              name: 'Stake Account'
            },
            {
              address: MARINADE_PROGRAM_ID,
              name: 'Program'
            }
          ],
          link: `https://marinade.finance/app/staking`
        },
        baseTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 1500, currency: 'usd' },
            name: 'Solana',
            symbol: 'SOL',
            data: {
              address: 'So11111111111111111111111111111111111111112',
              amount: 2,
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
module.exports = new MarinadeFetcher();