const axios = require('axios');
const { PublicKey } = require('@solana/web3.js');
const priceService = require('./priceService');

class AlchemyService {
  constructor() {
    this.apiKey = process.env.ALCHEMY_API_KEY;
    this.baseURL = process.env.ALCHEMY_RPC_URL || `https://solana-mainnet.g.alchemy.com/v2/${this.apiKey}`;
  }

  /**
   * Récupère les détails d'une transaction spécifique par sa signature
   * @param {string} signature - La signature de la transaction
   * @returns {Promise<Object|null>} - La transaction complète ou null si non trouvée
   */
  async getTransaction(signature) {
    try {
      const response = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "tx-details",
        method: "getTransaction",
        params: [
          signature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
        ]
      });
      
      return response.data.result;
    } catch (error) {
      console.error(`Erreur lors de la récupération de la transaction ${signature}:`, error.message);
      return null;
    }
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
   * Récupère les informations sur les tokens stakés via des programmes spécifiques
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<Array>} - Liste des tokens stakés
   */
  async getStakedTokens(walletAddress) {
    try {
      console.log(`AlchemyService: Récupération des tokens stakés pour ${walletAddress}`);
      
      // Cette méthode utilise un endpoint spécifique d'Alchemy pour les tokens stakés
      // Attention: certains de ces endpoints peuvent ne pas être disponibles
      
      // 1. D'abord, on récupère les comptes de staking SOL standard
      const stakedTokens = [];
      
      try {
        const response = await axios.post(this.baseURL, {
          jsonrpc: "2.0",
          id: "staked-tokens",
          method: "getStakeAccounts", // Endpoint standard pour le staking SOL
          params: [
            {
              "staker": walletAddress
            }
          ]
        });
        
        // Analyser les comptes de staking (format Solana standard)
        const stakingAccounts = response.data.result?.value || [];
        stakingAccounts.forEach(account => {
          const stakeInfo = account.account.stake;
          stakedTokens.push({
            stakingAccount: account.pubkey,
            amount: stakeInfo?.delegation?.stake || 0,
            delegatedValidator: stakeInfo?.delegation?.voter || null,
            status: stakeInfo?.delegation ? "active" : "inactive",
            activationEpoch: stakeInfo?.delegation?.activationEpoch,
            isNative: true, // Staking SOL natif
            platform: "Solana Native Staking"
          });
        });
      } catch (error) {
        console.warn('Erreur lors de la récupération des comptes de staking SOL standard:', error.message);
      }
      
      // 2. Ensuite, on recherche les tokens stakés dans des protocoles connus
      const programIds = [
        "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", // Jupiter Staking
        "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy", // Marinade Staking
        "EhhTKczWMGQt46ynNeRX1WfeagwwJd7ufHvCDjRxjo5Q", // Lido Staking
      ];
      
      // Pour chaque programme, on utilise getProgramAccounts pour chercher les comptes associés
      for (const programId of programIds) {
        let platform = "Unknown Protocol";
        
        // Déterminer le nom du protocole basé sur le programId
        if (programId === "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4") {
          platform = "Jupiter";
        } else if (programId === "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy") {
          platform = "Marinade Finance";
        } else if (programId === "EhhTKczWMGQt46ynNeRX1WfeagwwJd7ufHvCDjRxjo5Q") {
          platform = "Lido";
        }
        
        try {
          // On cherche les comptes du programme qui sont liés à l'utilisateur
          const programResponse = await axios.post(this.baseURL, {
            jsonrpc: "2.0",
            id: `program-accounts-${programId}`,
            method: "getProgramAccounts",
            params: [
              programId,
              {
                filters: [
                  {
                    memcmp: {
                      offset: 8, // Offset commun pour le champ 'owner' dans plusieurs protocoles
                      bytes: walletAddress
                    }
                  }
                ],
                encoding: "jsonParsed"
              }
            ]
          });
          
          const accounts = programResponse.data.result || [];
          
          // Traiter chaque compte trouvé
          for (const account of accounts) {
            stakedTokens.push({
              stakingAccount: account.pubkey,
              programId,
              platform,
              // Les détails spécifiques dépendent de la structure de données de chaque protocole
              // Dans un environnement de production, il faudrait analyser spécifiquement le contenu
              // de chaque type de compte selon le protocole
              isNative: false
            });
          }
        } catch (error) {
          console.warn(`Erreur lors de la recherche de comptes pour ${platform} (${programId}):`, error.message);
        }
      }
      
      // 3. Méthode spécifique pour Jupiter Staking
      try {
        // Il s'agit d'un appel hypothétique - Jupiter peut avoir une API distincte
        const jupiterResponse = await axios.get(
          `https://jup.ag/api/staking/wallets/${walletAddress}/positions`
        ).catch(() => ({ data: { positions: [] } })); // Gestion d'erreur silencieuse si l'API n'existe pas
        
        const positions = jupiterResponse.data?.positions || [];
        
        positions.forEach(position => {
          stakedTokens.push({
            stakingAccount: position.address || "unknown",
            platform: "Jupiter Staking",
            tokenMint: position.mint,
            amount: position.amount || 0,
            uiAmount: position.uiAmount || 0,
            isNative: false
          });
        });
      } catch (error) {
        // On ignore silencieusement car cet endpoint est hypothétique
      }
      
      return stakedTokens;
    } catch (error) {
      console.error('Erreur générale lors de la récupération des tokens stakés:', error.message);
      return [];
    }
  }
  
  /**
   * Récupère les détails complets d'un portefeuille, incluant SOL, tokens SPL, NFTs et tokens stakés
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<Object>} - Les détails complets du portefeuille
   */
  async getFullWalletDetails(walletAddress) {
    try {
      console.log(`AlchemyService: Récupération des détails complets pour ${walletAddress}`);
      
      // 1. Récupérer le solde SOL
      const solResponse = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "sol-balance",
        method: "getBalance",
        params: [walletAddress]
      });
      
      const solBalanceLamports = solResponse.data.result?.value || 0;
      const solBalance = solBalanceLamports / 1e9;
      
      // 2. Récupérer TOUS les tokens SPL avec jsonParsed pour avoir des informations complètes
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
      
      // 3. Extraire tous les tokens
      const tokenAccounts = tokensResponse.data.result?.value || [];
      const allTokenItems = tokenAccounts.map(account => {
        const parsedInfo = account.account.data.parsed.info;
        return {
          tokenAccountAddress: account.pubkey,
          mint: parsedInfo.mint,
          owner: parsedInfo.owner,
          state: parsedInfo.state,
          amount: parsedInfo.tokenAmount.amount,
          decimals: parsedInfo.tokenAmount.decimals,
          uiAmount: parsedInfo.tokenAmount.uiAmount,
          uiAmountString: parsedInfo.tokenAmount.uiAmountString
        };
      });
      
      // Filtrer les tokens avec un solde > 0 qui ne sont pas des NFTs
      // Les NFTs sont généralement des tokens avec decimals=0 et amount=1
      const tokensWithBalance = allTokenItems.filter(token => 
        parseFloat(token.amount) > 0 && 
        !(token.decimals === 0 && token.amount === "1")
      );
      
      // Identifier les NFTs - tokens avec decimals=0 et amount=1
      const nftItems = allTokenItems.filter(token => 
        token.decimals === 0 && 
        token.amount === "1"
      );

      // 4. Ajouter le SOL natif à la liste des tokens
      const allTokens = [
        {
          tokenAccountAddress: walletAddress,  // Pour SOL, c'est le même que le wallet
          mint: "So11111111111111111111111111111111111111112", // Mint conventionnel pour SOL (wSOL)
          owner: walletAddress,
          state: "initialized",
          amount: solBalanceLamports.toString(),
          decimals: 9,
          uiAmount: solBalance,
          uiAmountString: solBalance.toString(),
          isNative: true
        },
        ...tokensWithBalance
      ];
      
      // 5. Récupérer les prix actuels pour ces tokens
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
      
      // 8. Enrichir les NFTs avec des métadonnées (nom, collection, etc.)
      const nfts = nftItems.map(token => {
        const metadata = tokensMetadata[token.mint] || null;
        return {
          ...token,
          type: 'NFT',
          symbol: metadata?.symbol || 'NFT',
          name: metadata?.name || `NFT ${token.mint.slice(0, 8)}...`,
          collection: metadata?.collection || null,
          image: metadata?.logoURI || null
        };
      });
      
      // 9. Récupérer les tokens stakés
      console.log("Récupération des tokens stakés...");
      let stakedTokens = [];
      try {
        stakedTokens = await this.getStakedTokens(walletAddress);
        console.log(`${stakedTokens.length} tokens stakés trouvés`);
      } catch (error) {
        console.warn("Erreur lors de la récupération des tokens stakés:", error.message);
      }
      
      // 10. Formater la réponse finale
      return {
        walletAddress,
        nativeBalance: {
          lamports: solBalanceLamports,
          sol: solBalance,
          usdValue: prices["So11111111111111111111111111111111111111112"]?.price 
            ? solBalance * prices["So11111111111111111111111111111111111111112"].price 
            : null
        },
        tokens: enrichedTokens,
        nfts,
        stakedTokens,
        totalUsdValue: enrichedTokens.reduce((sum, token) => sum + (token.usdValue || 0), 0),
        tokenCount: enrichedTokens.length,
        nftCount: nfts.length,
        stakedTokenCount: stakedTokens.length
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des détails complets du portefeuille:', error);
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

  /**
   * Récupère tous les NFTs détenus par un utilisateur
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<Array>} - Liste des NFTs
   */
  async getNFTsByOwner(walletAddress) {
    try {
      console.log(`AlchemyService: Récupération des NFTs pour ${walletAddress}`);
      
      // Utiliser l'endpoint dédié d'Alchemy pour récupérer les NFTs
      // Cet endpoint est plus fiable que la détection basée sur getTokenAccountsByOwner
      const response = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "nft-by-owner",
        method: "ankr_getNFTsByOwner",
        params: {
          walletAddress,
          limit: 50,  // Augmenter cette valeur pour récupérer plus de NFTs
          blockchain: "solana"
        }
      });

      // Essayer d'abord avec l'endpoint ankr_getNFTsByOwner
      if (response.data && response.data.result && response.data.result.assets) {
        console.log(`${response.data.result.assets.length} NFTs trouvés via ankr_getNFTsByOwner`);
        return response.data.result.assets.map(nft => ({
          mint: nft.tokenId,
          owner: walletAddress,
          tokenAccount: nft.contractAddress,
          name: nft.name || `NFT ${nft.tokenId.slice(0, 8)}...`,
          symbol: nft.collectionName || "NFT",
          image: nft.imageUrl || null,
          collection: nft.collectionName || null
        }));
      }
      
      console.log("L'endpoint ankr_getNFTsByOwner n'est pas disponible, essai de méthode alternative");
      
      // Méthode alternative: Utiliser getTokenAccountsByOwner et filtrer pour les NFTs probables
      // Cette approche peut avoir des faux positifs et des faux négatifs
      const alternativeResponse = await axios.post(this.baseURL, {
        jsonrpc: "2.0",
        id: "nft-accounts",
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
      
      const tokenAccounts = alternativeResponse.data.result?.value || [];
      
      // Filtrer pour trouver les comptes qui ressemblent à des NFTs (decimals=0, amount=1)
      const potentialNfts = tokenAccounts
        .filter(account => {
          const tokenAmount = account.account.data.parsed.info.tokenAmount;
          return tokenAmount.amount === "1" && 
                 tokenAmount.decimals === 0 && 
                 tokenAmount.uiAmount === 1;
        })
        .map(account => {
          const info = account.account.data.parsed.info;
          return {
            mint: info.mint,
            owner: info.owner,
            tokenAccount: account.pubkey,
            amount: 1,
            name: `NFT ${info.mint.slice(0, 8)}...`,
            symbol: "NFT",
            image: null,
            collection: null
          };
        });
      
      console.log(`${potentialNfts.length} NFTs potentiels trouvés via la méthode alternative`);
      
      // Essayer d'enrichir avec des métadonnées via un autre endpoint
      if (potentialNfts.length > 0) {
        try {
          // Essayer d'utiliser l'endpoint de métadonnées pour chaque NFT
          for (let i = 0; i < potentialNfts.length; i++) {
            try {
              const nft = potentialNfts[i];
              const metadataResponse = await axios.post(this.baseURL, {
                jsonrpc: "2.0",
                id: `nft-metadata-${i}`,
                method: "getMetadata",
                params: [nft.mint]
              });
              
              if (metadataResponse.data && metadataResponse.data.result) {
                const metadata = metadataResponse.data.result;
                nft.name = metadata.name || nft.name;
                nft.symbol = metadata.symbol || nft.symbol;
                nft.image = metadata.image || nft.image;
                nft.collection = metadata.collection?.name || nft.collection;
              }
            } catch (err) {
              // Continuer avec les autres NFTs en cas d'erreur
              console.warn(`Impossible de récupérer les métadonnées pour NFT ${i}:`, err.message);
            }
          }
        } catch (metadataError) {
          console.warn("Erreur lors de la récupération des métadonnées de NFTs:", metadataError.message);
        }
      }
      
      return potentialNfts;
    } catch (error) {
      console.error('Erreur lors de la récupération des NFTs avec Alchemy:', error.message);
      return [];
    }
  }
}

module.exports = new AlchemyService();