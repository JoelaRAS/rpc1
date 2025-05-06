/**
 * Fetcher de base pour les tokens détenus dans un portefeuille Solana
 * Implémenté selon l'architecture exacte du projet portfolio
 */
const { Fetcher, PLATFORM_TYPES } = require('../services/fetcherService');
const networkService = require('../services/networkService');
const solanaWebService = require('../services/solanaWebService');
const priceService = require('../services/priceService');
const cacheService = require('../services/cacheService');
const tokenMetadataService = require('../services/tokenMetadataService');
const alchemyService = require('../services/alchemyService');
const heliusService = require('../services/heliusService');

// Référence directe au réseau Solana
const SOLANA_NETWORK_ID = networkService.NETWORK_TYPES.SOLANA;
// Définir les détails du réseau Solana
const SOLANA_NETWORK = {
  decimals: 9 // Les SOL ont 9 décimales
};

class WalletFetcher extends Fetcher {
  constructor() {
    // ID unique, networkId, platformId, platformType (exactement comme portfolio)
    super('wallet-solana', SOLANA_NETWORK_ID, 'wallet', PLATFORM_TYPES.WALLET);
  }

  /**
   * Exécute le fetcher pour récupérer les tokens d'un portefeuille
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Éléments de portfolio pour les tokens
   */
  async execute(owner) {
    console.log(`[WalletFetcher] Récupération des tokens pour ${owner}`);
    
    // Structure d'élément portfolio que nous allons retourner
    const portfolioElement = {
      networkId: this.networkId,
      platformId: this.platformId,
      type: 'multiple',
      label: 'Wallet',
      name: 'Solana Wallet',
      value: { amount: 0, currency: 'usd' },
      data: {
        assets: [],
        ref: owner
      }
    };

    try {
      // 1. Récupérer le solde SOL natif
      let nativeBalance;
      try {
        const balances = await alchemyService.getBalances(owner);
        nativeBalance = balances.nativeBalance;
      } catch (error) {
        console.warn(`[WalletFetcher] Erreur lors de la récupération du solde SOL via Alchemy: ${error.message}`);
        // Essayer une alternative si disponible
        try {
          const solBalance = await solanaWebService.getSolBalance(owner);
          nativeBalance = {
            lamports: solBalance.lamports,
            solAmount: solBalance.sol
          };
        } catch (fallbackError) {
          console.error(`[WalletFetcher] Échec de la récupération du solde SOL: ${fallbackError.message}`);
          nativeBalance = { lamports: 0, solAmount: 0 };
        }
      }

      // 2. Récupérer tous les tokens SPL
      let tokenAccounts = [];
      try {
        // Essayer d'abord avec Helius
        tokenAccounts = await heliusService.getTokenBalances(owner);
      } catch (error) {
        console.warn(`[WalletFetcher] Erreur lors de la récupération des tokens via Helius: ${error.message}`);
        // Essayer avec Alchemy comme fallback
        try {
          const alchemyBalances = await alchemyService.getBalances(owner);
          if (alchemyBalances.tokenAccounts && Array.isArray(alchemyBalances.tokenAccounts)) {
            tokenAccounts = alchemyBalances.tokenAccounts;
          }
        } catch (fallbackError) {
          console.error(`[WalletFetcher] Échec de la récupération des tokens: ${fallbackError.message}`);
          // Continuer avec un tableau vide
        }
      }

      // 3. Traiter les tokens SPL
      const formattedTokens = this._formatTokenAccounts(tokenAccounts);
      
      // 4. Ajouter le SOL natif comme un token spécial
      const solAsset = this._createSolAsset(nativeBalance);
      
      // 5. Récupérer les prix de tous les tokens, y compris SOL
      const allTokenAssets = [solAsset, ...formattedTokens];
      await this._enrichWithPrices(allTokenAssets);
      
      // 6. Calculer la valeur totale du portefeuille
      const totalValue = allTokenAssets.reduce((total, asset) => {
        if (asset.value && asset.value.amount) {
          return total + asset.value.amount;
        }
        return total;
      }, 0);
      
      // 7. Mettre à jour l'élément de portfolio
      portfolioElement.data.assets = allTokenAssets;
      portfolioElement.value = { amount: totalValue, currency: 'usd' };
      
      return [portfolioElement];
    } catch (error) {
      console.error(`[WalletFetcher] Erreur dans l'exécution: ${error.message}`);
      return [portfolioElement]; // Retourner quand même l'élément, même vide
    }
  }

  /**
   * Formate les comptes de tokens en assets de portfolio
   * @private
   * @param {Array} tokenAccounts - Comptes de tokens
   * @returns {Array} - Assets de portfolio
   */
  _formatTokenAccounts(tokenAccounts) {
    if (!Array.isArray(tokenAccounts) || tokenAccounts.length === 0) {
      return [];
    }
    
    return tokenAccounts
      .filter(account => {
        try {
          // Gestion de différents formats possibles
          if (account.account?.data?.parsed?.info?.tokenAmount) {
            const tokenAmount = account.account.data.parsed.info.tokenAmount;
            return tokenAmount.uiAmount > 0;
          } else if (account.tokenAmount) {
            return account.tokenAmount.uiAmount > 0;
          }
          return false;
        } catch (error) {
          return false;
        }
      })
      .map(account => {
        let mintAddress, tokenAmount;
        
        // Gérer différents formats de données possibles
        if (account.account?.data?.parsed?.info) {
          // Format Helius
          const tokenInfo = account.account.data.parsed.info;
          mintAddress = tokenInfo.mint;
          tokenAmount = tokenInfo.tokenAmount;
        } else if (account.mint) {
          // Format Alchemy
          mintAddress = account.mint;
          tokenAmount = account.tokenAmount;
        } else {
          // Format inconnu, utiliser des valeurs par défaut
          mintAddress = 'unknown';
          tokenAmount = { uiAmount: 0, decimals: 0 };
        }
        
        // Structure d'asset conforme à celle du projet portfolio
        return {
          networkId: this.networkId,
          type: 'token',
          value: { amount: 0, currency: 'usd' },
          attributes: {
            isDeprecated: false,
            isClaimable: false,
            tags: []
          },
          data: {
            address: mintAddress,
            amount: tokenAmount.uiAmount || 0,
            price: { amount: 0, currency: 'usd' },
            decimals: tokenAmount.decimals || 0
          }
        };
      });
  }

  /**
   * Crée un asset pour SOL au format de portfolio
   * @private
   * @param {Object} nativeBalance - Solde natif SOL
   * @returns {Object} - Asset SOL
   */
  _createSolAsset(nativeBalance) {
    return {
      networkId: this.networkId,
      type: 'token',
      value: { amount: 0, currency: 'usd' },
      attributes: {
        isDeprecated: false,
        isClaimable: false,
        tags: ['native']
      },
      name: 'Solana',
      symbol: 'SOL',
      imageUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      data: {
        address: 'So11111111111111111111111111111111111111112', // Adresse du Wrapped SOL
        amount: nativeBalance.solAmount || 0,
        price: { amount: 0, currency: 'usd' },
        decimals: SOLANA_NETWORK.decimals // Correction ici aussi
      }
    };
  }

  /**
   * Enrichit les assets avec leurs prix et métadonnées
   * @private
   * @param {Array} assets - Assets à enrichir
   * @returns {Promise<void>}
   */
  async _enrichWithPrices(assets) {
    if (!Array.isArray(assets) || assets.length === 0) return;
    
    // Récupérer les prix en lots de 10 pour éviter de surcharger les APIs
    const batchSize = 10;
    
    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      const tokenAddresses = batch.map(asset => asset.data.address);
      
      // Promesses pour les prix et les métadonnées
      const pricePromises = tokenAddresses.map(address => {
        // Vérifier le cache d'abord
        const cacheKey = `price_${address}`;
        const cachedPrice = cacheService.get(cacheKey);
        
        if (cachedPrice) {
          return Promise.resolve(cachedPrice);
        }
        
        // Sinon, récupérer le prix
        return priceService.getCurrentPrice(address)
          .then(result => {
            if (result && result.price) {
              // Mettre en cache pour 5 minutes
              cacheService.set(cacheKey, result, 300);
              return result;
            }
            return null;
          })
          .catch(() => null);
      });
      
      const tokenInfoPromises = tokenAddresses.map(address => {
        // Vérifier le cache d'abord
        const cacheKey = `metadata_${address}`;
        const cachedInfo = cacheService.getLong(cacheKey);
        
        if (cachedInfo) {
          return Promise.resolve(cachedInfo);
        }
        
        // Récupérer les métadonnées
        return priceService.getTokenInfo(address)
          .then(result => {
            if (result) {
              // Mettre en cache pour 24 heures
              cacheService.setLong(cacheKey, result);
              return result;
            }
            return null;
          })
          .catch(() => null);
      });
      
      // Attendre toutes les promesses
      const [priceResults, metadataResults] = await Promise.all([
        Promise.all(pricePromises),
        Promise.all(tokenInfoPromises)
      ]);
      
      // Mettre à jour les tokens avec les prix et métadonnées
      for (let j = 0; j < batch.length; j++) {
        const asset = batch[j];
        const priceResult = priceResults[j];
        const metadataResult = metadataResults[j];
        
        // Mettre à jour avec le prix
        if (priceResult && priceResult.price) {
          asset.data.price = {
            amount: priceResult.price,
            currency: 'usd'
          };
          
          // Mettre à jour la valeur de l'asset
          asset.value = {
            amount: priceResult.price * asset.data.amount,
            currency: 'usd'
          };
        }
        
        // Mettre à jour avec les métadonnées
        if (metadataResult) {
          asset.name = metadataResult.name || asset.name || 'Unknown Token';
          asset.symbol = metadataResult.symbol || asset.symbol || 'UNKNOWN';
          asset.imageUri = metadataResult.logoURI || asset.imageUri || null;
          
          // Ajouter les décimales si pas déjà définies
          if (!asset.data.decimals && metadataResult.decimals) {
            asset.data.decimals = metadataResult.decimals;
          }
        }
      }
    }
  }
}

// Exporter une instance
module.exports = new WalletFetcher();