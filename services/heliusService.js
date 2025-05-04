const axios = require('axios');

class HeliusService {
  constructor() {
    this.apiKey = process.env.HELIUS_API_KEY;
    this.baseURL = `https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`;
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
            return null;
          })
      );
      
      // 3. Attendre toutes les requêtes et filtrer les échecs
      const transactions = await Promise.all(transactionPromises);
      const validTransactions = transactions.filter(tx => tx !== null);
      
      console.log(`Récupéré les détails de ${validTransactions.length}/${signatures.length} transactions`);
      
      // 4. Pour chaque transaction, ajouter sa signature
      return validTransactions.map((tx, index) => {
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
}

module.exports = new HeliusService();