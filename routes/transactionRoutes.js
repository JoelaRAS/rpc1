const express = require('express');
const router = express.Router();
const { PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

const heliusService = require('../services/heliusService');
const alchemyService = require('../services/alchemyService');
const jupiterService = require('../services/jupiterService');
const birdeyeService = require('../services/birdeyeService');
const coinGeckoService = require('../services/coinGeckoService');
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
    
    // Récupération de la transaction via Helius (données brutes, sans parsing)
    const transaction = await heliusService.getTransaction(signature);
    if (!transaction) {
      return res.status(404).json(
        ResponseUtils.error('Transaction non trouvée', 404)
      );
    }

    // Enrichissement avec historique des prix pour chaque token concerné
    const enrichedTransaction = await enrichTransactionWithPriceHistory(transaction);
    
    // Analyse contextuelle de la transaction (sans parser manuellement)
    const analysisResult = await analyzeTransaction(enrichedTransaction);
    
    res.json(ResponseUtils.success({
      signature,
      blockTime: transaction.blockTime 
        ? new Date(transaction.blockTime * 1000).toISOString() 
        : null,
      status: transaction.meta?.err ? 'failed' : 'success',
      fee: transaction.meta?.fee ? transaction.meta.fee / 1e9 : null,
      transaction: transaction, // Données brutes complètes
      analysis: analysisResult
    }));
  } catch (error) {
    next(error);
  }
});

/**
 * Enrichit la transaction avec l'historique des prix pour chaque token concerné
 * @param {Object} transaction - Transaction Solana
 * @returns {Promise<Object>} - Transaction enrichie avec l'historique des prix
 */
async function enrichTransactionWithPriceHistory(transaction) {
  // On clone la transaction pour ne pas modifier l'original
  const enrichedTx = JSON.parse(JSON.stringify(transaction));
  
  // Si pas de blockTime, on ne peut pas récupérer l'historique des prix
  if (!transaction.blockTime) {
    return enrichedTx;
  }
  
  // On récupère tous les tokens impliqués dans la transaction
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
  
  // Si aucun token n'est impliqué, retourner la transaction telle quelle
  if (tokenMints.size === 0) {
    console.warn('Aucun token trouvé dans la transaction');
    return enrichedTx;
  }
  
  console.log(`${tokenMints.size} tokens trouvés dans la transaction`);
  
  // Récupérer la liste des tokens supportés par Jupiter pour enrichir les métadonnées
  let jupiterTokens = [];
  try {
    jupiterTokens = await jupiterService.getSupportedTokens();
    console.log(`${jupiterTokens.length} tokens Jupiter récupérés pour enrichissement`);
  } catch (error) {
    console.warn('Impossible de récupérer la liste des tokens depuis Jupiter:', error.message);
  }
  
  // Map des tokens Jupiter pour une recherche rapide
  const jupiterTokenMap = {};
  if (jupiterTokens.length > 0) {
    jupiterTokens.forEach(token => {
      jupiterTokenMap[token.address] = token;
    });
  }
  
  // Récupérer l'historique des prix pour chaque token en parallèle
  const priceHistoryPromises = Array.from(tokenMints).map(async (mint) => {
    // Étape 1: Récupérer les métadonnées du token depuis plusieurs sources
    let tokenMetadata = null;
    let priceHistory = null;
    
    // 1.1 D'abord essayer via Jupiter (plus complet)
    const jupiterToken = jupiterTokenMap[mint];
    if (jupiterToken) {
      tokenMetadata = {
        mint: mint,
        symbol: jupiterToken.symbol,
        name: jupiterToken.name,
        decimals: jupiterToken.decimals,
        logoURI: jupiterToken.logoURI,
        source: 'jupiter'
      };
    }
    
    // 1.2 Si pas trouvé dans Jupiter, essayer via Birdeye
    if (!tokenMetadata) {
      try {
        const response = await birdeyeService.getTokenMetadata(mint);
        if (response?.data) {
          tokenMetadata = {
            ...response.data,
            source: 'birdeye'
          };
        }
      } catch (error) {
        console.warn(`Impossible de récupérer les métadonnées via Birdeye pour ${mint}:`, error.message);
      }
    }
    
    // Si on a des métadonnées, essayer de récupérer l'historique des prix
    if (tokenMetadata) {
      // 2.1 Essayer d'abord via Birdeye qui a le meilleur historique de prix
      try {
        // La date de la transaction timestamp est en secondes
        const timestamp = transaction.blockTime * 1000; // Convertir en millisecondes
        const oneDayBefore = timestamp - 24 * 60 * 60 * 1000;
        const oneDayAfter = timestamp + 24 * 60 * 60 * 1000;
        
        // Récupérer l'historique des prix via Birdeye
        const priceHistoryResponse = await birdeyeService.getTokenPriceHistory(
          mint,
          oneDayBefore,
          oneDayAfter,
          '15m' // Résolution de 15 minutes pour une meilleure précision
        );
        
        if (priceHistoryResponse?.data?.length > 0) {
          // Trouver le prix le plus proche de la date de la transaction
          const prices = priceHistoryResponse.data;
          let closestPrice = prices[0];
          let minDiff = Math.abs(timestamp - prices[0].unixTime);
          
          for (let i = 1; i < prices.length; i++) {
            const diff = Math.abs(timestamp - prices[i].unixTime);
            if (diff < minDiff) {
              minDiff = diff;
              closestPrice = prices[i];
            }
          }
          
          priceHistory = {
            source: 'birdeye',
            price: closestPrice.value,
            timestamp: closestPrice.unixTime,
            timeDifference: `${Math.round(minDiff / 1000 / 60)} minutes`
          };
        }
      } catch (error) {
        console.warn(`Impossible de récupérer l'historique des prix via Birdeye pour ${mint}:`, error.message);
      }
      
      // 2.2 Si pas d'historique via Birdeye, essayer via CoinGecko
      if (!priceHistory && tokenMetadata.coingeckoId) {
        try {
          const cgHistory = await coinGeckoService.getPriceAtTimestamp(
            tokenMetadata.coingeckoId,
            transaction.blockTime
          );
          
          if (cgHistory?.market_data?.current_price) {
            priceHistory = {
              source: 'coingecko',
              price: cgHistory.market_data.current_price.usd,
              timestamp: transaction.blockTime * 1000,
              timeDifference: '0 minutes'
            };
          }
        } catch (error) {
          console.warn(`Impossible de récupérer l'historique des prix via CoinGecko pour ${mint}:`, error.message);
        }
      }
      
      // 2.3 Si toujours pas d'historique et que le token est un token populaire, essayer via CryptoCompare
      if (!priceHistory && tokenMetadata.symbol) {
        try {
          const cryptoCompareService = require('../services/cryptoCompareService');
          const symbol = tokenMetadata.symbol.toUpperCase();
          
          // Seulement tenter pour les tokens populaires (SOL, USDC, USDT, etc.)
          const popularTokens = ['SOL', 'USDC', 'USDT', 'BTC', 'ETH', 'WBTC', 'BONK', 'JTO', 'RAY', 'ORCA', 'JUP'];
          
          if (popularTokens.includes(symbol)) {
            const ccHistory = await cryptoCompareService.getPriceAtTimestamp(
              symbol,
              transaction.blockTime
            );
            
            if (ccHistory && ccHistory.USD) {
              priceHistory = {
                source: 'cryptocompare',
                price: ccHistory.USD,
                timestamp: transaction.blockTime * 1000,
                timeDifference: '0 minutes'
              };
            }
          }
        } catch (error) {
          console.warn(`Impossible de récupérer l'historique des prix via CryptoCompare pour ${tokenMetadata.symbol}:`, error.message);
        }
      }
      
      // 2.4 Dernier recours: essayer de récupérer le prix actuel via Jupiter
      if (!priceHistory && tokenMetadata.symbol) {
        try {
          // Utiliser SOL comme référence pour le prix
          const solMint = 'So11111111111111111111111111111111111111112'; // wSOL mint address
          
          // Seul cas où nous utilisons Jupiter pour récupérer un prix (pas pour swap)
          const jupiterPrice = await jupiterService.getPrice(mint, solMint);
          
          if (jupiterPrice && jupiterPrice.price) {
            priceHistory = {
              source: 'jupiter_current',
              price: jupiterPrice.price, // Note: ce sera relatif à SOL, pas en USD
              priceCurrency: 'SOL',
              timestamp: Date.now(),
              timeDifference: 'current', // Indiquer que c'est le prix actuel, pas historique
              warning: 'Prix actuel, pas historique'
            };
          }
        } catch (error) {
          console.warn(`Impossible de récupérer le prix actuel via Jupiter pour ${mint}:`, error.message);
        }
      }
    }
    
    // Combiner toutes les informations et les retourner
    return {
      mint,
      symbol: tokenMetadata?.symbol || 'UNKNOWN',
      name: tokenMetadata?.name || 'Unknown Token',
      logoURI: tokenMetadata?.logoURI || null,
      decimals: tokenMetadata?.decimals || 0,
      priceHistory,
      metadata: tokenMetadata || null
    };
  });
  
  try {
    // On attend que toutes les promesses soient résolues
    const priceHistories = await Promise.all(priceHistoryPromises);
    
    // On ajoute l'historique des prix à la transaction
    enrichedTx.priceHistory = {};
    
    priceHistories.forEach(history => {
      if (history && history.mint) {
        enrichedTx.priceHistory[history.mint] = history;
        console.log(`Prix historique pour ${history.symbol} (${history.mint}): ${history.priceHistory ? 'Trouvé (source: ' + history.priceHistory.source + ')' : 'Non disponible'}`);
      }
    });
    
    console.log(`Historique des prix ajouté pour ${Object.keys(enrichedTx.priceHistory).length}/${tokenMints.size} tokens`);
    
  } catch (error) {
    console.error('Erreur lors de la récupération des historiques de prix:', error.message);
    // En cas d'erreur, retourner la transaction sans historique des prix
  }
  
  return enrichedTx;
}

/**
 * Analyse une transaction pour identifier le protocole et le type d'opération
 * @param {Object} transaction - Transaction Solana
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
    const financialActivity = await reconstructFinancialActivity(transaction);
    
    // 3. Déterminer le type général de transaction
    let transactionType = determineTransactionType(logs, programIds);
    
    // 4. Analyse spécifique selon le protocole détecté
    let protocolDetails;
    let protocol = identifyProtocol(programIds);
    
    if (protocol === 'Jupiter') {
      protocolDetails = await analyzeJupiterTransaction(transaction, financialActivity);
    } else if (protocol === 'Raydium') {
      protocolDetails = analyzeRaydiumTransaction(transaction, financialActivity, logs);
    } else if (protocol === 'Orca') {
      protocolDetails = analyzeOrcaTransaction(transaction, financialActivity, logs);
    } else if (protocol === 'Solend') {
      protocolDetails = analyzeSolendTransaction(transaction, financialActivity, logs);
    } else if (protocol === 'Marinade Finance') {
      protocolDetails = analyzeMarinadeTransaction(transaction, financialActivity, logs);
    } else if (protocol === 'Lido') {
      protocolDetails = analyzeLidoTransaction(transaction, financialActivity, logs);
    }
    
    // 5. Créer le résultat de l'analyse
    return {
      protocol,
      type: transactionType,
      financialActivity,
      programIds: Array.from(programIds).map(pid => ({
        address: pid,
        name: PROGRAM_MAP[pid] || 'Unknown Program'
      })),
      protocolDetails,
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

/**
 * Identifie les programmes impliqués dans la transaction
 * @param {Object} transaction - Transaction Solana
 * @returns {Set<string>} - Ensemble des IDs de programmes impliqués
 */
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
 * Reconstruit l'activité financière réelle en analysant les changements de soldes
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

/**
 * Détermine le type général de transaction à partir des logs et des programmes impliqués
 * @param {Array<string>} logs - Logs de la transaction
 * @param {Set<string>} programIds - Ensemble des IDs de programmes impliqués
 * @returns {string} - Type de transaction
 */
function determineTransactionType(logs, programIds) {
  // Rechercher des patterns spécifiques dans les logs
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
  
  // Type par défaut si aucun pattern spécifique n'est trouvé
  return 'unknown';
}

/**
 * Identifie le protocole principal utilisé dans la transaction
 * @param {Set<string>} programIds - Ensemble des IDs de programmes impliqués
 * @returns {string} - Nom du protocole
 */
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

/**
 * Tente de trouver l'adresse de l'utilisateur (signataire principal)
 * @param {Object} transaction - Transaction Solana
 * @returns {string|null} - Adresse de l'utilisateur ou null
 */
function findUserAddress(transaction) {
  // La première adresse dans le tableau des signataires est généralement celle de l'utilisateur
  const tx = transaction.transaction;
  if (tx && tx.signatures && tx.signatures.length > 0) {
    return tx.message?.accountKeys?.[0] || null;
  }
  return null;
}

/**
 * Analyse spécifique pour les transactions Jupiter
 * @param {Object} transaction - Transaction Solana
 * @param {Object} financialActivity - Activité financière reconstruite
 * @returns {Promise<Object>} - Détails spécifiques à Jupiter
 */
async function analyzeJupiterTransaction(transaction, financialActivity) {
  // Pour un swap Jupiter, on cherche à identifier clairement le token d'entrée et de sortie
  const { tokenChanges, solChanges } = financialActivity;
  
  // Identifier les tokens qui ont diminué (entrée) et augmenté (sortie)
  const inputTokens = tokenChanges.filter(change => change.change < 0)
    .map(token => ({
      ...token,
      amount: Math.abs(token.change)
    }));
  
  const outputTokens = tokenChanges.filter(change => change.change > 0)
    .map(token => ({
      ...token,
      amount: token.change
    }));
  
  // Vérifier si SOL est impliqué
  const solInput = solChanges.find(change => change.change < -0.00001); // Ignorer les frais
  const solOutput = solChanges.find(change => change.change > 0);
  
  if (solInput) {
    inputTokens.push({
      mint: 'So11111111111111111111111111111111111111112', // wSOL mint
      symbol: 'SOL',
      name: 'Solana',
      amount: Math.abs(solInput.change),
      native: true
    });
  }
  
  if (solOutput) {
    outputTokens.push({
      mint: 'So11111111111111111111111111111111111111112', // wSOL mint
      symbol: 'SOL',
      name: 'Solana',
      amount: solOutput.change,
      native: true
    });
  }
  
  // Calculer le taux de change effectif
  let exchangeRate = null;
  if (inputTokens.length === 1 && outputTokens.length === 1) {
    const input = inputTokens[0];
    const output = outputTokens[0];
    exchangeRate = {
      base: input.symbol,
      quote: output.symbol,
      rate: output.amount / input.amount
    };
  }
  
  // Identifier les routes utilisées (AMMs)
  const logs = transaction.meta?.logMessages || [];
  const routeInfo = extractRouteInfoFromLogs(logs);
  
  return {
    swapType: 'jupiter',
    version: transaction.transaction?.message?.instructions.some(
      ix => ix.programId === PROGRAM_IDS.JUPITER_V6.address
    ) ? 'V6' : 'V4',
    input: inputTokens.length === 1 ? inputTokens[0] : inputTokens,
    output: outputTokens.length === 1 ? outputTokens[0] : outputTokens,
    exchangeRate,
    routeInfo,
    priceImpact: extractPriceImpactFromLogs(logs)
  };
}

/**
 * Tente d'extraire les informations de route (AMMs traversés) à partir des logs
 * @param {Array<string>} logs - Logs de la transaction
 * @returns {Array<Object>} - Informations sur la route
 */
function extractRouteInfoFromLogs(logs) {
  const routeInfo = [];
  let currentAmm = null;
  
  for (const log of logs) {
    // Identifier les AMMs traversés
    if (log.includes('Program log: Route') || log.includes('Program log: AMM:')) {
      const ammMatch = log.match(/AMM: ([A-Za-z0-9]+)/i);
      if (ammMatch && ammMatch[1]) {
        currentAmm = ammMatch[1];
      }
    } 
    // Identifier les swaps au sein d'un AMM
    else if (currentAmm && (log.includes('Program log: Swap') || log.includes('Program log: in:') || log.includes('Program log: out:'))) {
      // Extraire les informations d'entrée/sortie si disponibles
      const inMatch = log.match(/in: (\d+\.?\d*)/i);
      const outMatch = log.match(/out: (\d+\.?\d*)/i);
      
      if (inMatch || outMatch) {
        routeInfo.push({
          amm: currentAmm,
          in: inMatch ? parseFloat(inMatch[1]) : null,
          out: outMatch ? parseFloat(outMatch[1]) : null
        });
      }
    }
  }
  
  return routeInfo;
}

/**
 * Tente d'extraire l'impact sur le prix à partir des logs
 * @param {Array<string>} logs - Logs de la transaction
 * @returns {string|null} - Impact sur le prix
 */
function extractPriceImpactFromLogs(logs) {
  for (const log of logs) {
    const impactMatch = log.match(/Price impact: (\d+\.?\d*%)/i);
    if (impactMatch) {
      return impactMatch[1];
    }
  }
  
  return null;
}

/**
 * Analyse spécifique pour les transactions Raydium
 * @param {Object} transaction - Transaction Solana
 * @param {Object} financialActivity - Activité financière reconstruite
 * @param {Array<string>} logs - Logs de la transaction
 * @returns {Object} - Détails spécifiques à Raydium
 */
function analyzeRaydiumTransaction(transaction, financialActivity, logs) {
  // Déterminer le type d'opération Raydium
  let subType = 'unknown';
  
  if (logs.some(log => log.includes('Instruction: Swap'))) {
    subType = 'swap';
    return analyzeRaydiumSwap(transaction, financialActivity);
  } else if (logs.some(log => log.includes('Instruction: AddLiquidity'))) {
    subType = 'add_liquidity';
    return analyzeRaydiumLiquidity(transaction, financialActivity, 'add');
  } else if (logs.some(log => log.includes('Instruction: RemoveLiquidity'))) {
    subType = 'remove_liquidity';
    return analyzeRaydiumLiquidity(transaction, financialActivity, 'remove');
  } else if (logs.some(log => log.includes('Instruction: Stake'))) {
    subType = 'stake';
  } else if (logs.some(log => log.includes('Instruction: Harvest'))) {
    subType = 'harvest';
  }
  
  // Analyse par défaut
  return {
    subType,
    dexType: transaction.transaction?.message?.instructions.some(
      ix => ix.programId === PROGRAM_IDS.RAYDIUM_CLMM.address
    ) ? 'CLMM' : 'AMM',
    financialChanges: {
      tokenChanges: financialActivity.tokenChanges,
      solChanges: financialActivity.solChanges
    }
  };
}

/**
 * Analyse spécifique pour un swap Raydium
 * @param {Object} transaction - Transaction Solana
 * @param {Object} financialActivity - Activité financière reconstruite
 * @returns {Object} - Détails du swap Raydium
 */
function analyzeRaydiumSwap(transaction, financialActivity) {
  // Logique similaire à Jupiter pour identifier entrée/sortie
  return {
    subType: 'swap',
    dexType: transaction.transaction?.message?.instructions.some(
      ix => ix.programId === PROGRAM_IDS.RAYDIUM_CLMM.address
    ) ? 'CLMM' : 'AMM'
  };
}

/**
 * Analyse spécifique pour les opérations de liquidité Raydium
 * @param {Object} transaction - Transaction Solana
 * @param {Object} financialActivity - Activité financière reconstruite
 * @param {string} operation - Type d'opération ('add' ou 'remove')
 * @returns {Object} - Détails de l'opération de liquidité Raydium
 */
function analyzeRaydiumLiquidity(transaction, financialActivity, operation) {
  return {
    subType: `${operation}_liquidity`,
    dexType: transaction.transaction?.message?.instructions.some(
      ix => ix.programId === PROGRAM_IDS.RAYDIUM_CLMM.address
    ) ? 'CLMM' : 'AMM'
  };
}

/**
 * Analyse spécifique pour les transactions Orca
 * @param {Object} transaction - Transaction Solana
 * @param {Object} financialActivity - Activité financière reconstruite
 * @param {Array<string>} logs - Logs de la transaction
 * @returns {Object} - Détails spécifiques à Orca
 */
function analyzeOrcaTransaction(transaction, financialActivity, logs) {
  return {
    protocol: 'Orca',
    version: transaction.transaction?.message?.instructions.some(
      ix => ix.programId === PROGRAM_IDS.ORCA_WHIRLPOOL.address
    ) ? 'Whirlpool' : 'V2'
  };
}

/**
 * Analyse spécifique pour les transactions Solend
 * @param {Object} transaction - Transaction Solana
 * @param {Object} financialActivity - Activité financière reconstruite
 * @param {Array<string>} logs - Logs de la transaction
 * @returns {Object} - Détails spécifiques à Solend
 */
function analyzeSolendTransaction(transaction, financialActivity, logs) {
  return {
    protocol: 'Solend'
  };
}

/**
 * Analyse spécifique pour les transactions Marinade
 * @param {Object} transaction - Transaction Solana
 * @param {Object} financialActivity - Activité financière reconstruite
 * @param {Array<string>} logs - Logs de la transaction
 * @returns {Object} - Détails spécifiques à Marinade
 */
function analyzeMarinadeTransaction(transaction, financialActivity, logs) {
  return {
    protocol: 'Marinade Finance'
  };
}

/**
 * Analyse spécifique pour les transactions Lido
 * @param {Object} transaction - Transaction Solana
 * @param {Object} financialActivity - Activité financière reconstruite
 * @param {Array<string>} logs - Logs de la transaction
 * @returns {Object} - Détails spécifiques à Lido
 */
function analyzeLidoTransaction(transaction, financialActivity, logs) {
  return {
    protocol: 'Lido'
  };
}

module.exports = router;