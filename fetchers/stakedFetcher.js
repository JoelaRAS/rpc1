/**
 * Fetcher pour les stakes SOL natifs sur Solana
 * Implémenté selon l'architecture exacte du projet portfolio
 */
const { Fetcher, PLATFORM_TYPES } = require('../services/fetcherService');
const networkService = require('../services/networkService');
const solanaWebService = require('../services/solanaWebService');
const priceService = require('../services/priceService');
const cacheService = require('../services/cacheService');

// Référence directe au réseau Solana
const SOLANA_NETWORK_ID = networkService.NETWORK_TYPES.SOLANA;

class StakedFetcher extends Fetcher {
  constructor() {
    // ID unique, networkId, platformId, platformType (exactement comme portfolio)
    super('staked-solana', SOLANA_NETWORK_ID, 'solana', PLATFORM_TYPES.STAKING);
  }

  /**
   * Exécute le fetcher pour récupérer les positions de staking SOL natif
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Éléments de portfolio pour le staking
   */
  async execute(owner) {
    console.log(`[StakedFetcher] Récupération des positions de staking standard pour ${owner}`);
    
    // Vérifier le cache d'abord
    const cacheKey = `staked_${owner}`;
    const cachedData = cacheService.get(cacheKey);
    
    if (cachedData) {
      console.log(`[StakedFetcher] Données récupérées depuis le cache pour ${owner}`);
      return cachedData;
    }
    
    try {
      // Récupérer les comptes de stake standards (non associés à d'autres protocoles)
      const stakeAccounts = await this._fetchStandardStakeAccounts(owner);
      
      // Si aucun compte de stake n'est trouvé, retourner un tableau vide
      if (stakeAccounts.length === 0) {
        console.log(`[StakedFetcher] Aucun compte de stake standard trouvé pour ${owner}`);
        return [];
      }
      
      // Formater les positions de stake en éléments de portfolio
      const portfolioElements = await this._formatStakesAsPortfolioElements(stakeAccounts, owner);
      
      // Mettre en cache pour 5 minutes
      cacheService.set(cacheKey, portfolioElements, 300);
      
      return portfolioElements;
    } catch (error) {
      console.error(`[StakedFetcher] Erreur dans l'exécution: ${error.message}`);
      return []; // Retourner un tableau vide en cas d'erreur
    }
  }
  
  /**
   * Récupère les comptes de stake standard (non associés à d'autres protocoles)
   * @private
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Comptes de stake
   */
  async _fetchStandardStakeAccounts(owner) {
    try {
      console.log(`[StakedFetcher] Récupération des comptes de stake pour ${owner}`);
      
      // Récupérer tous les comptes de stake via solanaWebService
      const allStakeAccounts = await solanaWebService.getStakeAccountsByOwner(owner);
      
      // Filtrer pour exclure les comptes gérés par des protocoles comme Marinade ou Jito
      const specialStakingPrograms = [
        'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD', // Marinade
        'jito11111111111111111111111111111111111111' // Jito
      ];
      
      const standardStakeAccounts = allStakeAccounts.filter(account => 
        // On ne garde que les comptes dont le withdrawer est le propriétaire lui-même
        // ou qui ne sont pas gérés par des protocoles connus
        (account.withdrawer === owner || 
         !specialStakingPrograms.includes(account.withdrawer))
      );
      
      console.log(`[StakedFetcher] ${standardStakeAccounts.length} comptes de stake standard trouvés pour ${owner}`);
      return standardStakeAccounts;
    } catch (error) {
      console.warn(`[StakedFetcher] Erreur lors de la récupération des comptes de stake: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Formate les comptes de stake en éléments de portfolio
   * @private
   * @param {Array} stakeAccounts - Comptes de stake
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Éléments de portfolio pour le staking
   */
  async _formatStakesAsPortfolioElements(stakeAccounts, owner) {
    // Récupérer le prix du SOL
    let solPrice = 0;
    try {
      const priceData = await priceService.getCurrentPrice('So11111111111111111111111111111111111111112');
      solPrice = priceData?.price || 0;
    } catch (error) {
      console.warn(`[StakedFetcher] Erreur lors de la récupération du prix du SOL: ${error.message}`);
    }
    
    // Regrouper les comptes de stake par validateur
    const stakesByValidator = {};
    
    for (const account of stakeAccounts) {
      const validatorPubkey = account.voter || 'unknown';
      
      if (!stakesByValidator[validatorPubkey]) {
        stakesByValidator[validatorPubkey] = {
          validator: validatorPubkey,
          name: this._getValidatorName(validatorPubkey),
          accounts: [],
          totalAmount: 0
        };
      }
      
      stakesByValidator[validatorPubkey].accounts.push(account);
      stakesByValidator[validatorPubkey].totalAmount += parseFloat(account.amount);
    }
    
    // Créer un élément de portfolio pour chaque validateur
    const portfolioElements = [];
    
    for (const validatorPubkey in stakesByValidator) {
      const validatorGroup = stakesByValidator[validatorPubkey];
      const totalValue = validatorGroup.totalAmount * solPrice;
      
      // Structure d'élément portfolio pour une position de staking
      const portfolioElement = {
        networkId: this.networkId,
        platformId: this.platformId,
        type: 'staking',
        label: 'Staking',
        name: `Staked SOL (${validatorGroup.name})`,
        value: { amount: totalValue, currency: 'usd' },
        attributes: {
          stakingType: 'delegated',
          stakingToken: 'sol',
          validatorCount: validatorGroup.accounts.length,
          tags: ['staking', 'solana-stake']
        },
        data: {
          validator: validatorGroup.validator,
          validatorName: validatorGroup.name,
          totalStaked: validatorGroup.totalAmount,
          apy: 0.065, // APY approximatif pour le staking SOL natif
          accounts: validatorGroup.accounts.map(acc => ({
            address: acc.address,
            amount: parseFloat(acc.amount),
            status: acc.status,
            activationEpoch: acc.activationEpoch
          })),
          ref: owner,
          sourceRefs: validatorGroup.accounts.map(acc => ({
            address: acc.address,
            name: 'Stake Account'
          }))
        },
        baseTokens: [
          {
            networkId: this.networkId,
            type: 'token',
            value: { amount: totalValue, currency: 'usd' },
            name: 'Solana',
            symbol: 'SOL',
            data: {
              address: 'So11111111111111111111111111111111111111112',
              amount: validatorGroup.totalAmount,
              price: { amount: solPrice, currency: 'usd' },
              decimals: 9
            }
          }
        ]
      };
      
      portfolioElements.push(portfolioElement);
    }
    
    return portfolioElements;
  }
  
  /**
   * Récupère le nom d'un validateur à partir de son adresse publique
   * @private
   * @param {string} validatorPubkey - Clé publique du validateur
   * @returns {string} - Nom du validateur
   */
  _getValidatorName(validatorPubkey) {
    // Dans une implémentation réelle, on interrogerait une API pour récupérer le nom du validateur
    // Pour la simplicité, on retourne un nom générique
    if (validatorPubkey === 'unknown') return 'Unknown Validator';
    
    // Simuler quelques validateurs connus
    const knownValidators = {
      'Voter1YarYYC7fzNpjgSVHvJ6xzUQu22Xtg9rJCr3JMD': 'Solana Foundation',
      'Voter1111111111111111111111111111111111111': 'Chorus One',
      'Voter2222222222222222222222222222222222222': 'Certus One',
      'Voter3333333333333333333333333333333333333': 'Staking Facilities'
    };
    
    return knownValidators[validatorPubkey] || `Validator ${validatorPubkey.slice(0, 6)}...${validatorPubkey.slice(-4)}`;
  }
}

// Exporter une instance
module.exports = new StakedFetcher();