const axios = require('axios');
const { PublicKey } = require('@solana/web3.js');

class AlchemyService {
  constructor() {
    this.apiKey = process.env.ALCHEMY_API_KEY;
    this.baseURL = process.env.ALCHEMY_RPC_URL || `https://solana-mainnet.g.alchemy.com/v2/${this.apiKey}`;
  }

  /**
   * Récupère les soldes SOL et SPL Token d'un portefeuille
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<Object>} - Les soldes du portefeuille
   */
  async getBalances(walletAddress) {
    try {
      // 1. Récupérer le solde SOL
      const solResponse = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "sol-balance",
        method: "getBalance",
        params: [walletAddress]
      });
      
      // 2. Récupérer les tokens SPL
      const tokensResponse = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "token-accounts",
        method: "getTokenAccountsByOwner",
        params: [
          walletAddress,
          {
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" // SPL Token program ID
          },
          {
            encoding: "jsonParsed"
          }
        ]
      });
      
      // Formater la réponse
      return {
        nativeBalance: {
          lamports: solResponse.data.result?.value || 0,
          solAmount: (solResponse.data.result?.value || 0) / 1e9
        },
        tokenAccounts: tokensResponse.data.result?.value || []
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des soldes avec Alchemy:', error);
      throw error;
    }
  }

  /**
   * Récupère l'historique des transactions d'un portefeuille avec des métadonnées enrichies
   * @param {string} walletAddress - L'adresse du portefeuille
   * @param {Object} options - Options de pagination et filtrage
   * @returns {Promise<Object>} - Liste des transactions enrichies avec métadonnées
   */
  async getEnrichedTransactions(walletAddress, options = {}) {
    try {
      const { limit = 10, before = null, toBlock = null, fromBlock = null } = options;
      
      // Utiliser la méthode getSignaturesForAddress pour obtenir les signatures des transactions
      const signatureResponse = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "signatures",
        method: "getSignaturesForAddress",
        params: [
          walletAddress,
          {
            limit,
            ...(before ? { before } : {}),
            ...(fromBlock ? { fromBlock: parseInt(fromBlock) } : {}),
            ...(toBlock ? { toBlock: parseInt(toBlock) } : {}),
          }
        ]
      });
      
      const signatures = signatureResponse.data.result || [];
      
      // Si aucune signature n'est trouvée, retourner un résultat vide
      if (!signatures || signatures.length === 0) {
        return {
          results: [],
          total: 0
        };
      }
      
      // Pour chaque signature, récupérer les détails de la transaction
      const transactionPromises = signatures.map(sig => {
        return axios.post(this.baseURL, {
          jsonrpc: "2.0",
          id: "tx-details",
          method: "getTransaction",
          params: [
            sig.signature,
            { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
          ]
        })
        .then(resp => {
          // S'assurer que la signature est présente dans l'objet de transaction retourné
          const transaction = resp.data.result;
          if (transaction) {
            // Ajouter la signature à l'objet transaction si elle n'existe pas déjà
            if (!transaction.transaction.signatures || transaction.transaction.signatures.length === 0) {
              transaction.transaction.signatures = [sig.signature];
            }
          }
          return transaction;
        })
        .catch(err => {
          console.warn(`Échec de la récupération des détails pour la transaction ${sig.signature}:`, err.message);
          return null;
        });
      });
      
      // Exécuter toutes les requêtes en parallèle et filtrer les résultats nuls
      const transactions = (await Promise.all(transactionPromises)).filter(tx => tx !== null);
      
      return {
        results: transactions,
        total: signatures.length
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des transactions enrichies:', error);
      return {
        results: [],
        total: 0
      };
    }
  }

  /**
   * Récupère les mouvements de tokens (token transfers) pour un portefeuille donné
   * @param {string} walletAddress - L'adresse du portefeuille
   * @param {Object} options - Options de pagination et filtrage
   * @returns {Promise<Array>} - Liste des token transfers
   */
  async getTokenTransfers(walletAddress, options = {}) {
    try {
      // Cette fonctionnalité nécessite de combiner plusieurs appels RPC standard
      // et d'analyser les données manuellement
      
      const { limit = 100 } = options;
      
      // 1. Récupérer les signatures récentes
      const signatureResponse = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "signatures",
        method: "getSignaturesForAddress",
        params: [
          walletAddress,
          { limit }
        ]
      });
      
      const signatures = signatureResponse.data.result || [];
      
      // 2. Analyser chaque transaction pour trouver les transferts de tokens
      const tokenTransfers = [];
      
      for (const sig of signatures) {
        try {
          const txResponse = await axios.post(this.baseURL, {
            jsonrpc: "2.0",
            id: "tx-details",
            method: "getTransaction",
            params: [
              sig.signature,
              { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
            ]
          });
          
          const tx = txResponse.data.result;
          if (!tx) continue;
          
          // Analyser la transaction pour identifier les transferts de tokens
          const transfers = this._extractTokenTransfers(tx, walletAddress);
          if (transfers.length > 0) {
            tokenTransfers.push(...transfers.map(transfer => ({
              ...transfer,
              signature: sig.signature,
              timestamp: tx.blockTime ? tx.blockTime * 1000 : null
            })));
          }
        } catch (e) {
          console.warn(`Échec de l'analyse des transferts pour la transaction ${sig.signature}:`, e.message);
        }
      }
      
      return tokenTransfers;
    } catch (error) {
      console.error('Erreur lors de la récupération des token transfers:', error);
      throw error;
    }
  }

  /**
   * Méthode auxiliaire pour extraire les transferts de tokens d'une transaction
   * @private
   */
  _extractTokenTransfers(transaction, walletAddress) {
    const transfers = [];
    try {
      if (!transaction.meta || !transaction.transaction) {
        return transfers;
      }
      
      // Analyser les instructions de la transaction pour trouver les transferts SPL
      const instructions = transaction.transaction.message.instructions || [];
      for (const ix of instructions) {
        if (ix.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' && 
            ix.parsed && ix.parsed.type === 'transfer') {
          
          const info = ix.parsed.info;
          if (info.source === walletAddress || info.destination === walletAddress) {
            transfers.push({
              tokenMint: info.mint,
              fromAddress: info.source,
              toAddress: info.destination,
              amount: info.amount,
              isIncoming: info.destination === walletAddress,
              decimals: info.decimals || 0
            });
          }
        }
      }

      // Vérifier aussi les pré/post balances pour les transferts SOL
      if (transaction.meta.preBalances && transaction.meta.postBalances) {
        const accountKeys = transaction.transaction.message.accountKeys || [];
        
        for (let i = 0; i < accountKeys.length; i++) {
          const preBalance = transaction.meta.preBalances[i] || 0;
          const postBalance = transaction.meta.postBalances[i] || 0;
          const diff = postBalance - preBalance;
          
          if (Math.abs(diff) > 0 && accountKeys[i] === walletAddress) {
            transfers.push({
              tokenMint: 'native', // SOL natif
              fromAddress: diff < 0 ? walletAddress : 'unknown',
              toAddress: diff > 0 ? walletAddress : 'unknown',
              amount: Math.abs(diff),
              isIncoming: diff > 0,
              decimals: 9  // SOL a 9 décimales
            });
          }
        }
      }
      
      return transfers;
    } catch (e) {
      console.warn('Erreur lors de l\'extraction des transferts de tokens:', e.message);
      return transfers;
    }
  }

  /**
   * Récupère les métadonnées d'un token SPL
   * @param {string} mintAddress - L'adresse de mint du token
   * @returns {Promise<Object>} - Les métadonnées du token
   */
  async getTokenMetadata(mintAddress) {
    try {
      // Utiliser l'API standard de Solana pour récupérer les métadonnées
      const response = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "token-metadata",
        method: "getAccountInfo",
        params: [
          mintAddress,
          { encoding: "jsonParsed" }
        ]
      });
      
      const accountInfo = response.data.result?.value;
      
      if (!accountInfo || accountInfo.owner !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
        throw new Error('Adresse de mint invalide');
      }
      
      // Extraire les métadonnées de base du token
      return {
        mint: mintAddress,
        decimals: accountInfo.data.parsed.info.decimals,
        supply: accountInfo.data.parsed.info.supply,
        isInitialized: accountInfo.data.parsed.info.isInitialized,
        mintAuthority: accountInfo.data.parsed.info.mintAuthority,
        freezeAuthority: accountInfo.data.parsed.info.freezeAuthority
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des métadonnées du token:', error);
      throw error;
    }
  }
}

module.exports = new AlchemyService();