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
    const { limit = 100, before } = req.query;
    
    console.log(`Récupération de l'historique des transactions pour ${walletAddress}, limite: ${limit}`);
    
    // 1. RÉCUPÉRATION DES SIGNATURES DE TRANSACTIONS VIA HELIUS
    let transactionSignatures = [];
    try {
      console.log(`Récupération des signatures via Helius pour ${walletAddress}`);
      const result = await heliusService.getTransactionHistory(walletAddress, parseInt(limit), before);
      // Vérification défensive que result est défini et un tableau
      transactionSignatures = Array.isArray(result) ? result : [];
      console.log(`${transactionSignatures.length} signatures récupérées avec succès via Helius`);
    } catch (error) {
      console.error(`Erreur lors de la récupération des signatures: ${error.message}`);
      // Même en cas d'erreur, continuer avec un tableau vide plutôt que de propager l'erreur
      transactionSignatures = [];
    }
    
    if (!transactionSignatures || transactionSignatures.length === 0) {
      console.log(`Aucune signature de transaction trouvée pour ${walletAddress}`);
      return res.json({
        success: true,
        transactions: [],
        count: 0
      });
    }
    
    // 2. ANALYSE DE CHAQUE TRANSACTION INDIVIDUELLEMENT (comme dans /api/transaction/:signature)
    console.log(`Analyse détaillée des ${transactionSignatures.length} transactions`);
    
    // Limiter le nombre de requêtes parallèles pour éviter de surcharger les APIs
    const MAX_CONCURRENT_REQUESTS = 5;
    const enrichedTransactions = [];
    
    // Traiter les transactions par lots
    for (let i = 0; i < transactionSignatures.length; i += MAX_CONCURRENT_REQUESTS) {
      const batch = transactionSignatures.slice(i, i + MAX_CONCURRENT_REQUESTS);
      console.log(`Traitement du lot ${Math.floor(i/MAX_CONCURRENT_REQUESTS) + 1}/${Math.ceil(transactionSignatures.length/MAX_CONCURRENT_REQUESTS)}`);
      
      // Traiter chaque signature dans le lot en parallèle
      const batchPromises = batch.map(async (sigInfo) => {
        try {
          // Vérifier que sigInfo et signature existent
          if (!sigInfo) return null;
          const signature = sigInfo.signature || sigInfo.id;
          if (!signature) return null;
          
          // COPIE EXACTE DE LA LOGIQUE DE /api/transaction/:signature
          
          // 1. Récupération de la transaction brute via Helius
          console.log(`Récupération de la transaction ${signature} via Helius`);
          const heliusTransaction = await heliusService.getTransaction(signature);
          if (!heliusTransaction) {
            return null;
          }

          // 2. Utilisation d'Alchemy pour obtenir les détails complets (optionnel)
          let alchemyTransactionDetails = null;
          try {
            alchemyTransactionDetails = await alchemyService.getTransaction(signature);
          } catch (error) {
            console.log(`Alchemy non disponible pour ${signature}, utilisation des données Helius uniquement`);
          }
          
          // Fusion des données avec priorité à Alchemy pour les détails
          const transaction = alchemyTransactionDetails || heliusTransaction;
          
          // 3. Extraction des tokens impliqués dans la transaction
          const tokenMints = transactionAnalysis.extractTokenMintsFromTransaction(transaction);
          
          // 4. Récupération des informations sur les assets via Jupiter
          const assetInfo = {};
          for (const mint of tokenMints) {
            try {
              const jupiterAssetInfo = await jupiterService.getTokenInfo(mint);
              if (jupiterAssetInfo) {
                assetInfo[mint] = jupiterAssetInfo;
              }
            } catch (error) {
              console.error(`Erreur Jupiter pour ${mint}: ${error.message}`);
            }
          }
          
          // 5. Enrichissement avec historique des prix pour chaque token
          const priceHistory = {};
          if (transaction.blockTime) {
            const timestamp = transaction.blockTime;
            
            for (const mint of tokenMints) {
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
                }
              } catch (error) {
                console.error(`Erreur prix pour ${mint}: ${error.message}`);
              }
            }
          }
          
          // 6. Analyse contextuelle de la transaction
          const analysisResult = alchemyTransactionDetails 
            ? transactionAnalysis.analyzeAlchemyTransaction(alchemyTransactionDetails)
            : await transactionAnalysis.analyzeTransaction(heliusTransaction);
          
          // 7. Préparation de la réponse finale (EXACTEMENT comme /api/transaction/:signature)
          return {
            signature,
            status: transaction.meta?.err ? 'failed' : 'success',
            blockTime: transaction.blockTime 
              ? new Date(transaction.blockTime * 1000).toISOString() 
              : null,
            fee: transaction.meta?.fee ? transaction.meta.fee / 1e9 : null,
            analysis: analysisResult,
            priceHistory,
            assetInfo,
            transaction: transaction // Inclure la transaction complète
          };
          
        } catch (error) {
          console.error(`Erreur lors de l'analyse de la transaction: ${error.message}`);
          return null;
        }
      });
      
      // Attendre que toutes les transactions du lot soient traitées
      const batchResults = await Promise.all(batchPromises);
      
      // Ajouter les résultats valides à la liste
      enrichedTransactions.push(...batchResults.filter(tx => tx !== null));
      console.log(`Lot traité: ${batchResults.filter(tx => tx !== null).length}/${batch.length} transactions analysées avec succès`);
    }
    
    console.log(`Analyse terminée: ${enrichedTransactions.length}/${transactionSignatures.length} transactions analysées`);
    
    // Envoyer la réponse avec les transactions enrichies
    res.json({
      success: true,
      transactions: enrichedTransactions,
      count: enrichedTransactions.length
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