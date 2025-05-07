const express = require('express');
const router = express.Router();
const { PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

const heliusService = require('../services/heliusService');
const alchemyService = require('../services/alchemyService');
const jupiterService = require('../services/jupiterService');
const birdeyeService = require('../services/birdeyeService');
const coinGeckoService = require('../services/coinGeckoService');
const cryptoCompareService = require('../services/cryptoCompareService');
const priceService = require('../services/priceService');
const ResponseUtils = require('../utils/responseUtils');

// Adresses des programmes courants sur Solana avec leurs noms lisibles
const PROGRAM_IDS = {
  JUPITER_V6: { address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', name: 'Jupiter V6' },
  JUPITER_V4: { address: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', name: 'Jupiter V4' },
  RAYDIUM_AMM: { address: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', name: 'Raydium AMM' },
  RAYDIUM_CLMM: { address: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', name: 'Raydium CLMM' },
  ORCA_WHIRLPOOL: { address: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', name: 'Orca Whirlpool' },
  ORCA_SWAP: { address: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP', name: 'Orca Swap' },
  SOLEND: { address: 'So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo', name: 'Solend' },
  MARINADE: { address: 'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD', name: 'Marinade Finance' },
  LIDO: { address: 'CrX7kMhLC3cSsXJdT7JDgqrRVWGnUpX3gfEfxxU2NVLi', name: 'Lido' },
  SPL_TOKEN: { address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', name: 'SPL Token Program' },
  SYSTEM: { address: '11111111111111111111111111111111', name: 'System Program' }
};

// Convertir le mapping des programmes en map pour recherche rapide par adresse
const PROGRAM_MAP = Object.values(PROGRAM_IDS).reduce((map, program) => {
  map[program.address] = program.name;
  return map;
}, {});

/**
 * @route GET /api/transaction/:signature
 * @description Récupère et analyse une transaction
 * @access Public
 */
router.get('/:signature', async (req, res, next) => {
  try {
    const { signature } = req.params;
    
    // 1. Récupération de la transaction brute via Helius
    console.log(`Récupération de la transaction ${signature} via Helius`);
    const heliusTransaction = await heliusService.getTransaction(signature);
    if (!heliusTransaction) {
      return res.status(404).json(
        ResponseUtils.error('Transaction non trouvée', 404)
      );
    }

    // 2. Utilisation d'Alchemy pour obtenir les détails complets et fiables de la transaction
    console.log(`Récupération des détails de la transaction ${signature} via Alchemy`);
    const alchemyTransactionDetails = await alchemyService.getTransaction(signature);
    if (!alchemyTransactionDetails) {
      console.log('Aucun détail trouvé via Alchemy, utilisation des données Helius uniquement');
    }
    
    // Fusion des données avec priorité à Alchemy pour les détails
    const transaction = alchemyTransactionDetails || heliusTransaction;
    
    // 3. Extraction des tokens impliqués dans la transaction
    const tokenMints = extractTokenMintsFromTransaction(transaction);
    console.log(`${tokenMints.size} tokens identifiés dans la transaction`);
    
    if (tokenMints.size === 0) {
      console.log('Aucun token trouvé dans la transaction');
    } else {
      console.log('Tokens trouvés dans la transaction:', Array.from(tokenMints));
    }
    
    // 4. Récupération des informations sur les assets via Jupiter
    const assetInfo = {};
    for (const mint of tokenMints) {
      try {
        console.log(`Récupération des informations pour le token ${mint} via Jupiter`);
        const jupiterAssetInfo = await jupiterService.getTokenInfo(mint);
        if (jupiterAssetInfo) {
          assetInfo[mint] = jupiterAssetInfo;
          console.log(`Token ${mint} identifié comme ${jupiterAssetInfo.symbol || 'non reconnu'} via Jupiter`);
        }
      } catch (error) {
        console.error(`Erreur lors de la récupération des infos Jupiter pour ${mint}:`, error.message);
      }
    }
    
    // 5. Enrichissement avec historique des prix pour chaque token
    const priceHistory = {};
    if (transaction.blockTime) {
      const timestamp = transaction.blockTime;
      
      for (const mint of tokenMints) {
        try {
          console.log(`Récupération de l'historique des prix pour ${mint} au timestamp ${timestamp}`);
          
          // Utilisation du service de prix qui combine toutes les sources
          const historicalPrice = await priceService.getHistoricalPrice(mint, timestamp);
          
          if (historicalPrice) {
            const tokenSymbol = assetInfo[mint]?.symbol || 'UNKNOWN';
            priceHistory[mint] = {
              mint,
              symbol: tokenSymbol,
              name: assetInfo[mint]?.name || 'Unknown Token',
              priceHistory: historicalPrice
            };
            
            console.log(`Prix historique trouvé pour ${tokenSymbol}: ${historicalPrice.price} USD (source: ${historicalPrice.source})`);
          } else {
            console.log(`Aucun prix historique trouvé pour ${mint}`);
          }
        } catch (error) {
          console.error(`Erreur lors de la récupération du prix pour ${mint}:`, error.message);
        }
      }
    } else {
      console.log('Transaction sans blockTime, impossible de récupérer l\'historique des prix');
    }
    
    // 6. Analyse contextuelle de la transaction
    const analysisResult = alchemyTransactionDetails 
      ? analyzeAlchemyTransaction(alchemyTransactionDetails)
      : await analyzeTransaction(heliusTransaction);
    
    // 7. Préparation de la réponse finale
    const enrichedTransaction = {
      ...transaction,
      priceHistory,
      assetInfo
    };
    
    // Structure de la réponse selon le format attendu dans test-transaction.js
    res.json({
      data: {
        signature,
        status: transaction.meta?.err ? 'failed' : 'success',
        blockTime: transaction.blockTime 
          ? new Date(transaction.blockTime * 1000).toISOString() 
          : null,
        fee: transaction.meta?.fee ? transaction.meta.fee / 1e9 : null,
        analysis: analysisResult,
        transaction: enrichedTransaction
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'analyse de la transaction:', error);
    next(error);
  }
});

/**
 * @route GET /api/transaction/portfolio-format/:signature
 * @description Récupère et analyse une transaction au format compatible avec la bibliothèque Portfolio
 * @access Public
 */
router.get('/portfolio-format/:signature', async (req, res, next) => {
  try {
    const { signature } = req.params;
    
    // 1. Récupération de la transaction brute (même code que pour l'endpoint /:signature)
    console.log(`Récupération de la transaction ${signature} via Helius (format Portfolio)`);
    const heliusTransaction = await heliusService.getTransaction(signature);
    if (!heliusTransaction) {
      return res.status(404).json(
        ResponseUtils.error('Transaction non trouvée', 404)
      );
    }

    // Fallback sur Alchemy si disponible
    const alchemyTransactionDetails = await alchemyService.getTransaction(signature);
    const transaction = alchemyTransactionDetails || heliusTransaction;
    
    // 2. Extraction des tokens impliqués (même code que pour l'endpoint /:signature)
    const tokenMints = extractTokenMintsFromTransaction(transaction);
    
    // 3. Récupérer les métadonnées des tokens impliqués
    const tokenInfo = {};
    for (const mint of tokenMints) {
      try {
        const jupiterAssetInfo = await jupiterService.getTokenInfo(mint);
        if (jupiterAssetInfo) {
          tokenInfo[mint] = {
            address: mint,
            name: jupiterAssetInfo.name || 'Unknown Token',
            symbol: jupiterAssetInfo.symbol || 'UNKNOWN',
            decimals: jupiterAssetInfo.decimals || 0,
            logoURI: jupiterAssetInfo.logoURI || null,
            tags: jupiterAssetInfo.tags || []
          };
        }
      } catch (error) {
        console.error(`Erreur lors de la récupération des infos token pour ${mint}:`, error.message);
      }
    }
    
    // 4. Analyser l'activité financière de la transaction
    const financialActivity = await reconstructFinancialActivity(transaction);
    
    // 5. Construire les BalanceChange selon le format Portfolio
    const balanceChanges = [
      // Convertir les changements de SOL en objets BalanceChange
      ...financialActivity.solChanges.map(solChange => ({
        address: transaction.transaction.message.accountKeys[solChange.accountIndex].pubkey,
        preBalance: solChange.preBalance,
        postBalance: solChange.postBalance,
        change: solChange.change
      })),
      
      // Convertir les changements de tokens en objets BalanceChange
      ...financialActivity.tokenChanges.map(tokenChange => ({
        address: tokenChange.mint,
        preBalance: tokenChange.preBalance,
        postBalance: tokenChange.postBalance,
        change: tokenChange.change
      }))
    ];
    
    // 6. Déterminer les comptes affectés
    const accountChanges = {
      created: [],
      updated: [],
      closed: []
    };
    
    // Détecter les comptes créés/fermés en analysant les instructions et changements de solde
    transaction.transaction.message.instructions.forEach(ix => {
      if (ix.programId === '11111111111111111111111111111111' && ix.parsed && ix.parsed.type === 'createAccount') {
        accountChanges.created.push(ix.parsed.info.newAccount);
      }
      // Autres cas spécifiques pourraient être ajoutés ici
    });
    
    // Un compte est considéré "mis à jour" s'il a un changement de solde significatif
    const updatedAccounts = new Set();
    financialActivity.solChanges.forEach(change => {
      const accountKey = transaction.transaction.message.accountKeys[change.accountIndex].pubkey;
      if (!accountChanges.created.includes(accountKey) && !accountChanges.closed.includes(accountKey)) {
        updatedAccounts.add(accountKey);
      }
    });
    accountChanges.updated = Array.from(updatedAccounts);
    
    // 7. Déterminer le service (DeFi protocol ou autre)
    const programIds = identifyInvolvedPrograms(transaction);
    const protocolName = identifyProtocol(programIds);
    
    const service = {
      id: Array.from(programIds)[0] || 'unknown',  // Utiliser le premier programId comme identifiant
      name: protocolName,
      platformId: protocolName.toLowerCase().replace(/\s+/g, '-'),  // Format slugifié
      networkId: 'solana',  // Toujours Solana dans ce contexte
      description: `Transaction via ${protocolName}`
    };
    
    // 8. Déterminer si c'est une transaction de spam
    const isSpamTransaction = 
      financialActivity.solChanges.every(change => Math.abs(change.change) < 0.00001) &&
      financialActivity.tokenChanges.every(change => Math.abs(change.change) < 0.00001) &&
      transaction.transaction.message.instructions.length > 10;
    
    // 9. Construire la réponse au format Portfolio.Transaction
    const portfolioTransaction = {
      signature,
      owner: findUserAddress(transaction) || transaction.transaction.message.accountKeys[0].pubkey,
      blockTime: transaction.blockTime || null,
      service,
      balanceChanges,
      accountChanges,
      isSigner: true,  // L'adresse propriétaire est toujours signataire dans ce contexte
      tags: isSpamTransaction ? ['spam'] : undefined,
      fees: transaction.meta?.fee ? transaction.meta.fee / 1e9 : null,
      success: transaction.meta?.err ? false : true
    };
    
    // 10. Format de réponse final qui inclut toutes les métadonnées nécessaires
    const response = {
      owner: portfolioTransaction.owner,
      account: portfolioTransaction.owner,  // Même valeur que owner dans ce contexte
      networkId: 'solana',
      duration: 0,  // Non pertinent pour une transaction unique
      transactions: [portfolioTransaction],
      tokenInfo: {
        'solana': tokenInfo
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Erreur lors de l\'analyse de la transaction au format Portfolio:', error);
    next(error);
  }
});

/**
 * @route GET /api/transaction/history/:address
 * @description Récupère l'historique des transactions d'un portefeuille au format Portfolio
 * @access Public
 */
router.get('/history/:address', async (req, res, next) => {
  try {
    const { address } = req.params;
    const { limit = 10, before = null, startDate = null, endDate = null, useDemo = false, includePrices = 'true' } = req.query;
    
    // Adresse connue avec des transactions pour les démonstrations
    const DEMO_ADDRESS = 'EWKbBvDFBbgb7M9H25JDG4jK9QxgfRvwb3Ew7Xqu3VZv';
    
    // Valider l'adresse
    if (!address || address.length < 32) {
      return res.status(400).json(
        ResponseUtils.error('Adresse de portefeuille invalide', 400)
      );
    }

    // Valider la limite (entre 1 et 50)
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      return res.status(400).json(
        ResponseUtils.error('La limite doit être un nombre entre 1 et 50', 400)
      );
    }

    // Utiliser l'adresse fournie ou l'adresse de démo si demandé
    const targetAddress = useDemo === 'true' ? DEMO_ADDRESS : address;
    
    console.log(`Récupération de l'historique des transactions pour ${targetAddress} (limite: ${parsedLimit})`);
    
    // 1. Récupérer l'historique des transactions via Helius
    const startTime = Date.now();
    let transactionsHistory;
    try {
      transactionsHistory = await heliusService.getEnrichedTransactionHistory(targetAddress, parsedLimit, before);
    } catch (error) {
      console.error(`Erreur lors de la récupération des signatures pour ${targetAddress}:`, error.message);
      return res.status(500).json(
        ResponseUtils.error(`Erreur lors de la récupération des transactions: ${error.message}`, 500)
      );
    }
    
    const duration = Date.now() - startTime;
    
    if (!transactionsHistory || transactionsHistory.length === 0) {
      // Si aucune transaction n'est trouvée et que nous n'utilisons pas déjà la démo,
      // suggérer d'utiliser l'adresse de démonstration
      if (targetAddress !== DEMO_ADDRESS) {
        return res.status(404).json({
          success: false,
          message: `Aucune transaction trouvée pour l'adresse ${targetAddress}. Essayez avec le paramètre useDemo=true pour voir un exemple.`,
          statusCode: 404,
          demo: {
            url: `/api/transaction/history/${address}?limit=${limit}&useDemo=true`,
            message: "Utilisez ce lien pour tester avec une adresse de démo qui contient des transactions"
          },
          errors: null,
          timestamp: new Date().toISOString()
        });
      } else {
        return res.status(404).json(
          ResponseUtils.error(`Aucune transaction trouvée, même pour l'adresse de démonstration. Il pourrait y avoir un problème avec l'API Helius.`, 404)
        );
      }
    }

    console.log(`${transactionsHistory.length} transactions récupérées en ${duration}ms`);
    
    // 2. Filtrer par date si nécessaire
    let filteredTransactions = transactionsHistory;
    
    if (startDate) {
      const startTimestamp = new Date(startDate).getTime() / 1000;
      filteredTransactions = filteredTransactions.filter(tx => 
        tx.blockTime && tx.blockTime >= startTimestamp
      );
    }
    
    if (endDate) {
      const endTimestamp = new Date(endDate).getTime() / 1000;
      filteredTransactions = filteredTransactions.filter(tx => 
        tx.blockTime && tx.blockTime <= endTimestamp
      );
    }
    
    // 3. Traiter chaque transaction pour obtenir le format Portfolio
    const portfolioTransactions = [];
    const tokenInfoMap = {};
    const priceHistoryMap = {}; // Stockera les prix historiques par token mint et timestamp
    
    console.log(`Traitement de ${filteredTransactions.length} transactions au format Portfolio`);
    
    // Créer un ensemble pour suivre tous les tokens uniques dans toutes les transactions
    const allTokenMints = new Set();
    
    // Première passe : identifier tous les tokens uniques impliqués
    for (const tx of filteredTransactions) {
      const tokenMints = extractTokenMintsFromTransaction(tx);
      tokenMints.add('So11111111111111111111111111111111111111112'); // Ajouter SOL car il est généralement impliqué
      
      // Ajouter chaque mint à l'ensemble global
      for (const mint of tokenMints) {
        allTokenMints.add(mint);
      }
    }
    
    console.log(`Total de ${allTokenMints.size} tokens uniques identifiés`);
    
    // Récupérer les métadonnées pour tous les tokens uniques
    for (const mint of allTokenMints) {
      try {
        // Récupérer les métadonnées du token
        if (!tokenInfoMap[mint]) {
          try {
            console.log(`Récupération des métadonnées pour ${mint}`);
            const jupiterAssetInfo = await jupiterService.getTokenInfo(mint);
            
            if (jupiterAssetInfo) {
              tokenInfoMap[mint] = {
                address: mint,
                name: jupiterAssetInfo.name || 'Unknown Token',
                symbol: jupiterAssetInfo.symbol || 'UNKNOWN',
                decimals: jupiterAssetInfo.decimals || 0,
                logoURI: jupiterAssetInfo.logoURI || null,
                tags: jupiterAssetInfo.tags || []
              };
            } else {
              // Si Jupiter ne trouve pas le token, essayer d'obtenir des informations via Birdeye
              const birdeyeInfo = await birdeyeService.getTokenMetadata(mint);
              if (birdeyeInfo?.data) {
                tokenInfoMap[mint] = {
                  address: mint,
                  name: birdeyeInfo.data.name || 'Unknown Token',
                  symbol: birdeyeInfo.data.symbol || 'UNKNOWN',
                  decimals: birdeyeInfo.data.decimals || 0,
                  logoURI: birdeyeInfo.data.logoURI || null,
                  tags: []
                };
              }
            }
          } catch (error) {
            console.error(`Erreur lors de la récupération des infos token pour ${mint}:`, error.message);
          }
        }
      } catch (error) {
        console.error(`Erreur lors du traitement du token ${mint}:`, error.message);
      }
    }
    
    // NOUVEAU: Capturer les prix historiques exacts pour chaque transaction
    if (includePrices === 'true') {
      console.log(`Capture des prix historiques pour toutes les transactions`);
      
      // Trier les transactions par ordre chronologique pour traiter les plus anciennes d'abord
      const sortedTransactions = [...filteredTransactions].sort((a, b) => 
        (a.blockTime || 0) - (b.blockTime || 0)
      );
      
      // Préparer une liste de tous les tokens à traiter, en s'assurant que SOL est toujours inclus
      const allTokensForPriceHistory = new Set(allTokenMints);
      allTokensForPriceHistory.add('So11111111111111111111111111111111111111112'); // S'assurer que SOL est inclus
      
      for (const tx of sortedTransactions) {
        if (tx.blockTime) {
          // Extraire les tokens impliqués dans cette transaction spécifique
          const txTokenMints = extractTokenMintsFromTransaction(tx);
          txTokenMints.add('So11111111111111111111111111111111111111112'); // Ajouter toujours SOL
          const tokenMintsArray = Array.from(txTokenMints);
          
          // Capturer les prix exacts pour tous les tokens de cette transaction
          console.log(`Capture des prix pour la transaction ${tx.signature} au timestamp ${tx.blockTime}`);
          const transactionPrices = await priceService.captureTransactionPrices(tokenMintsArray, tx.blockTime);
          
          // Stocker les résultats pour chaque token impliqué
          for (const mint of txTokenMints) {
            if (transactionPrices[mint]) {
              // Clé unique pour chaque combinaison token/timestamp
              const priceKey = `${mint}-${tx.blockTime}`;
              priceHistoryMap[priceKey] = transactionPrices[mint];
            } else {
              // Si le prix n'a pas été trouvé, ajouter un prix "unknown" pour éviter les valeurs manquantes
              const priceKey = `${mint}-${tx.blockTime}`;
              priceHistoryMap[priceKey] = {
                price: null,
                priceUsd: null,
                source: 'unknown'
              };
              console.log(`Prix non trouvé pour ${mint} au timestamp ${tx.blockTime}, marqué comme "unknown"`);
            }
          }
        }
      }
    }
    
    // Deuxième passe : créer les transactions au format Portfolio
    for (const tx of filteredTransactions) {
      try {
        // Extraire les tokens impliqués dans cette transaction
        const tokenMints = extractTokenMintsFromTransaction(tx);
        tokenMints.add('So11111111111111111111111111111111111111112'); // Ajouter SOL car il est généralement impliqué
        
        // Analyser l'activité financière
        let financialActivity = { solChanges: [], tokenChanges: [] };
        try {
          financialActivity = await reconstructFinancialActivity(tx);
        } catch (finError) {
          console.error(`Erreur lors de l'analyse financière de la transaction ${tx.signature}:`, finError.message);
          // Au lieu d'échouer, utiliser un objet partiel
        }
        
        // Construire les BalanceChange selon le format Portfolio
        const balanceChanges = [
          // Changements de SOL
          ...(financialActivity.solChanges || []).map(solChange => {
            const accountKey = tx.transaction?.message?.accountKeys?.[solChange.accountIndex]?.pubkey || 'unknown';
            
            // Vérifier si c'est l'adresse du propriétaire (l'adresse demandée)
            const isOwnerAccount = accountKey === targetAddress;
            
            return {
              address: accountKey,
              preBalance: solChange.preBalance,
              postBalance: solChange.postBalance,
              change: solChange.change,
              token: {
                address: 'So11111111111111111111111111111111111111112', // Adresse du wrapped SOL
                symbol: 'SOL',
                name: 'Solana',
                decimals: 9,
                logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
              },
              value: priceHistoryMap['So11111111111111111111111111111111111111112'] ? 
                {
                  amount: solChange.change,
                  currency: 'USD',
                  price: priceHistoryMap['So11111111111111111111111111111111111111112'].price || 0,
                  total: priceHistoryMap['So11111111111111111111111111111111111111112'].price * solChange.change || 0
                } : undefined,
              isOwnerAccount
            };
          }),
          
          // Changements de tokens
          ...(financialActivity.tokenChanges || []).map(tokenChange => {
            // Déterminer si ce changement concerne le propriétaire de l'adresse demandée
            const isOwnerAccount = tokenChange.owner === targetAddress;
            
            return {
              address: tokenChange.mint,
              preBalance: tokenChange.preBalance,
              postBalance: tokenChange.postBalance,
              change: tokenChange.change,
              token: tokenInfoMap[tokenChange.mint] || {
                address: tokenChange.mint,
                symbol: tokenChange.symbol || 'UNKNOWN',
                name: tokenChange.name || 'Unknown Token',
                decimals: 0
              },
              value: priceHistoryMap[tokenChange.mint] ? 
                {
                  amount: tokenChange.change,
                  currency: 'USD',
                  price: priceHistoryMap[tokenChange.mint].price || 0,
                  total: priceHistoryMap[tokenChange.mint].price * tokenChange.change || 0
                } : undefined,
              isOwnerAccount
            };
          })
        ];
        
        // Déterminer les comptes affectés, avec gestion défensive des erreurs
        const accountChanges = {
          created: [],
          updated: [],
          closed: []
        };
        
        // Un compte est considéré "mis à jour" s'il a un changement de solde significatif
        const updatedAccounts = new Set();
        (financialActivity.solChanges || []).forEach(change => {
          if (tx.transaction?.message?.accountKeys?.[change.accountIndex]) {
            const accountKey = tx.transaction.message.accountKeys[change.accountIndex].pubkey;
            updatedAccounts.add(accountKey);
          }
        });
        accountChanges.updated = Array.from(updatedAccounts);
        
        // Déterminer le service (DeFi protocol ou autre) avec gestion défensive des erreurs
        let programIds = new Set();
        try {
          programIds = identifyInvolvedPrograms(tx);
        } catch (pidError) {
          console.warn(`Erreur lors de l'identification des programmes pour ${tx.signature}:`, pidError.message);
        }
        
        const protocolName = identifyProtocol(programIds);
        
        const service = {
          id: Array.from(programIds)[0] || 'unknown',
          name: protocolName,
          platformId: protocolName.toLowerCase().replace(/\s+/g, '-'),
          networkId: 'solana',
          description: `Transaction via ${protocolName}`
        };
        
        // Déterminer si c'est une transaction de spam avec gestion défensive
        const isSpamTransaction = 
          (financialActivity.solChanges || []).every(change => Math.abs(change.change) < 0.00001) &&
          (financialActivity.tokenChanges || []).every(change => Math.abs(change.change) < 0.00001) &&
          (tx.transaction?.message?.instructions?.length || 0) > 10;
        
        // Construire la transaction au format Portfolio, même si certaines données sont partielles
        portfolioTransactions.push({
          signature: tx.signature || tx.transaction?.signatures?.[0] || 'unknown',
          owner: targetAddress,
          blockTime: tx.blockTime || null,
          service,
          balanceChanges,
          accountChanges,
          isSigner: true,
          tags: isSpamTransaction ? ['spam'] : undefined,
          fees: tx.meta?.fee ? tx.meta.fee / 1e9 : null,
          success: tx.meta?.err ? false : true,
          _diagnostic: tx._fetchFailed ? {
            fetchFailed: true,
            fetchError: tx._fetchError,
            message: "Transaction partiellement reconstruite à partir des données disponibles"
          } : undefined
        });
      } catch (error) {
        console.error(`Erreur lors du traitement de la transaction ${tx.signature || 'unknown'}:`, error);
        
        // Au lieu d'ignorer la transaction, l'inclure avec des informations d'erreur
        portfolioTransactions.push({
          signature: tx.signature || tx.transaction?.signatures?.[0] || 'unknown',
          owner: targetAddress,
          blockTime: tx.blockTime || null,
          service: {
            id: "error",
            name: "Error Processing Transaction",
            platformId: "error",
            networkId: "solana",
            description: "Une erreur est survenue lors du traitement de cette transaction"
          },
          balanceChanges: [],
          accountChanges: { created: [], updated: [], closed: [] },
          isSigner: true,
          success: false,
          _error: {
            message: error.message,
            stack: error.stack,
            transaction: JSON.stringify(tx).length > 1000 ? "Transaction data too large" : JSON.stringify(tx)
          }
        });
      }
    }
    
    // 4. Format de réponse final avec toutes les métadonnées nécessaires
    const response = {
      owner: targetAddress,
      account: targetAddress,
      networkId: 'solana',
      duration,
      transactions: portfolioTransactions,
      tokenInfo: {
        'solana': tokenInfoMap
      },
      priceHistory: {
        'solana': {}
      },
      pagination: {
        before: filteredTransactions.length > 0 ? 
          filteredTransactions[filteredTransactions.length - 1].signature : null,
        limit: parsedLimit,
        hasMore: filteredTransactions.length === parsedLimit
      },
      isDemo: targetAddress === DEMO_ADDRESS
    };
    
    // Traiter séparément l'historique des prix pour chaque token et chaque transaction
    for (const tx of filteredTransactions) {
      if (tx.blockTime) {
        // Pour chaque token impliqué dans cette transaction
        const tokenMintsInTx = extractTokenMintsFromTransaction(tx);
        tokenMintsInTx.add('So11111111111111111111111111111111111111112'); // Ajouter SOL
        
        for (const mint of tokenMintsInTx) {
          // Clé unique pour cette transaction et ce token
          const priceKey = `${mint}-${tx.blockTime}`;
          
          // Si nous avons déjà un prix pour ce token à ce timestamp, l'utiliser
          if (priceHistoryMap[priceKey]) {
            response.priceHistory.solana[priceKey] = {
              mint,
              price: priceHistoryMap[priceKey].price,
              priceUsd: priceHistoryMap[priceKey].priceUsd,
              timestamp: tx.blockTime,
              date: new Date(tx.blockTime * 1000).toISOString(),
              source: priceHistoryMap[priceKey].source || 'estimated'
            };
          } else {
            // Si le prix n'est pas disponible, ajouter une entrée avec "unknown"
            response.priceHistory.solana[priceKey] = {
              mint,
              price: null,
              priceUsd: null,
              timestamp: tx.blockTime,
              date: new Date(tx.blockTime * 1000).toISOString(),
              source: 'unknown'
            };
            console.log(`Ajout d'une entrée "unknown" pour ${mint} au timestamp ${tx.blockTime}`);
          }
        }
      }
    }
    
    res.json(response);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique des transactions:', error);
    next(error);
  }
});

/**
 * Extrait les adresses des tokens impliqués dans la transaction
 * @param {Object} transaction - Transaction Solana
 * @returns {Set<string>} - Ensemble des adresses de tokens impliqués
 */
function extractTokenMintsFromTransaction(transaction) {
  const tokenMints = new Set();
  const meta = transaction.meta || {};
  
  // Ajouter les tokens présents dans preTokenBalances
  if (meta.preTokenBalances && Array.isArray(meta.preTokenBalances)) {
    meta.preTokenBalances.forEach(balance => {
      if (balance.mint) {
        tokenMints.add(balance.mint);
      }
    });
  }
  
  // Ajouter les tokens présents dans postTokenBalances
  if (meta.postTokenBalances && Array.isArray(meta.postTokenBalances)) {
    meta.postTokenBalances.forEach(balance => {
      if (balance.mint) {
        tokenMints.add(balance.mint);
      }
    });
  }
  
  return tokenMints;
}

/**
 * Analyse une transaction basée sur les données d'Alchemy (source préférée)
 * @param {Object} transaction - Transaction d'Alchemy
 * @returns {Object} - Résultat de l'analyse
 */
function analyzeAlchemyTransaction(transaction) {
  try {
    if (!transaction) {
      return { type: 'unknown', reason: 'Données de transaction incomplètes' };
    }
    
    // Extraction des informations clés de la transaction depuis Alchemy
    const tx = transaction.transaction;
    const meta = transaction.meta;
    const logs = meta?.logMessages || [];
    
    // 1. Identifier les programmes impliqués dans la transaction
    const programIds = identifyInvolvedPrograms(transaction);
    
    // 2. Déterminer le type général de transaction
    let transactionType = determineTransactionType(logs, programIds);
    
    // 3. Identifier le protocole
    let protocol = identifyProtocol(programIds);
    
    // 4. Analyser les changements financiers (tokens et SOL)
    // Note: Nous ne pouvons pas utiliser la fonction async reconstructFinancialActivity ici
    const financialActivity = { tokenChanges: [], solChanges: [], fee: meta?.fee ? meta.fee / 1e9 : 0 };
    
    return {
      protocol,
      type: transactionType,
      financialActivity,
      programIds: Array.from(programIds).map(pid => ({
        address: pid,
        name: PROGRAM_MAP[pid] || 'Unknown Program'
      })),
      timestamp: transaction.blockTime ? new Date(transaction.blockTime * 1000).toISOString() : null
    };
  } catch (error) {
    console.error('Erreur lors de l\'analyse de la transaction Alchemy:', error);
    return {
      type: 'error',
      error: 'Impossible d\'analyser cette transaction',
      errorDetails: error.message
    };
  }
}

/**
 * Analyse une transaction basée sur les données de Helius (fallback)
 * @param {Object} transaction - Transaction de Helius
 * @returns {Promise<Object>} - Résultat de l'analyse
 */
async function analyzeTransaction(transaction) {
  try {
    if (!transaction || !transaction.transaction || !transaction.meta) {
      return { type: 'unknown', reason: 'Données de transaction incomplètes' };
    }
    
    // Extraction et normalisation des informations clés de la transaction
    const tx = transaction.transaction;
    const meta = transaction.meta;
    const logs = meta.logMessages || [];
    
    // 1. Identifier les programmes impliqués dans la transaction
    const programIds = identifyInvolvedPrograms(transaction);
    
    // 2. Reconstruire l'activité financière réelle (ce qui est entré/sorti du portefeuille de l'utilisateur)
    // Utilisation du mot-clé await car reconstructFinancialActivity est maintenant async
    const financialActivity = await reconstructFinancialActivity(transaction);
    
    // 3. Déterminer le type général de transaction
    let transactionType = determineTransactionType(logs, programIds);
    
    // 4. Analyse spécifique selon le protocole détecté
    let protocolDetails;
    let protocol = identifyProtocol(programIds);
    
    // 5. Créer le résultat de l'analyse
    return {
      protocol,
      type: transactionType,
      financialActivity,
      programIds: Array.from(programIds).map(pid => ({
        address: pid,
        name: PROGRAM_MAP[pid] || 'Unknown Program'
      })),
      userAddress: findUserAddress(transaction),
      timestamp: transaction.blockTime ? new Date(transaction.blockTime * 1000).toISOString() : null
    };
  } catch (error) {
    console.error('Erreur lors de l\'analyse de la transaction:', error);
    return {
      type: 'error',
      error: 'Impossible d\'analyser cette transaction',
      errorDetails: error.message
    };
  }
}

// Les fonctions d'analyse restent les mêmes
function identifyInvolvedPrograms(transaction) {
  const programIds = new Set();
  const tx = transaction.transaction;
  const meta = transaction.meta;
  
  // Analyser les instructions externes
  if (tx.message && tx.message.instructions) {
    tx.message.instructions.forEach(ix => {
      if (ix.programId) {
        programIds.add(ix.programId);
      }
    });
  }
  
  // Analyser les instructions internes (cruciales pour les protocols comme Jupiter)
  if (meta && meta.innerInstructions) {
    meta.innerInstructions.forEach(innerIx => {
      if (innerIx.instructions) {
        innerIx.instructions.forEach(ix => {
          if (ix.programId) {
            programIds.add(ix.programId);
          }
        });
      }
    });
  }
  
  return programIds;
}

/**
 * Reconstruire l'activité financière réelle en analysant les changements de soldes
 * @param {Object} transaction - Transaction Solana
 * @returns {Promise<Object>} - Activité financière reconstruite
 */
async function reconstructFinancialActivity(transaction) {
  const meta = transaction.meta;
  if (!meta) return { changes: [] };
  
  // 1. Analyser les changements de tokens SPL
  const tokenChanges = [];
  const preTokenBalances = meta.preTokenBalances || [];
  const postTokenBalances = meta.postTokenBalances || [];
  
  // Map pour suivre les soldes pré-transaction par compte
  const preBalanceMap = preTokenBalances.reduce((map, balance) => {
    const key = `${balance.accountIndex}-${balance.mint}`;
    map[key] = balance;
    return map;
  }, {});
  
  // Analyser les changements pour chaque solde post-transaction
  for (const postBalance of postTokenBalances) {
    const key = `${postBalance.accountIndex}-${postBalance.mint}`;
    const preBalance = preBalanceMap[key] || { uiTokenAmount: { uiAmount: 0 } };
    
    const mintAddress = postBalance.mint;
    const preBal = preBalance.uiTokenAmount?.uiAmount || 0;
    const postBal = postBalance.uiTokenAmount?.uiAmount || 0;
    const diff = postBal - preBal;
    
    // Ne s'intéresser qu'aux changements significatifs
    if (Math.abs(diff) > 0.000001) {
      // Enrichir avec les métadonnées du token depuis Birdeye
      let tokenMetadata;
      try {
        tokenMetadata = await birdeyeService.getTokenMetadata(mintAddress);
        tokenMetadata = tokenMetadata?.data || null;
      } catch (e) {
        tokenMetadata = null;
      }
      
      tokenChanges.push({
        mint: mintAddress,
        symbol: tokenMetadata?.symbol || 'UNKNOWN',
        name: tokenMetadata?.name || 'Unknown Token',
        logoURI: tokenMetadata?.logoURI || null,
        ownerIndex: postBalance.accountIndex,
        owner: postBalance.owner || 'unknown',
        change: diff,
        preBalance: preBal,
        postBalance: postBal
      });
    }
    
    // Retirer de la map pour identifier les tokens qui ont disparu
    delete preBalanceMap[key];
  }
  
  // Ajouter les tokens qui étaient présents avant mais ont disparu
  for (const key in preBalanceMap) {
    const preBalance = preBalanceMap[key];
    const mintAddress = preBalance.mint;
    const preBal = preBalance.uiTokenAmount?.uiAmount || 0;
    
    // Ne s'intéresser qu'aux soldes significatifs
    if (preBal > 0.000001) {
      // Enrichir avec les métadonnées du token
      let tokenMetadata;
      try {
        tokenMetadata = await birdeyeService.getTokenMetadata(mintAddress);
        tokenMetadata = tokenMetadata?.data || null;
      } catch (e) {
        tokenMetadata = null;
      }
      
      tokenChanges.push({
        mint: mintAddress,
        symbol: tokenMetadata?.symbol || 'UNKNOWN',
        name: tokenMetadata?.name || 'Unknown Token',
        logoURI: tokenMetadata?.logoURI || null,
        ownerIndex: preBalance.accountIndex,
        owner: preBalance.owner || 'unknown',
        change: -preBal,  // Le token a disparu, donc -preBalance
        preBalance: preBal,
        postBalance: 0
      });
    }
  }
  
  // 2. Analyser les changements de SOL natif
  const solChanges = [];
  const preBalances = meta.preBalances || [];
  const postBalances = meta.postBalances || [];
  
  for (let i = 0; i < Math.min(preBalances.length, postBalances.length); i++) {
    const preSol = preBalances[i] / 1e9;  // Conversion lamports to SOL
    const postSol = postBalances[i] / 1e9;
    const diff = postSol - preSol;
    
    // Ne s'intéresser qu'aux changements significatifs (>0.000005 SOL pour ignorer les frais mineurs)
    if (Math.abs(diff) > 0.000005) {
      solChanges.push({
        accountIndex: i,
        change: diff,
        preBalance: preSol,
        postBalance: postSol
      });
    }
  }
  
  // 3. Retourner l'activité financière complète
  return {
    tokenChanges,
    solChanges,
    // Calculer les frais de transaction
    fee: meta.fee ? meta.fee / 1e9 : 0
  };
}

function determineTransactionType(logs, programIds) {
  if (logs.some(log => log.includes('Instruction: Swap'))) {
    return 'swap';
  } else if (logs.some(log => /Instruction: (Deposit|Supply)/.test(log))) {
    return 'deposit';
  } else if (logs.some(log => log.includes('Instruction: Withdraw'))) {
    return 'withdraw';
  } else if (logs.some(log => /Instruction: (AddLiquidity|DepositAllTokenTypes)/.test(log))) {
    return 'add_liquidity';
  } else if (logs.some(log => /Instruction: (RemoveLiquidity|WithdrawAllTokenTypes)/.test(log))) {
    return 'remove_liquidity';
  } else if (logs.some(log => log.includes('Instruction: Stake'))) {
    return 'stake';
  } else if (logs.some(log => /Instruction: (Unstake|Withdraw)/.test(log)) && 
            (programIds.has(PROGRAM_IDS.MARINADE.address) || programIds.has(PROGRAM_IDS.LIDO.address))) {
    return 'unstake';
  } else if (logs.some(log => log.includes('Instruction: Borrow'))) {
    return 'borrow';
  } else if (logs.some(log => log.includes('Instruction: Repay'))) {
    return 'repay';
  } else if (logs.some(log => log.includes('Instruction: Transfer'))) {
    return 'transfer';
  } else if (logs.some(log => log.includes('Instruction: CreateAccount'))) {
    return 'account_creation';
  }
  
  return 'unknown';
}

function identifyProtocol(programIds) {
  if (programIds.has(PROGRAM_IDS.JUPITER_V6.address) || programIds.has(PROGRAM_IDS.JUPITER_V4.address)) {
    return 'Jupiter';
  } else if (programIds.has(PROGRAM_IDS.RAYDIUM_AMM.address) || programIds.has(PROGRAM_IDS.RAYDIUM_CLMM.address)) {
    return 'Raydium';
  } else if (programIds.has(PROGRAM_IDS.ORCA_WHIRLPOOL.address) || programIds.has(PROGRAM_IDS.ORCA_SWAP.address)) {
    return 'Orca';
  } else if (programIds.has(PROGRAM_IDS.SOLEND.address)) {
    return 'Solend';
  } else if (programIds.has(PROGRAM_IDS.MARINADE.address)) {
    return 'Marinade Finance';
  } else if (programIds.has(PROGRAM_IDS.LIDO.address)) {
    return 'Lido';
  } else if (programIds.has(PROGRAM_IDS.SPL_TOKEN.address) && !programIds.has(PROGRAM_IDS.SYSTEM.address)) {
    return 'SPL Token';
  } else if (programIds.has(PROGRAM_IDS.SYSTEM.address)) {
    return 'System Program';
  }
  
  return 'Unknown Protocol';
}

function findUserAddress(transaction) {
  const tx = transaction.transaction;
  if (tx && tx.signatures && tx.signatures.length > 0) {
    return tx.message?.accountKeys?.[0] || null;
  }
  return null;
}

module.exports = router;