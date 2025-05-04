const express = require('express');
const router = express.Router();

const heliusService = require('../services/heliusService');
const alchemyService = require('../services/alchemyService');
const birdeyeService = require('../services/birdeyeService');
const jupiterService = require('../services/jupiterService');

/**
 * @route GET /api/portfolio/balances/:walletAddress
 * @description Récupère les soldes des tokens dans un portefeuille
 * @access Public
 */
router.get('/balances/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    
    // Récupération des tokens via Helius
    const tokenAccounts = await heliusService.getTokenBalances(walletAddress);
    
    // Récupération du solde SOL via Alchemy
    const solBalance = await alchemyService.getBalances(walletAddress);
    
    res.json({
      success: true,
      solBalance,
      tokenAccounts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/portfolio/assets/:walletAddress
 * @description Récupère tous les assets (tokens + NFTs) avec leurs valeurs
 * @access Public
 */
router.get('/assets/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    
    // Récupération des tokens via Helius
    let tokenAccounts = [];
    try {
      tokenAccounts = await heliusService.getTokenBalances(walletAddress);
    } catch (error) {
      console.error('Erreur lors de la récupération des tokens:', error);
      tokenAccounts = []; // Continuer avec un tableau vide en cas d'erreur
    }
    
    // Récupération du solde SOL via Alchemy
    let solBalance = { nativeBalance: { lamports: 0, solAmount: 0 } };
    try {
      solBalance = await alchemyService.getBalances(walletAddress);
    } catch (error) {
      console.error('Erreur lors de la récupération du solde SOL:', error);
      // Continuer avec la valeur par défaut
    }
    
    // Récupération des NFTs
    let nfts = [];
    try {
      nfts = await heliusService.getNFTsForOwner(walletAddress);
    } catch (error) {
      console.error('Erreur lors de la récupération des NFTs:', error);
      // Continuer avec un tableau vide en cas d'erreur
    }
    
    // Récupérer les adresses de tokens pour obtenir les prix
    const tokenAddresses = tokenAccounts
      .filter(account => account.account.data.parsed.info.tokenAmount.uiAmount > 0)
      .map(account => account.account.data.parsed.info.mint);
    
    // Récupération des prix via Birdeye pour tous les tokens
    let tokenPrices = {};
    if (tokenAddresses.length > 0) {
      try {
        tokenPrices = await birdeyeService.getMultipleTokenStats(tokenAddresses) || {};
      } catch (error) {
        console.error('Erreur lors de la récupération des prix des tokens:', error);
        // Continuer avec un objet vide en cas d'erreur
      }
    }
    
    // Construction de la réponse avec une gestion défensive des données manquantes
    const assets = {
      sol: solBalance || { nativeBalance: { lamports: 0, solAmount: 0 } },
      tokens: tokenAccounts.map(account => {
        const mintAddress = account.account.data.parsed.info.mint;
        return {
          mintAddress,
          tokenAmount: account.account.data.parsed.info.tokenAmount,
          price: tokenPrices[mintAddress] || { value: 0 }
        };
      }),
      nfts: nfts || []
    };
    
    res.json({
      success: true,
      assets
    });
  } catch (error) {
    console.error('Erreur générale dans la route assets:', error);
    // Répondre avec une structure de base en cas d'erreur majeure
    res.status(500).json({
      success: false,
      message: error.message,
      statusCode: 500,
      errors: null,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/portfolio/history/:walletAddress
 * @description Récupère l'historique des transactions d'un portefeuille
 * @access Public
 */
router.get('/history/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    const { limit = 100, before, fromBlock, toBlock, category } = req.query;
    
    // Options pour les transactions enrichies
    const options = {
      limit: parseInt(limit),
      before,
      fromBlock,
      toBlock,
      category
    };
    
    // Récupération de l'historique des transactions via Alchemy (plus détaillé)
    const transactions = await alchemyService.getEnrichedTransactions(walletAddress, options);
    
    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/portfolio/analysis/:walletAddress
 * @description Récupère une analyse complète du portefeuille
 * @access Public
 */
router.get('/analysis/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    const { days = 30 } = req.query;
    
    // Date d'aujourd'hui et date de début pour l'analyse historique
    const endTimestamp = Date.now();
    const startTimestamp = endTimestamp - (parseInt(days) * 24 * 60 * 60 * 1000);
    
    // Récupération des assets
    const tokenAccounts = await heliusService.getTokenBalances(walletAddress);
    const solBalance = await alchemyService.getBalances(walletAddress);
    
    // Filtrer les tokens avec un solde > 0
    const activeTokens = tokenAccounts
      .filter(account => account.account.data.parsed.info.tokenAmount.uiAmount > 0)
      .map(account => ({
        mintAddress: account.account.data.parsed.info.mint,
        amount: account.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: account.account.data.parsed.info.tokenAmount.decimals
      }));
    
    // Récupérer les prix actuels via Birdeye
    const tokenAddresses = activeTokens.map(token => token.mintAddress);
    let tokenPrices = {};
    
    if (tokenAddresses.length > 0) {
      tokenPrices = await birdeyeService.getMultipleTokenStats(tokenAddresses);
    }
    
    // Récupérer l'historique des prix pour chaque token
    const tokenHistoryPromises = activeTokens.map(token => 
      birdeyeService.getTokenPriceHistory(
        token.mintAddress, 
        startTimestamp, 
        endTimestamp, 
        days <= 7 ? '1H' : '1D'
      ).catch(() => ({ data: [] })) // Gestion des erreurs pour chaque token
    );
    
    const tokenHistoryResults = await Promise.all(tokenHistoryPromises);
    
    // Construire l'analyse
    const portfolioAnalysis = {
      currentValue: {
        sol: solBalance,
        tokens: activeTokens.map((token, index) => ({
          ...token,
          price: tokenPrices[token.mintAddress] || null,
          value: tokenPrices[token.mintAddress] ? 
                 tokenPrices[token.mintAddress].value * token.amount : null
        }))
      },
      historicalPerformance: {
        timeframe: `${days} jours`,
        startDate: new Date(startTimestamp).toISOString(),
        endDate: new Date(endTimestamp).toISOString(),
        tokens: activeTokens.map((token, index) => ({
          mintAddress: token.mintAddress,
          priceHistory: tokenHistoryResults[index].data || []
        }))
      },
      diversification: {
        totalAssets: activeTokens.length + 1, // +1 pour SOL
        assetDistribution: [...activeTokens.map(token => ({
          assetType: 'token',
          mintAddress: token.mintAddress,
          percentage: 0 // Sera calculé côté client avec les valeurs complètes
        })), {
          assetType: 'native',
          mintAddress: 'SOL',
          percentage: 0
        }]
      }
    };
    
    res.json({
      success: true,
      analysis: portfolioAnalysis
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/portfolio/token-transfers/:walletAddress
 * @description Récupère l'historique des transferts de tokens
 * @access Public
 */
router.get('/token-transfers/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    const { limit = 100, page = 1, fromBlock, toBlock } = req.query;
    
    // Options pour les transferts de tokens
    const options = {
      limit: parseInt(limit),
      page: parseInt(page),
      fromBlock,
      toBlock
    };
    
    // Récupération des transferts de tokens via Alchemy
    const tokenTransfers = await alchemyService.getTokenTransfers(walletAddress, options);
    
    res.json({
      success: true,
      tokenTransfers
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;