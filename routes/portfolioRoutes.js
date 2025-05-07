const express = require('express');
const router = express.Router();
const ResponseUtils = require('../utils/responseUtils');
const portfolioAssetsService = require('../services/portfolioAssetsService');
const cacheService = require('../services/cacheService');
const { cacheMiddleware } = require('../utils/middlewareUtils');

/**
 * Fonction utilitaire pour récupérer les données du portefeuille avec les options spécifiées
 */
const getPortfolioData = async (walletAddress, network, options = {}) => {
  const defaultOptions = {
    includeNFTs: false,
    includeTransactions: false,
    includeStaking: true,
    includeProtocols: true,
    network
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  return await portfolioAssetsService.getAllPortfolioAssets(walletAddress, mergedOptions);
};

/**
 * @route GET /api/portfolio/:walletAddress
 * @desc Récupère toutes les informations du portefeuille pour une adresse Solana
 * @params {boolean} includeNFTs - Inclure les NFTs dans la réponse
 * @params {boolean} includeTransactions - Inclure l'historique des transactions
 * @params {boolean} includeStaking - Inclure les données de staking
 * @params {boolean} includeProtocols - Inclure les données des protocoles
 * @params {string} network - Réseau à utiliser (mainnet, devnet)
 */
router.get('/:walletAddress', 
  cacheMiddleware({ dataType: 'all' }), 
  async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const { 
        network = 'mainnet',
        includeNFTs = false, 
        includeTransactions = false,
        includeStaking = true,
        includeProtocols = true,
        timeout = 30000  // Ajout d'un paramètre de timeout
      } = req.query;
      
      console.log(`Récupération du portefeuille: ${walletAddress} sur ${network}`);
      
      const options = {
        includeNFTs: includeNFTs === 'true' || includeNFTs === true,
        includeTransactions: includeTransactions === 'true' || includeTransactions === true,
        includeStaking: includeStaking !== 'false' && includeStaking !== false,
        includeProtocols: includeProtocols !== 'false' && includeProtocols !== false,
        network,
        timeout: parseInt(timeout, 10) || 30000
      };

      const portfolioData = await getPortfolioData(walletAddress, network, options);
      
      // Mettre en cache les résultats pour les futures requêtes
      try {
        cacheService.setWalletData(walletAddress, portfolioData);
      } catch (cacheError) {
        console.warn(`Impossible de mettre en cache les données du portefeuille: ${cacheError.message}`);
      }
      
      res.json(ResponseUtils.success(portfolioData));
    } catch (error) {
      console.error('Erreur lors de la récupération du portefeuille:', error);
      res.status(500).json(ResponseUtils.error('Erreur lors de la récupération du portefeuille', error.message));
    }
  }
);

/**
 * @route GET /api/portfolio/portfolio-exact/:walletAddress
 * @desc Endpoint optimisé pour récupérer les données exactes du portefeuille
 */
router.get('/portfolio-exact/:walletAddress',
  cacheMiddleware({ dataType: 'exact' }),
  async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const {
        network = 'mainnet',
        include_nfts = false,
        include_staked = true,
        timeout = 30000
      } = req.query;
      
      console.log(`Récupération du portefeuille exact: ${walletAddress} sur ${network}`);
      
      const options = {
        includeNFTs: include_nfts === 'true' || include_nfts === true,
        includeStaking: include_staked !== 'false' && include_staked !== false,
        includeTransactions: false,
        includeProtocols: true,
        network,
        timeout: parseInt(timeout, 10) || 30000
      };
      
      const portfolioData = await getPortfolioData(walletAddress, network, options);
      
      // Mettre en cache les résultats pour les futures requêtes
      try {
        cacheService.setWalletData(walletAddress, portfolioData);
      } catch (cacheError) {
        console.warn(`Impossible de mettre en cache les données du portefeuille: ${cacheError.message}`);
      }
      
      res.json(ResponseUtils.success(portfolioData));
    } catch (error) {
      console.error('Erreur lors de la récupération du portefeuille exact:', error);
      res.status(500).json(ResponseUtils.error('Erreur lors de la récupération du portefeuille exact', error.message));
    }
  }
);

module.exports = router;