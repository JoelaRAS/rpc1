const axios = require('axios');

class HeliusService {
  constructor() {
    this.apiKey = process.env.HELIUS_API_KEY;
    this.baseURL = `https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`;
    this.specificHeliusUrl = "https://mainnet.helius-rpc.com/?api-key=f67b5652-9d49-4fd7-9286-e927ec98a6dc";
  }

  /**
   * Récupère le solde des tokens dans un portefeuille
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<Array>} - Les tokens et leurs soldes
   */
  async getTokenBalances(walletAddress) {
    try {
      const response = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "my-id",
        method: "getTokenAccountsByOwner",
        params: [
          walletAddress,
          { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
          { encoding: "jsonParsed", commitment: "confirmed" }
        ]
      });

      return response.data.result.value;
    } catch (error) {
      console.error('Erreur lors de la récupération des soldes de tokens:', error);
      throw error;
    }
  }

  /**
   * Récupère l'historique des transactions d'un portefeuille
   * @param {string} walletAddress - L'adresse du portefeuille
   * @param {number} limit - Nombre de transactions à récupérer
   * @param {string} before - Signature de transaction pour pagination (optionnel)
   * @returns {Promise<Array>} - Liste des transactions
   */
  async getTransactionHistory(walletAddress, limit = 100, before = null) {
    try {
      const params = { account: walletAddress };
      
      if (before) {
        params.before = before;
      }

      const response = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "my-id",
        method: "getSignaturesForAddress",
        params: [walletAddress, { limit, commitment: "confirmed" }]
      });

      return response.data.result;
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'historique des transactions:', error);
      throw error;
    }
  }

  /**
   * Récupère et enrichit l'historique des transactions d'un portefeuille
   * @param {string} walletAddress - L'adresse du portefeuille
   * @param {number} limit - Nombre de transactions à récupérer
   * @param {string} before - Signature de transaction pour pagination (optionnel)
   * @returns {Promise<Array>} - Liste des transactions enrichies
   */
  async getEnrichedTransactionHistory(walletAddress, limit = 100, before = null) {
    try {
      // 1. D'abord, récupérer les signatures des transactions
      const signatures = await this.getTransactionHistory(walletAddress, limit, before);
      console.log(`Récupéré ${signatures.length} signatures pour ${walletAddress}`);
      
      if (!signatures || signatures.length === 0) {
        return [];
      }
      
      // 2. Récupérer les détails de chaque transaction en parallèle
      const transactionPromises = signatures.map(sig => 
        this.getTransaction(sig.signature)
          .catch(err => {
            console.error(`Erreur pour la transaction ${sig.signature}: ${err.message}`);
            // Au lieu de retourner null, retourner un objet avec des informations minimales
            return {
              transaction: {
                signatures: [sig.signature],
                message: {
                  accountKeys: []
                }
              },
              meta: {
                err: true,
                errorReason: err.message
              },
              blockTime: sig.blockTime,
              slot: sig.slot,
              _fetchFailed: true, // Marqueur pour indiquer que la récupération a échoué
              _fetchError: err.message // Message d'erreur pour le débogage
            };
          })
      );
      
      // 3. Attendre toutes les requêtes
      const transactions = await Promise.all(transactionPromises);
      
      // 4. Ne plus filtrer les échecs, mais compter les réussites vs échecs
      const successCount = transactions.filter(tx => !tx._fetchFailed).length;
      console.log(`Récupéré les détails de ${successCount}/${signatures.length} transactions (${transactions.length - successCount} échecs conservés)`);
      
      // 5. Pour chaque transaction, ajouter sa signature
      return transactions.map((tx, index) => {
        return {
          ...tx,
          signature: signatures[index].signature
        };
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des transactions enrichies:', error);
      throw error;
    }
  }

  /**
   * Récupère les détails d'une transaction
   * @param {string} signature - La signature de la transaction
   * @returns {Promise<Object>} - Détails de la transaction
   */
  async getTransaction(signature) {
    try {
      const response = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "my-id",
        method: "getTransaction",
        params: [
          signature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
        ]
      });

      return response.data.result;
    } catch (error) {
      console.error('Erreur lors de la récupération des détails de la transaction:', error);
      throw error;
    }
  }

  /**
   * Récupère les NFTs dans un portefeuille
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<Array>} - Les NFTs du portefeuille
   */
  async getNFTsForOwner(walletAddress) {
    try {
      const response = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "my-id",
        method: "getAssetsByOwner",
        params: [
          walletAddress,
          { page: 1, limit: 100 }
        ]
      });

      // Gérer différentes structures possibles de réponse
      const result = response?.data?.result;
      
      // Vérifier si result contient items ou est un tableau directement
      if (Array.isArray(result)) {
        return result;
      } else if (result && Array.isArray(result.items)) {
        return result.items;
      } else if (result && result.assets && Array.isArray(result.assets)) {
        return result.assets;
      } else {
        console.warn('Format de réponse Helius inattendu pour les NFTs:', result);
        return []; // Retourner un tableau vide en cas de structure inattendue
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des NFTs:', error);
      return []; // Retourner un tableau vide en cas d'erreur
    }
  }

  /**
   * Récupère les assets d'un portefeuille en utilisant l'API spécifique Helius
   * Cette méthode permet une meilleure distinction entre tokens et NFTs
   * @param {string} walletAddress - L'adresse du portefeuille
   * @param {number} page - Numéro de page pour la pagination
   * @param {number} limit - Nombre d'éléments par page
   * @returns {Promise<Array>} - Les assets du portefeuille
   */
  async getAssetsByOwner(walletAddress, page = 1, limit = 1000) {
    try {
      console.log(`Récupération des assets pour ${walletAddress} via l'API Helius spécifique (page ${page})`);
      
      const response = await axios.post(this.specificHeliusUrl, {
        jsonrpc: "2.0",
        id: 1,
        method: "getAssetsByOwner",
        params: {
          ownerAddress: walletAddress,
          page: page,
          limit: limit
        }
      });

      // Vérifier la structure de la réponse
      if (response.data && response.data.result) {
        const assets = response.data.result.items || response.data.result;
        console.log(`Récupéré ${assets.length} assets pour ${walletAddress}`);
        return assets;
      } else {
        console.warn('Format de réponse Helius inattendu pour les assets:', response.data);
        return [];
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des assets via Helius:', error.message);
      if (error.response) {
        console.error('Détails de l\'erreur Helius:', error.response.data);
      }
      return []; // Retourner un tableau vide en cas d'erreur
    }
  }
  
  /**
   * Version améliorée qui distingue mieux les NFTs des tokens fongibles
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<{nfts: Array, tokens: Array}>} - Les NFTs et tokens séparés
   */
  async getAssetsByOwnerWithSeparation(walletAddress) {
    try {
      const assets = await this.getAssetsByOwner(walletAddress);
      
      // Séparer les NFTs des tokens fongibles
      const nfts = [];
      const tokens = [];
      
      for (const asset of assets) {
        // Si l'asset a un attribut "content" ou "metadata" et une édition de 0 ou 1, c'est probablement un NFT
        if ((asset.content || asset.metadata) && (!asset.tokenInfo || asset.tokenInfo.supply === 1)) {
          nfts.push(asset);
        } else {
          tokens.push(asset);
        }
      }
      
      console.log(`Séparation des assets: ${nfts.length} NFTs et ${tokens.length} tokens fongibles`);
      
      return {
        nfts,
        tokens
      };
    } catch (error) {
      console.error('Erreur lors de la séparation des assets:', error.message);
      return { nfts: [], tokens: [] };
    }
  }
}

module.exports = new HeliusService();