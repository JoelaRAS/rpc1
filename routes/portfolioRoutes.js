const express = require('express');
const router = express.Router();

const heliusService = require('../services/heliusService');
const alchemyService = require('../services/alchemyService');
const birdeyeService = require('../services/birdeyeService');
const jupiterService = require('../services/jupiterService');
const priceService = require('../services/priceService');
const ResponseUtils = require('../utils/responseUtils');
const transactionAnalysis = require('../utils/transactionAnalysis');

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
 * @description Récupère l'historique des transactions d'un portefeuille avec analyse détaillée
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
    
    console.log(`Récupération des transactions pour ${walletAddress}, limite: ${limit}`);
    
    // Variables pour stocker les résultats
    let transactionSignatures = [];
    let errorMessage = null;
    let transactions = [];
    
    // Essayer d'abord avec Helius pour une meilleure fiabilité
    try {
      console.log(`Tentative de récupération des transactions via Helius pour ${walletAddress}`);
      // Utiliser la nouvelle méthode enrichie qui récupère automatiquement les détails
      transactions = await heliusService.getEnrichedTransactionHistory(walletAddress, parseInt(limit), before);
      console.log(`${transactions.length} transactions récupérées avec succès via Helius pour ${walletAddress}`);
    } catch (heliusError) {
      errorMessage = `Erreur Helius: ${heliusError.message}`;
      console.error(errorMessage);
      
      // En cas d'échec de Helius, essayer avec Alchemy comme solution de secours
      try {
        console.log(`Tentative de récupération des transactions via Alchemy pour ${walletAddress}`);
        const alchemyResponse = await alchemyService.getEnrichedTransactions(walletAddress, options);
        console.log(`Transactions récupérées via Alchemy pour ${walletAddress}`);
        
        // Vérifier que nous avons bien un tableau
        transactions = Array.isArray(alchemyResponse) ? alchemyResponse : 
                      (alchemyResponse && Array.isArray(alchemyResponse.transactions)) ? alchemyResponse.transactions : [];
                      
        console.log(`${transactions.length} transactions récupérées via Alchemy`);
        
        // Ajouter une indication de la source dans la réponse
        res.set('X-Data-Source', 'Alchemy-Fallback');
      } catch (alchemyError) {
        console.error(`Erreur Alchemy: ${alchemyError.message}`);
        // Propager les deux erreurs
        throw new Error(`Erreur lors de la récupération des transactions - Helius: ${heliusError.message}, Alchemy: ${alchemyError.message}`);
      }
    }
    
    // Si nous n'avons pas de transactions, renvoyer une réponse vide
    if (!transactions || transactions.length === 0) {
      console.log(`Aucune transaction trouvée pour ${walletAddress}`);
      return res.json({
        success: true,
        transactions: [],
        count: 0,
        dataSource: errorMessage ? 'Alchemy (solution de secours)' : 'Helius'
      });
    }
    
    console.log(`Analyse de ${transactions.length} transactions pour ${walletAddress}`);
    
    // Analyser les transactions en détail
    const enrichedTransactions = [];
    
    // Limiter le nombre de requêtes parallèles pour éviter de surcharger les APIs
    const MAX_CONCURRENT_REQUESTS = 5;
    
    // Traiter les transactions par lots
    for (let i = 0; i < transactions.length; i += MAX_CONCURRENT_REQUESTS) {
      const batch = transactions.slice(i, i + MAX_CONCURRENT_REQUESTS);
      console.log(`Traitement du lot ${Math.floor(i/MAX_CONCURRENT_REQUESTS) + 1}/${Math.ceil(transactions.length/MAX_CONCURRENT_REQUESTS)}`);
      
      // Traiter chaque transaction dans le lot en parallèle
      const batchPromises = batch.map(async (transaction) => {
        try {
          const signature = transaction.signature || 
                            transaction.hash || 
                            (transaction.transaction && transaction.transaction.signatures && transaction.transaction.signatures[0]);
          
          if (!signature) {
            console.log(`Signature manquante dans la transaction`);
            return null;
          }
          
          // Si on a déjà la transaction complète de Helius, l'utiliser directement
          // Sinon pour Alchemy, récupérer les détails via Helius
          let txDetails = transaction;
          if (!transaction.transaction || !transaction.meta) {
            try {
              console.log(`Récupération des détails pour la transaction ${signature}`);
              txDetails = await heliusService.getTransaction(signature);
              
              if (!txDetails) {
                console.log(`Transaction ${signature} non trouvée`);
                return null;
              }
              
              // Ajouter la signature au résultat
              txDetails.signature = signature;
            } catch (error) {
              console.error(`Erreur lors de la récupération des détails pour ${signature}: ${error.message}`);
              return null;
            }
          }
          
          // Extraction des tokens impliqués dans la transaction
          const tokenMints = transactionAnalysis.extractTokenMintsFromTransaction(txDetails);
          
          // Récupération des informations sur les assets via Jupiter (limité à 10 tokens max par transaction pour performance)
          const assetInfo = {};
          let tokensCount = 0;
          for (const mint of tokenMints) {
            if (tokensCount >= 10) break; // Limiter le nombre de tokens pour éviter de surcharger l'API
            
            try {
              const jupiterAssetInfo = await jupiterService.getTokenInfo(mint);
              if (jupiterAssetInfo) {
                assetInfo[mint] = jupiterAssetInfo;
                tokensCount++;
              }
            } catch (error) {
              console.error(`Erreur lors de la récupération des infos Jupiter pour ${mint}: ${error.message}`);
            }
          }
          
          // Enrichissement avec historique des prix (uniquement pour les 5 premiers tokens pour performance)
          const priceHistory = {};
          if (txDetails.blockTime) {
            const timestamp = txDetails.blockTime;
            
            tokensCount = 0;
            for (const mint of tokenMints) {
              if (tokensCount >= 5) break; // Limiter le nombre de tokens pour éviter de surcharger l'API
              
              try {
                const historicalPrice = await priceService.getHistoricalPrice(mint, timestamp);
                
                if (historicalPrice) {
                  const tokenSymbol = assetInfo[mint]?.symbol || 'UNKNOWN';
                  priceHistory[mint] = {
                    mint,
                    symbol: tokenSymbol,
                    name: assetInfo[mint]?.name || 'Unknown Token',
                    priceHistory: historicalPrice
                  };
                  tokensCount++;
                }
              } catch (error) {
                console.error(`Erreur lors de la récupération du prix pour ${mint}: ${error.message}`);
              }
            }
          }
          
          // Analyse contextuelle de la transaction
          const analysisResult = await transactionAnalysis.analyzeTransaction(txDetails);
          
          // Préparer la transaction enrichie
          const enrichedTransaction = {
            signature,
            status: txDetails.meta?.err ? 'failed' : 'success',
            blockTime: txDetails.blockTime 
              ? new Date(txDetails.blockTime * 1000).toISOString() 
              : null,
            fee: txDetails.meta?.fee ? txDetails.meta.fee / 1e9 : null,
            analysis: analysisResult,
            priceHistory,
            assetInfo
          };
          
          return enrichedTransaction;
        } catch (error) {
          console.error(`Erreur lors de l'analyse de la transaction: ${error.message}`);
          return null;
        }
      });
      
      // Attendre que toutes les transactions du lot soient traitées
      const batchResults = await Promise.all(batchPromises);
      
      // Ajouter les résultats valides à la liste
      const validResults = batchResults.filter(tx => tx !== null);
      enrichedTransactions.push(...validResults);
      console.log(`Lot traité: ${validResults.length}/${batch.length} transactions analysées avec succès`);
    }
    
    console.log(`Analyse terminée: ${enrichedTransactions.length}/${transactions.length} transactions analysées avec succès`);
    
    res.json({
      success: true,
      transactions: enrichedTransactions,
      count: enrichedTransactions.length,
      dataSource: errorMessage ? 'Alchemy (solution de secours)' : 'Helius'
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