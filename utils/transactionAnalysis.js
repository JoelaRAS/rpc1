const { PublicKey } = require('@solana/web3.js');
const birdeyeService = require('../services/birdeyeService');

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
    const financialActivity = await reconstructFinancialActivity(transaction);
    
    // 3. Déterminer le type général de transaction
    let transactionType = determineTransactionType(logs, programIds);
    
    // 4. Identifier le protocole
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

module.exports = {
  extractTokenMintsFromTransaction,
  analyzeAlchemyTransaction,
  analyzeTransaction,
  identifyInvolvedPrograms,
  reconstructFinancialActivity,
  determineTransactionType,
  identifyProtocol,
  findUserAddress
};