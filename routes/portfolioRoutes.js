const express = require('express');
const router = express.Router();

const heliusService = require('../services/heliusService');
const alchemyService = require('../services/alchemyService');
const birdeyeService = require('../services/birdeyeService');
const jupiterService = require('../services/jupiterService');
const ResponseUtils = require('../utils/responseUtils');

/**
 * @route GET /api/portfolio/:walletAddress
 * @description Récupère les informations complètes d'un portefeuille
 * @access Public
 */
router.get('/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    
    // Récupération des données avec gestion défensive des erreurs
    let nativeBalance = { lamports: 0, solAmount: 0 };
    let tokenAccounts = [];
    
    // 1. Récupérer le solde SOL de façon défensive
    try {
      const balances = await alchemyService.getBalances(walletAddress);
      nativeBalance = balances.nativeBalance || nativeBalance;
      
      // Structure de tokenAccounts peut varier selon le service
      if (Array.isArray(balances.tokenAccounts)) {
        tokenAccounts = balances.tokenAccounts;
      } else if (balances.tokenAccounts && Array.isArray(balances.tokenAccounts.value)) {
        tokenAccounts = balances.tokenAccounts.value;
      }
    } catch (error) {
      console.error('Erreur Alchemy:', error.message);
      // Si Alchemy échoue, essayer avec Helius
      try {
        tokenAccounts = await heliusService.getTokenBalances(walletAddress);
      } catch (heliusError) {
        console.error('Erreur Helius:', heliusError.message);
        // Continuer avec un tableau vide
      }
    }
    
    // 2. Format des données unifié pour éviter des erreurs de structure
    const formattedTokens = [];
    
    // Traitement défensif des tokens
    if (tokenAccounts && tokenAccounts.length > 0) {
      for (const token of tokenAccounts) {
        try {
          let mintAddress, uiAmount, decimals;
          
          // Structure différente selon le service (Alchemy vs Helius)
          if (token.account?.data?.parsed?.info) {
            // Format Helius
            const tokenInfo = token.account.data.parsed.info;
            mintAddress = tokenInfo.mint;
            uiAmount = tokenInfo.tokenAmount?.uiAmount || 0;
            decimals = tokenInfo.tokenAmount?.decimals || 0;
          } else if (token.mint) {
            // Format Alchemy
            mintAddress = token.mint;
            uiAmount = token.tokenAmount?.uiAmount || 0;
            decimals = token.tokenAmount?.decimals || 0;
          } else {
            // Format inconnu, passer au token suivant
            continue;
          }
          
          // Ne garder que les tokens avec un solde positif
          if (uiAmount <= 0) continue;
          
          formattedTokens.push({
            mint: mintAddress,
            uiAmount,
            decimals
          });
        } catch (err) {
          // Ignorer les tokens avec une structure inattendue
          console.warn('Erreur lors du traitement d\'un token:', err.message);
        }
      }
    }
    
    // 3. Enrichir avec les métadonnées (uniquement si des tokens sont trouvés)
    if (formattedTokens.length > 0) {
      try {
        const tokenMints = formattedTokens.map(token => token.mint);
        
        // Récupérer les métadonnées en parallèle
        const metadataPromises = tokenMints.map(mint => 
          birdeyeService.getTokenMetadata(mint)
            .catch(() => null)
        );
        
        const metadataResults = await Promise.all(metadataPromises);
        
        // Mapper les résultats
        const metadataMap = {};
        metadataResults.forEach((result, index) => {
          if (result && result.data) {
            metadataMap[tokenMints[index]] = result.data;
          }
        });
        
        // Enrichir les tokens
        for (let i = 0; i < formattedTokens.length; i++) {
          const token = formattedTokens[i];
          if (metadataMap[token.mint]) {
            const metadata = metadataMap[token.mint];
            formattedTokens[i] = {
              ...token,
              symbol: metadata.symbol || 'UNKNOWN',
              name: metadata.name || 'Unknown Token',
              logoURI: metadata.logoURI || null,
              price: metadata.price || 0
            };
          }
        }
      } catch (error) {
        console.warn('Erreur lors de l\'enrichissement des tokens:', error.message);
        // Continuer sans les métadonnées
      }
    }
    
    // 4. Envoyer la réponse avec les données disponibles
    return res.json(ResponseUtils.success({
      walletAddress,
      nativeBalance,
      tokenAccounts: formattedTokens
    }));
    
  } catch (error) {
    console.error('Erreur générale dans la route portfolio:', error.message);
    // Répondre avec une structure de base en cas d'erreur majeure
    return res.status(500).json(ResponseUtils.error('Erreur lors de la récupération des données du portefeuille', 500));
  }
});

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
    
    let transactions = [];
    let errorMessage = null;
    
    // Essayer d'abord avec Alchemy
    try {
      transactions = await alchemyService.getEnrichedTransactions(walletAddress, options);
      console.log(`Transactions récupérées avec succès via Alchemy pour ${walletAddress}`);
    } catch (alchemyError) {
      errorMessage = `Erreur Alchemy: ${alchemyError.message}`;
      console.error(errorMessage);
      
      // En cas d'échec d'Alchemy, essayer avec Helius comme solution de secours
      try {
        console.log(`Tentative de récupération des transactions via Helius pour ${walletAddress}`);
        transactions = await heliusService.getTransactionHistory(walletAddress, parseInt(limit), before);
        console.log(`Transactions récupérées avec succès via Helius pour ${walletAddress}`);
        
        // Ajouter une indication de la source dans la réponse
        res.set('X-Data-Source', 'Helius-Fallback');
      } catch (heliusError) {
        console.error(`Erreur Helius: ${heliusError.message}`);
        // Propager l'erreur originale d'Alchemy si les deux services échouent
        throw new Error(`Erreur lors de la récupération des transactions - Alchemy: ${alchemyError.message}, Helius: ${heliusError.message}`);
      }
    }
    
    res.json({
      success: true,
      transactions,
      dataSource: errorMessage ? 'Helius (solution de secours)' : 'Alchemy'
    });
  } catch (error) {
    console.error('Erreur générale dans la route history:', error);
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