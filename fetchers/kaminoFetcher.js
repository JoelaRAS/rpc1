/**
 * Fetcher spécifique pour la plateforme Kamino (staking & farming) sur Solana
 * Implémenté selon l'architecture exacte du projet portfolio
 */
const { Fetcher, PLATFORM_TYPES } = require('../services/fetcherService');
const networkService = require('../services/networkService');
const kaminoFetcher = require('../services/kaminoService');
const priceService = require('../services/priceService');
const cacheService = require('../services/cacheService');
const solanaWebService = require('../services/solanaWebService');

// Constantes spécifiques à Kamino
const KAMINO_PROGRAM_ID = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';
const KAMINO_STAKING_ID = 'KaminoKSsxB3Qy4xFj8gcDUCMJv8Up1twwAy7W7eiEwp';
const KAMINO_TOKEN = 'KPTV4LYACCm72jPKpEMEYNYVBmNTyA2xLYSYGKSrYCi';

// Référence directe au réseau Solana
const SOLANA_NETWORK_ID = networkService.NETWORK_TYPES.SOLANA;

class KaminoFetcher extends Fetcher {
  constructor() {
    // ID unique, networkId, platformId, platformType (exactement comme portfolio)
    super('kamino-solana', SOLANA_NETWORK_ID, 'kamino', PLATFORM_TYPES.LENDING);
  }

  /**
   * Exécute le fetcher pour récupérer les positions Kamino
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Éléments de portfolio pour Kamino
   */
  async execute(owner) {
    console.log(`[KaminoFetcher] Récupération des positions Kamino pour ${owner}`);
    
    // Vérifier le cache d'abord
    const cacheKey = `kamino_${owner}`;
    const cachedData = cacheService.get(cacheKey);
    
    if (cachedData) {
      console.log(`[KaminoFetcher] Données récupérées depuis le cache pour ${owner}`);
      return cachedData;
    }
    
    try {
      // Récupérer les différentes positions Kamino
      const lendingPositions = await this._fetchLendingPositions(owner);
      const stakingPositions = await this._fetchStakingPositions(owner);
      const vaultPositions = await this._fetchVaultPositions(owner);
      
      // Combiner tous les résultats
      const allPositions = [...lendingPositions, ...stakingPositions, ...vaultPositions];
      
      // Si aucun élément de portfolio n'est trouvé, retourner un tableau vide
      if (allPositions.length === 0) {
        console.log(`[KaminoFetcher] Aucune position Kamino trouvée pour ${owner}`);
        return [];
      }
      
      // Mettre en cache pour 5 minutes
      cacheService.set(cacheKey, allPositions, 300);
      
      return allPositions;
    } catch (error) {
      console.error(`[KaminoFetcher] Erreur dans l'exécution: ${error.message}`);
      return []; // Retourner un tableau vide en cas d'erreur
    }
  }
  
  /**
   * Récupère les positions de lending (prêt/emprunt) de l'utilisateur
   * @private
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Positions de lending formatées
   */
  async _fetchLendingPositions(owner) {
    try {
      console.log(`[KaminoFetcher] Récupération des positions de lending pour ${owner}`);
      
      // Récupérer les positions de lending via le service Kamino
      const lendingPositions = await kaminoFetcher.getLendingPositions(owner);
      
      if (!lendingPositions || lendingPositions.length === 0) {
        console.log(`[KaminoFetcher] Aucune position de lending trouvée pour ${owner}`);
        return [];
      }
      
      console.log(`[KaminoFetcher] ${lendingPositions.length} positions de lending trouvées pour ${owner}`);
      
      // Formater les positions selon le format portfolio.js
      const portfolioElements = [];
      
      for (const position of lendingPositions) {
        try {
          // Récupération du prix du token
          const tokenPrice = await this._getPrice(position.tokenMint);
          
          // Calcul des valeurs
          const tokenValue = position.amount * tokenPrice;
          
          // Structure d'élément portfolio pour une position de lending
          const portfolioElement = {
            networkId: this.networkId,
            platformId: this.platformId,
            type: position.isDeposit ? 'lending-deposit' : 'lending-borrow',
            label: position.isDeposit ? 'Lending Deposit' : 'Lending Borrow',
            name: `Kamino ${position.tokenSymbol}`,
            value: { amount: tokenValue, currency: 'usd' },
            attributes: {
              isCollateral: position.isCollateral || false,
              isLiquidating: position.isLiquidating || false,
              healthFactor: position.healthFactor || null,
              tags: [position.isDeposit ? 'deposit' : 'borrow', 'kamino-lending']
            },
            data: {
              apy: position.apy || 0,
              tokenMint: position.tokenMint,
              amount: position.amount,
              pool: position.pool,
              ref: position.address || owner,
              sourceRefs: [
                {
                  address: position.address || owner,
                  name: 'Position'
                },
                {
                  address: position.pool || KAMINO_PROGRAM_ID,
                  name: 'Pool'
                },
                {
                  address: KAMINO_PROGRAM_ID,
                  name: 'Program'
                }
              ],
              link: `https://kamino.finance/lending`
            },
            baseTokens: [
              {
                networkId: this.networkId,
                type: 'token',
                value: { amount: tokenValue, currency: 'usd' },
                name: position.tokenName || 'Unknown Token',
                symbol: position.tokenSymbol || 'Unknown',
                data: {
                  address: position.tokenMint,
                  amount: position.amount,
                  price: { amount: tokenPrice, currency: 'usd' },
                  decimals: position.decimals || 9
                }
              }
            ]
          };
          
          portfolioElements.push(portfolioElement);
        } catch (positionError) {
          console.error(`[KaminoFetcher] Erreur lors du traitement d'une position de lending: ${positionError.message}`);
          // Continuer avec les autres positions
        }
      }
      
      return portfolioElements;
      
    } catch (error) {
      console.warn(`[KaminoFetcher] Erreur lors de la récupération des positions de lending: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Récupère les positions de staking de l'utilisateur
   * @private
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Positions de staking formatées
   */
  async _fetchStakingPositions(owner) {
    try {
      console.log(`[KaminoFetcher] Récupération des positions de staking pour ${owner}`);
      
      // Récupérer les positions de staking via le service Kamino
      const stakingPositions = await kaminoFetcher.getStakingPositions(owner);
      
      if (!stakingPositions || stakingPositions.length === 0) {
        console.log(`[KaminoFetcher] Aucune position de staking trouvée pour ${owner}`);
        return [];
      }
      
      console.log(`[KaminoFetcher] ${stakingPositions.length} positions de staking trouvées pour ${owner}`);
      
      // Formater les positions selon le format portfolio.js
      const portfolioElements = [];
      
      for (const position of stakingPositions) {
        try {
          // Récupération du prix du token
          const tokenPrice = await this._getPrice(KAMINO_TOKEN);
          
          // Calcul des valeurs
          const tokenValue = position.amount * tokenPrice;
          
          // Structure d'élément portfolio pour une position de staking
          const portfolioElement = {
            networkId: this.networkId,
            platformId: this.platformId,
            type: 'staking',
            label: 'Staking',
            name: 'Kamino Staking',
            value: { amount: tokenValue, currency: 'usd' },
            attributes: {
              tags: ['staking', 'kamino-staking']
            },
            data: {
              apy: position.apy || 0,
              lockupDuration: position.lockupDuration || 0,
              unlockTime: position.unlockTime || null,
              ref: position.address || owner,
              sourceRefs: [
                {
                  address: position.address || owner,
                  name: 'Position'
                },
                {
                  address: KAMINO_STAKING_ID,
                  name: 'Program'
                }
              ],
              link: `https://kamino.finance/staking`
            },
            baseTokens: [
              {
                networkId: this.networkId,
                type: 'token',
                value: { amount: tokenValue, currency: 'usd' },
                name: 'Kamino',
                symbol: 'KMNO',
                data: {
                  address: KAMINO_TOKEN,
                  amount: position.amount,
                  price: { amount: tokenPrice, currency: 'usd' },
                  decimals: 9
                }
              }
            ]
          };
          
          portfolioElements.push(portfolioElement);
        } catch (positionError) {
          console.error(`[KaminoFetcher] Erreur lors du traitement d'une position de staking: ${positionError.message}`);
          // Continuer avec les autres positions
        }
      }
      
      return portfolioElements;
      
    } catch (error) {
      console.warn(`[KaminoFetcher] Erreur lors de la récupération des positions de staking: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Récupère les positions de vault (LP farming) de l'utilisateur
   * @private
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Positions de vault formatées
   */
  async _fetchVaultPositions(owner) {
    try {
      console.log(`[KaminoFetcher] Récupération des positions de vault pour ${owner}`);
      
      // Récupérer les positions de vault via le service Kamino
      const vaultPositions = await kaminoFetcher.getVaultPositions(owner);
      
      if (!vaultPositions || vaultPositions.length === 0) {
        console.log(`[KaminoFetcher] Aucune position de vault trouvée pour ${owner}`);
        return [];
      }
      
      console.log(`[KaminoFetcher] ${vaultPositions.length} positions de vault trouvées pour ${owner}`);
      
      // Formater les positions selon le format portfolio.js
      const portfolioElements = [];
      
      for (const position of vaultPositions) {
        try {
          // Récupération des prix des tokens sous-jacents
          const token0Price = await this._getPrice(position.token0.mint);
          const token1Price = await this._getPrice(position.token1.mint);
          
          // Calcul des valeurs
          const token0Value = position.token0.amount * token0Price;
          const token1Value = position.token1.amount * token1Price;
          const totalValue = token0Value + token1Value;
          
          // Structure d'élément portfolio pour une position de vault
          const portfolioElement = {
            networkId: this.networkId,
            platformId: this.platformId,
            type: 'farming-position',
            label: 'LP Farming',
            name: `Kamino ${position.token0.symbol}-${position.token1.symbol}`,
            value: { amount: totalValue, currency: 'usd' },
            attributes: {
              isDeprecated: position.isDeprecated || false,
              tags: ['farming', 'kamino-vault']
            },
            data: {
              vaultAddress: position.vaultAddress,
              shareAmount: position.shareAmount,
              shareValue: position.shareValue,
              apy: position.apy || 0,
              strategy: position.strategy || 'Neutral',
              ref: position.userPosition || owner,
              sourceRefs: [
                {
                  address: position.userPosition || owner,
                  name: 'Position'
                },
                {
                  address: position.vaultAddress,
                  name: 'Vault'
                }
              ],
              link: `https://kamino.finance/strategies/${position.vaultAddress}`
            },
            baseTokens: [
              {
                networkId: this.networkId,
                type: 'token',
                value: { amount: token0Value, currency: 'usd' },
                name: position.token0.name || 'Unknown Token',
                symbol: position.token0.symbol || 'Unknown',
                data: {
                  address: position.token0.mint,
                  amount: position.token0.amount,
                  price: { amount: token0Price, currency: 'usd' },
                  decimals: position.token0.decimals || 9
                }
              },
              {
                networkId: this.networkId,
                type: 'token',
                value: { amount: token1Value, currency: 'usd' },
                name: position.token1.name || 'Unknown Token',
                symbol: position.token1.symbol || 'Unknown',
                data: {
                  address: position.token1.mint,
                  amount: position.token1.amount,
                  price: { amount: token1Price, currency: 'usd' },
                  decimals: position.token1.decimals || 9
                }
              }
            ]
          };
          
          portfolioElements.push(portfolioElement);
        } catch (positionError) {
          console.error(`[KaminoFetcher] Erreur lors du traitement d'une position de vault: ${positionError.message}`);
          // Continuer avec les autres positions
        }
      }
      
      return portfolioElements;
      
    } catch (error) {
      console.warn(`[KaminoFetcher] Erreur lors de la récupération des positions de vault: ${error.message}`);
      
      // Plan B : utiliser des données simulées si configuré
      if (process.env.USE_SIMULATED_DATA === 'true') {
        console.log(`[KaminoFetcher] Utilisation de données simulées pour ${owner}`);
        return this._getSimulatedVaultPositions();
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
      console.warn(`[KaminoFetcher] Erreur lors de la récupération du prix pour ${tokenAddress}: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Génère des données de positions de vault simulées pour les tests
   * @private
   * @returns {Array} - Positions de vault simulées
   */
  _getSimulatedVaultPositions() {
    // Positions simulées pour les tests
    return [
      {
        networkId: this.networkId,
        platformId: this.platformId,
        type: 'farming-position',
        label: 'LP Farming',
        name: 'Kamino USDC-SOL',
        value: { amount: 1500, currency: 'usd' },
        attributes: {
          isDeprecated: false,
          tags: ['farming', 'kamino-vault']
        },
        data: {
          vaultAddress: 'simu-vault-address-1',
          shareAmount: 150,
          shareValue: 10,
          apy: 0.12,
          strategy: 'Delta-Neutral',
          ref: 'simu-position-address-1',
          sourceRefs: [
            {
              address: 'simu-position-address-1',
              name: 'Position'
            },
            {
              address: 'simu-vault-address-1',
              name: 'Vault'
            }
          ],
          link: `https://kamino.finance/strategies/simu-vault-address-1`
        },
        baseTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 750, currency: 'usd' },
            name: 'USD Coin',
            symbol: 'USDC',
            data: {
              address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              amount: 750,
              price: { amount: 1, currency: 'usd' },
              decimals: 6
            }
          },
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 750, currency: 'usd' },
            name: 'Solana',
            symbol: 'SOL',
            data: {
              address: 'So11111111111111111111111111111111111111112',
              amount: 1,
              price: { amount: 750, currency: 'usd' },
              decimals: 9
            }
          }
        ]
      },
      {
        networkId: this.networkId,
        platformId: this.platformId,
        type: 'farming-position',
        label: 'LP Farming',
        name: 'Kamino USDT-USDC',
        value: { amount: 2000, currency: 'usd' },
        attributes: {
          isDeprecated: false,
          tags: ['farming', 'kamino-vault', 'stablecoin']
        },
        data: {
          vaultAddress: 'simu-vault-address-2',
          shareAmount: 1950,
          shareValue: 1.025641,
          apy: 0.05,
          strategy: 'Neutral',
          ref: 'simu-position-address-2',
          sourceRefs: [
            {
              address: 'simu-position-address-2',
              name: 'Position'
            },
            {
              address: 'simu-vault-address-2',
              name: 'Vault'
            }
          ],
          link: `https://kamino.finance/strategies/simu-vault-address-2`
        },
        baseTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 1000, currency: 'usd' },
            name: 'USD Coin',
            symbol: 'USDC',
            data: {
              address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              amount: 1000,
              price: { amount: 1, currency: 'usd' },
              decimals: 6
            }
          },
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: 1000, currency: 'usd' },
            name: 'Tether USD',
            symbol: 'USDT',
            data: {
              address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
              amount: 1000,
              price: { amount: 1, currency: 'usd' },
              decimals: 6
            }
          }
        ]
      }
    ];
  }
}

// Exporter une instance
module.exports = new KaminoFetcher();