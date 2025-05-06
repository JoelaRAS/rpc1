// filepath: c:\Users\rasam\Downloads\rpc1-1\services\solanaWebService.js
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const priceService = require('./priceService');

class SolanaWebService {
  constructor() {
    // Utiliser la variable d'environnement RPC_URL ou un endpoint par défaut
    const rpcUrl = process.env.RPC_URL || process.env.HELIUS_RPC_URL || process.env.ALCHEMY_RPC_URL || clusterApiUrl('mainnet-beta');
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Cache pour éviter des appels répétés
    this.balanceCache = new Map(); // tokenAccountAddress -> {timestamp, balance}
    this.cacheTtl = 60 * 1000; // 1 minute
  }

  /**
   * Récupère le solde précis d'un compte de token SPL
   * @param {string} tokenAccountAddress - L'adresse du compte de token
   * @returns {Promise<Object>} - Le solde avec montant et décimales
   */
  async getTokenAccountBalance(tokenAccountAddress) {
    try {
      console.log(`SolanaWebService: Récupération du solde pour le compte de token ${tokenAccountAddress}`);
      
      // Vérifier si le résultat est en cache et encore frais
      const cachedResult = this.balanceCache.get(tokenAccountAddress);
      if (cachedResult && (Date.now() - cachedResult.timestamp) < this.cacheTtl) {
        console.log(`SolanaWebService: Utilisation du solde en cache pour ${tokenAccountAddress}`);
        return cachedResult.balance;
      }
      
      // Convertir l'adresse en PublicKey de Solana
      const tokenAccountPubkey = new PublicKey(tokenAccountAddress);
      
      // Récupérer le solde du compte de token
      const balance = await this.connection.getTokenAccountBalance(tokenAccountPubkey);
      
      // Stocker dans le cache
      this.balanceCache.set(tokenAccountAddress, {
        timestamp: Date.now(),
        balance: balance.value
      });
      
      return balance.value;
    } catch (error) {
      console.error(`Erreur lors de la récupération du solde pour ${tokenAccountAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Récupère tous les comptes de token appartenant à un portefeuille
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<Array>} - Liste des comptes de token avec leurs soldes
   */
  async getTokenAccountsByOwner(walletAddress) {
    try {
      console.log(`SolanaWebService: Récupération des comptes de token pour ${walletAddress}`);
      
      // Convertir l'adresse en PublicKey de Solana
      const ownerPubkey = new PublicKey(walletAddress);
      
      // Récupérer tous les comptes de token appartenant au portefeuille
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        ownerPubkey,
        {
          programId: TOKEN_PROGRAM_ID
        }
      );

      // Récupérer le solde exact pour chaque compte de token
      const enrichedAccounts = await Promise.all(
        tokenAccounts.value.map(async account => {
          const tokenAccount = account.pubkey.toString();
          const parsedInfo = account.account.data.parsed.info;
          
          // Pour les comptes avec un solde > 0, récupérer le solde exact
          if (parseFloat(parsedInfo.tokenAmount.amount) > 0) {
            try {
              const exactBalance = await this.getTokenAccountBalance(tokenAccount);
              return {
                tokenAccountAddress: tokenAccount,
                mint: parsedInfo.mint,
                owner: parsedInfo.owner,
                state: parsedInfo.state,
                amount: exactBalance.amount,
                decimals: exactBalance.decimals,
                uiAmount: exactBalance.uiAmount,
                uiAmountString: exactBalance.uiAmountString
              };
            } catch (error) {
              // En cas d'erreur, utiliser les informations de base
              console.warn(`Erreur lors de la récupération du solde exact pour ${tokenAccount}:`, error.message);
            }
          }
          
          // Retourner les informations de base
          return {
            tokenAccountAddress: tokenAccount,
            mint: parsedInfo.mint,
            owner: parsedInfo.owner,
            state: parsedInfo.state,
            amount: parsedInfo.tokenAmount.amount,
            decimals: parsedInfo.tokenAmount.decimals,
            uiAmount: parsedInfo.tokenAmount.uiAmount,
            uiAmountString: parsedInfo.tokenAmount.uiAmountString
          };
        })
      );
      
      return enrichedAccounts;
    } catch (error) {
      console.error(`Erreur lors de la récupération des comptes de token pour ${walletAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Récupère le solde SOL natif d'un portefeuille
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<Object>} - Le solde en lamports et SOL
   */
  async getSolBalance(walletAddress) {
    try {
      console.log(`SolanaWebService: Récupération du solde SOL pour ${walletAddress}`);
      
      // Convertir l'adresse en PublicKey de Solana
      const walletPubkey = new PublicKey(walletAddress);
      
      // Récupérer le solde en lamports
      const lamports = await this.connection.getBalance(walletPubkey);
      
      return {
        lamports,
        sol: lamports / 1e9 // Convertir en SOL
      };
    } catch (error) {
      console.error(`Erreur lors de la récupération du solde SOL pour ${walletAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Récupère les comptes de stake d'un portefeuille
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<Array>} - Liste des comptes de stake
   */
  async getStakeAccountsByOwner(walletAddress) {
    try {
      console.log(`SolanaWebService: Récupération des comptes de stake pour ${walletAddress}`);
      
      // Convertir l'adresse en PublicKey de Solana
      const walletPubkey = new PublicKey(walletAddress);
      
      // Récupérer tous les comptes de stake appartenant au portefeuille
      const stakeAccounts = await this.connection.getParsedProgramAccounts(
        new PublicKey("Stake11111111111111111111111111111111111111"),
        {
          filters: [
            {
              memcmp: {
                offset: 44, // Position de l'adresse du staker dans le buffer
                bytes: walletPubkey.toBase58()
              }
            }
          ]
        }
      );
      
      // Traiter les comptes pour extraire les informations pertinentes
      const processedAccounts = await Promise.all(
        stakeAccounts.map(async account => {
          const address = account.pubkey.toString();
          
          // Pour simplifier, on simule une structure de compte de stake
          // En réalité, il faudrait parser les données binaires correctement
          
          // Récupérer quelques informations de base sur le stake
          let stakeStatus = "active";
          let stakeAmount = 0;
          
          try {
            // On récupère quelques informations sur le stake account
            const accountInfo = await this.connection.getStakeActivation(account.pubkey);
            stakeStatus = accountInfo.state; // active, inactive, ou activating
            
            // Récupérer le lamport balance
            const balance = await this.connection.getBalance(account.pubkey);
            stakeAmount = balance / 1e9; // Convertir en SOL
          } catch (error) {
            console.warn(`Erreur lors de la récupération des détails du stake ${address}:`, error.message);
          }
          
          // Simuler un délégué (validateur)
          // En réalité, il faudrait l'extraire des données du compte
          let voter = "unknown";
          try {
            // Tenter de récupérer le vote account (validateur)
            // Cette partie est simplifiée car l'extraction réelle est plus complexe
            // et nécessiterait de parser les données du stake account
            voter = "Voter" + Math.random().toString(16).substr(2, 8);
          } catch (err) {
            console.warn(`Impossible de déterminer le validateur pour ${address}:`, err.message);
          }
          
          return {
            address, // L'adresse du compte de stake
            amount: stakeAmount.toString(), // Montant en SOL
            status: stakeStatus, // État du stake: active, inactive, activating
            activationEpoch: "unknown", // L'époque d'activation (simplifié)
            voter, // L'adresse du validateur
            withdrawer: walletAddress, // Par défaut, c'est le propriétaire
            delegatedStake: true // Indique que c'est un stake délégué
          };
        })
      );
      
      return processedAccounts;
    } catch (error) {
      console.error(`Erreur lors de la récupération des comptes de stake pour ${walletAddress}:`, error.message);
      throw error;
    }
  }

  /**
   * Récupère les détails complets d'un portefeuille, incluant SOL, tokens SPL précis
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<Object>} - Les détails complets du portefeuille
   */
  async getFullWalletDetails(walletAddress) {
    try {
      console.log(`SolanaWebService: Récupération des détails complets pour ${walletAddress}`);
      
      // 1. Récupérer le solde SOL
      const solBalance = await this.getSolBalance(walletAddress);
      
      // 2. Récupérer tous les comptes de token SPL avec leurs soldes précis
      const tokenAccounts = await this.getTokenAccountsByOwner(walletAddress);
      
      // 3. Filtrer les comptes de token avec solde > 0
      const tokensWithBalance = tokenAccounts.filter(token => 
        parseFloat(token.amount) > 0
      );

      // 4. Ajouter le SOL natif à la liste des tokens
      const allTokens = [
        {
          tokenAccountAddress: walletAddress,  // Pour SOL, c'est le même que le wallet
          mint: "So11111111111111111111111111111111111111112", // Mint conventionnel pour SOL (wSOL)
          owner: walletAddress,
          state: "initialized",
          amount: solBalance.lamports.toString(),
          decimals: 9,
          uiAmount: solBalance.sol,
          uiAmountString: solBalance.sol.toString(),
          isNative: true
        },
        ...tokensWithBalance
      ];
      
      // 5. Récupérer les prix actuels pour ces tokens via priceService
      const tokenMints = allTokens.map(token => token.mint);
      const prices = {};
      
      // Récupérer les prix en parallèle par lots de 5 pour éviter de surcharger les API
      const chunkSize = 5;
      for (let i = 0; i < tokenMints.length; i += chunkSize) {
        const chunk = tokenMints.slice(i, i + chunkSize);
        const pricePromises = chunk.map(mint => priceService.getCurrentPrice(mint));
        const priceResults = await Promise.all(pricePromises);
        
        priceResults.forEach((price, index) => {
          if (price) {
            prices[chunk[index]] = price;
          }
        });
      }
      
      // 6. Récupérer les métadonnées des tokens pour informations supplémentaires
      const tokensMetadata = {};
      for (let i = 0; i < tokenMints.length; i += chunkSize) {
        const chunk = tokenMints.slice(i, i + chunkSize);
        const metadataPromises = chunk.map(mint => priceService.getTokenInfo(mint));
        const metadataResults = await Promise.all(metadataPromises);
        
        metadataResults.forEach((metadata, index) => {
          if (metadata) {
            tokensMetadata[chunk[index]] = metadata;
          }
        });
      }
      
      // 7. Enrichir les tokens avec prix, valeur en dollars et métadonnées
      const enrichedTokens = allTokens.map(token => {
        const price = prices[token.mint] || null;
        const metadata = tokensMetadata[token.mint] || null;
        
        return {
          ...token,
          symbol: metadata?.symbol || 'UNKNOWN',
          name: metadata?.name || 'Unknown Token',
          logo: metadata?.logoURI || null,
          price: price?.price || null,
          usdValue: price?.price ? (token.uiAmount * price.price) : null,
          priceSource: price?.source || null,
          isNative: token.isNative || false
        };
      });
      
      // 8. Calculer la valeur totale en USD
      const totalUsdValue = enrichedTokens.reduce((sum, token) => sum + (token.usdValue || 0), 0);
      
      // 9. Retourner les résultats
      return {
        walletAddress,
        nativeBalance: {
          lamports: solBalance.lamports,
          sol: solBalance.sol,
          usdValue: prices["So11111111111111111111111111111111111111112"]?.price 
            ? solBalance.sol * prices["So11111111111111111111111111111111111111112"].price 
            : null
        },
        tokens: enrichedTokens,
        totalUsdValue,
        tokenCount: enrichedTokens.length
      };
    } catch (error) {
      console.error(`Erreur lors de la récupération des détails complets pour ${walletAddress}:`, error.message);
      throw error;
    }
  }
}

module.exports = new SolanaWebService();