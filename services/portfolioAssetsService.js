const heliusService = require('./heliusService');
const alchemyService = require('./alchemyService');
const birdeyeService = require('./birdeyeService');
const jupiterService = require('./jupiterService');
const priceService = require('./priceService');
const metaplexService = require('./metaplexService');

/**
 * Service qui implémente la récupération et la gestion des assets selon le modèle du projet portfolio
 */
class PortfolioAssetsService {
  /**
   * Constantes pour les types d'assets
   */
  static ASSET_TYPES = {
    GENERIC: 'generic',
    TOKEN: 'token',
    COLLECTIBLE: 'collectible',
  };

  /**
   * Constantes pour les types d'éléments de portfolio
   */
  static ELEMENT_TYPES = {
    MULTIPLE: 'multiple',
    LIQUIDITY: 'liquidity',
    BORROWLEND: 'borrowlend',
    LEVERAGE: 'leverage',
    TRADE: 'trade',
  };

  /**
   * Constantes pour les labels d'éléments de portfolio
   */
  static ELEMENT_LABELS = {
    WALLET: 'Wallet',
    STAKED: 'Staked',
    LIQUIDITY_POOL: 'LiquidityPool',
    FARMING: 'Farming',
    VAULT: 'Vault',
    LENDING: 'Lending',
    VESTING: 'Vesting',
    DEPOSIT: 'Deposit',
    REWARDS: 'Rewards',
    AIRDROP: 'Airdrop',
    MARGIN: 'Margin',
    LIMIT_ORDER: 'LimitOrder',
    DCA: 'DCA',
    SMART_DCA: 'SmartDCA',
    LEVERAGE: 'Leverage',
  };

  /**
   * Récupère tous les assets d'un portefeuille (tokens, NFT, solde natif)
   * @param {string} walletAddress - Adresse du portefeuille
   * @param {Object} options - Options de la requête
   * @param {boolean} options.includeNFTs - Inclure les NFTs
   * @param {boolean} options.includeStaked - Inclure les tokens stakés
   * @param {boolean} options.includePrices - Inclure les prix des tokens
   * @returns {Promise<Object>} - Données du portefeuille
   */
  async getAllPortfolioAssets(walletAddress, options = {}) {
    console.log(`PortfolioAssetsService: Récupération des assets pour ${walletAddress}`);
    
    // Options par défaut
    const {
      includeNFTs = true,
      includeStaked = true,
      includePrices = true,
    } = options;
    
    const startTime = Date.now();
    
    // 1. Récupération du solde SOL
    console.log(`PortfolioAssetsService: Récupération du solde SOL pour ${walletAddress}`);
    let solBalance;
    try {
      solBalance = await alchemyService.getBalances(walletAddress);
    } catch (error) {
      console.warn(`PortfolioAssetsService: Erreur lors de la récupération du solde SOL via Alchemy: ${error.message}`);
      // Essayer un fallback
      try {
        const solWeb3Balance = await this._getSolBalanceAlternative(walletAddress);
        solBalance = {
          nativeBalance: {
            lamports: solWeb3Balance.lamports,
            solAmount: solWeb3Balance.sol
          }
        };
      } catch (backupError) {
        console.error(`PortfolioAssetsService: Erreur du fallback pour le solde SOL: ${backupError.message}`);
        solBalance = { nativeBalance: { lamports: 0, solAmount: 0 } };
      }
    }
    
    // 2. Récupérer tous les assets (tokens et NFTs) avec la nouvelle méthode Helius
    console.log(`PortfolioAssetsService: Récupération des assets pour ${walletAddress} via Helius`);
    let allAssetsData = { nfts: [], tokens: [] };

    try {
      // Utiliser la nouvelle méthode qui distingue mieux les tokens des NFTs
      allAssetsData = await heliusService.getAssetsByOwnerWithSeparation(walletAddress);
      console.log(`PortfolioAssetsService: Récupéré ${allAssetsData.nfts.length} NFTs et ${allAssetsData.tokens.length} tokens via Helius`);
    } catch (error) {
      console.warn(`PortfolioAssetsService: Erreur lors de la récupération des assets via Helius: ${error.message}`);
      
      // En cas d'échec, utiliser les méthodes traditionnelles pour récupérer les tokens
      try {
        const tokenAccounts = await heliusService.getTokenBalances(walletAddress);
        console.log(`PortfolioAssetsService: Fallback - Récupéré ${tokenAccounts.length} comptes de tokens via getTokenBalances`);
      } catch (tokenError) {
        console.error(`PortfolioAssetsService: Erreur du fallback pour les tokens: ${tokenError.message}`);
      }
    }
    
    // 3. Récupération des tokens SPL (si la nouvelle méthode a échoué)
    console.log(`PortfolioAssetsService: Récupération des tokens SPL pour ${walletAddress}`);
    let tokenAccounts = [];
    if (allAssetsData.tokens.length === 0) {
      try {
        tokenAccounts = await heliusService.getTokenBalances(walletAddress);
      } catch (error) {
        console.warn(`PortfolioAssetsService: Erreur lors de la récupération des tokens via Helius: ${error.message}`);
        // Essayer un fallback avec Alchemy
        try {
          const alchemyBalances = await alchemyService.getBalances(walletAddress);
          if (alchemyBalances.tokenAccounts) {
            tokenAccounts = alchemyBalances.tokenAccounts;
          }
        } catch (backupError) {
          console.error(`PortfolioAssetsService: Erreur du fallback pour les tokens: ${backupError.message}`);
        }
      }
    }
    
    // 3b. Formater les tokens
    // Si nous avons des tokens via la nouvelle méthode, les utiliser, sinon utiliser les méthodes traditionnelles
    let formattedTokens = [];
    if (allAssetsData.tokens.length > 0) {
      formattedTokens = this._formatHeliusAssetsToPortfolioAssets(allAssetsData.tokens);
    } else {
      formattedTokens = this._formatTokenAccountsToPortfolioAssets(tokenAccounts);
    }
    console.log(`PortfolioAssetsService: ${formattedTokens.length} tokens formatés`);
    
    // 4. Récupération des prix (si demandé)
    if (includePrices && formattedTokens.length > 0) {
      console.log(`PortfolioAssetsService: Enrichissement des tokens avec les prix`);
      await this._enrichTokensWithPrices(formattedTokens);
    }
    
    // 5. Récupération des NFTs (si demandé et si la nouvelle méthode a échoué)
    let nfts = [];
    if (includeNFTs) {
      // Si nous avons déjà récupéré les NFTs avec la nouvelle méthode, les utiliser
      if (allAssetsData.nfts.length > 0) {
        nfts = allAssetsData.nfts;
        console.log(`PortfolioAssetsService: ${nfts.length} NFTs récupérés via la nouvelle méthode Helius`);
      } else {
        // Sinon, utiliser les méthodes traditionnelles
        console.log(`PortfolioAssetsService: Récupération des NFTs pour ${walletAddress} via méthodes traditionnelles`);
        try {
          nfts = await metaplexService.getNFTsByOwner(walletAddress);
        } catch (error) {
          console.warn(`PortfolioAssetsService: Erreur lors de la récupération des NFTs via Metaplex: ${error.message}`);
          // Essayer un fallback avec Helius
          try {
            nfts = await heliusService.getNFTsForOwner(walletAddress);
          } catch (backupError) {
            console.error(`PortfolioAssetsService: Erreur du fallback pour les NFTs: ${backupError.message}`);
          }
        }
      }
    }
    
    // Formatter les NFTs selon le modèle de portfolio
    // Choisir la méthode de formatage en fonction de la source des NFTs
    const formattedNFTs = allAssetsData.nfts.length > 0 
      ? this._formatHeliusNFTsToPortfolioAssets(allAssetsData.nfts)
      : this._formatNFTsToPortfolioAssets(nfts);
    console.log(`PortfolioAssetsService: ${formattedNFTs.length} NFTs formatés`);
    
    // 6. Récupération des tokens stakés (si demandé)
    let stakedTokens = [];
    if (includeStaked) {
      console.log(`PortfolioAssetsService: Récupération des tokens stakés pour ${walletAddress}`);
      try {
        stakedTokens = await alchemyService.getStakedTokens(walletAddress);
      } catch (error) {
        console.warn(`PortfolioAssetsService: Erreur lors de la récupération des tokens stakés: ${error.message}`);
      }
    }
    
    // Formatter les tokens stakés selon le modèle de portfolio
    const formattedStakedTokens = this._formatStakedTokensToPortfolioAssets(stakedTokens);
    console.log(`PortfolioAssetsService: ${formattedStakedTokens.length} tokens stakés formatés`);
    
    // 7. Créer le SOL token selon le modèle de portfolio
    let solTokenAsset = null;
    let totalUsdValue = 0;
    
    if (solBalance && solBalance.nativeBalance) {
      solTokenAsset = this._createSolPortfolioAsset(solBalance.nativeBalance);
      
      // Si on a les prix, ajouter le prix du SOL
      if (includePrices) {
        try {
          // Utiliser getTokenPrice au lieu de getCurrentPrice
          const solPrice = await priceService.getTokenPrice('So11111111111111111111111111111111111111112');
          if (solPrice) {
            solTokenAsset.data.price = {
              amount: solPrice.price,
              currency: 'usd'
            };
            solTokenAsset.value = {
              amount: solPrice.price * solBalance.nativeBalance.solAmount,
              currency: 'usd'
            };
            totalUsdValue += solTokenAsset.value.amount;
          }
        } catch (error) {
          console.warn(`PortfolioAssetsService: Erreur lors de la récupération du prix de SOL: ${error.message}`);
        }
      }
    }
    
    // 8. Calculer la valeur totale du portfolio
    formattedTokens.forEach(token => {
      if (token.value && token.value.amount) {
        totalUsdValue += token.value.amount;
      }
    });
    
    formattedStakedTokens.forEach(stakedToken => {
      if (stakedToken.value && stakedToken.value.amount) {
        totalUsdValue += stakedToken.value.amount;
      }
    });
    
    // 9. Créer la structure complète du portfolio selon le modèle portfolio
    const portfolioElements = [
      // Élément "Wallet" pour les tokens et SOL
      {
        networkId: 'solana',
        platformId: 'solana-wallet',
        value: { amount: totalUsdValue, currency: 'usd' },
        type: this.constructor.ELEMENT_TYPES.MULTIPLE,
        label: this.constructor.ELEMENT_LABELS.WALLET,
        name: 'Solana Wallet',
        data: {
          assets: [
            ...(solTokenAsset ? [solTokenAsset] : []),
            ...formattedTokens
          ],
          ref: walletAddress
        }
      }
    ];
    
    // Ajouter un élément "Staked" si des tokens stakés sont présents
    if (formattedStakedTokens.length > 0) {
      const stakedValue = formattedStakedTokens.reduce(
        (sum, token) => sum + (token.value?.amount || 0), 
        0
      );
      
      portfolioElements.push({
        networkId: 'solana',
        platformId: 'solana-staking',
        value: { amount: stakedValue, currency: 'usd' },
        type: this.constructor.ELEMENT_TYPES.MULTIPLE,
        label: this.constructor.ELEMENT_LABELS.STAKED,
        name: 'Staked Tokens',
        data: {
          assets: formattedStakedTokens,
          ref: walletAddress
        }
      });
    }
    
    // Ajouter un élément "Collectibles" pour les NFTs si présents
    if (formattedNFTs.length > 0) {
      const nftValue = formattedNFTs.reduce(
        (sum, nft) => sum + (nft.value?.amount || 0), 
        0
      );
      
      portfolioElements.push({
        networkId: 'solana',
        platformId: 'solana-nft',
        value: { amount: nftValue, currency: 'usd' },
        type: this.constructor.ELEMENT_TYPES.MULTIPLE,
        label: 'Collectibles',
        name: 'NFT Collection',
        data: {
          assets: formattedNFTs,
          ref: walletAddress
        }
      });
    }
    
    const endTime = Date.now();
    
    // 10. Retourner la structure complète du portfolio selon le modèle portfolio
    return {
      date: Date.now(),
      owner: walletAddress,
      addressSystem: 'solana',
      value: { amount: totalUsdValue, currency: 'usd' },
      elements: portfolioElements,
      duration: endTime - startTime
    };
  }

  /**
   * Formate les comptes de tokens en assets de portfolio
   * @private
   * @param {Array<Object>} tokenAccounts - Comptes de tokens
   * @returns {Array<Object>} - Assets de portfolio pour les tokens
   */
  _formatTokenAccountsToPortfolioAssets(tokenAccounts) {
    if (!Array.isArray(tokenAccounts) || tokenAccounts.length === 0) {
      return [];
    }
    
    return tokenAccounts
      .filter(account => {
        // S'assurer que le compte existe et a un solde positif
        try {
          // Gestion de différents formats possibles
          if (account.account?.data?.parsed?.info?.tokenAmount) {
            const tokenAmount = account.account.data.parsed.info.tokenAmount;
            return tokenAmount.uiAmount > 0;
          } else if (account.tokenAmount) {
            return account.tokenAmount.uiAmount > 0;
          }
          return false;
        } catch (error) {
          return false;
        }
      })
      .map(account => {
        // Extraire les informations pertinentes du compte
        let mintAddress, tokenAmount;
        
        // Gérer différents formats de données possibles
        if (account.account?.data?.parsed?.info) {
          // Format Helius
          const tokenInfo = account.account.data.parsed.info;
          mintAddress = tokenInfo.mint;
          tokenAmount = tokenInfo.tokenAmount;
        } else if (account.mint) {
          // Format Alchemy
          mintAddress = account.mint;
          tokenAmount = account.tokenAmount;
        } else {
          // Format inconnu, utiliser des valeurs par défaut
          mintAddress = 'unknown';
          tokenAmount = { uiAmount: 0, decimals: 0 };
        }
        
        // Créer l'asset au format portfolio
        return {
          networkId: 'solana',
          type: this.constructor.ASSET_TYPES.TOKEN,
          value: { amount: 0, currency: 'usd' }, // Sera mis à jour plus tard avec les prix
          attributes: {},
          data: {
            address: mintAddress,
            amount: tokenAmount.uiAmount || 0,
            price: { amount: 0, currency: 'usd' } // Sera mis à jour plus tard avec les prix
          }
        };
      });
  }
  
  /**
   * Enrichit les tokens avec leurs prix et métadonnées
   * @private
   * @param {Array<Object>} tokens - Tokens formattés
   * @returns {Promise<void>}
   */
  async _enrichTokensWithPrices(tokens) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return;
    }
    
    // Récupérer les prix et métadonnées en parallèle par lots pour éviter de surcharger les APIs
    const batchSize = 10;
    
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const tokenAddresses = batch.map(token => token.data.address);
      
      // Récupérer les prix en utilisant birdeyeService pour éviter les problèmes avec priceService
      const pricePromises = tokenAddresses.map(address => 
        birdeyeService.getTokenPrice(address).catch(() => null)
      );
      
      // Récupérer les métadonnées en utilisant jupiterService
      const metadataPromises = tokenAddresses.map(address => 
        jupiterService.getTokenInfo(address).catch(() => null)
      );
      
      // Attendre que toutes les promesses soient résolues
      const [priceResults, metadataResults] = await Promise.all([
        Promise.all(pricePromises),
        Promise.all(metadataPromises)
      ]);
      
      // Mettre à jour les tokens avec les prix et métadonnées
      for (let j = 0; j < batch.length; j++) {
        const token = batch[j];
        const priceResult = priceResults[j];
        const metadataResult = metadataResults[j];
        
        // Mettre à jour avec le prix
        if (priceResult && priceResult.price) {
          token.data.price = {
            amount: priceResult.price,
            currency: 'usd'
          };
          
          // Mettre à jour la valeur du token
          token.value = {
            amount: priceResult.price * token.data.amount,
            currency: 'usd'
          };
        }
        
        // Mettre à jour avec les métadonnées
        if (metadataResult) {
          token.name = metadataResult.name || 'Unknown Token';
          token.imageUri = metadataResult.logoURI || null;
          
          // Ajouter des informations supplémentaires
          token.data.symbol = metadataResult.symbol || 'UNKNOWN';
          token.data.decimals = metadataResult.decimals || 0;
        }
      }
    }
  }
  
  /**
   * Formate les NFTs en assets de portfolio
   * @private
   * @param {Array<Object>} nfts - NFTs
   * @returns {Array<Object>} - Assets de portfolio pour les NFTs
   */
  _formatNFTsToPortfolioAssets(nfts) {
    if (!Array.isArray(nfts) || nfts.length === 0) {
      return [];
    }
    
    return nfts.map(nft => {
      // Extraire les informations pertinentes du NFT
      let name = 'Unknown NFT';
      let description = '';
      let imageUri = null;
      let address = '';
      let collection = null;
      
      // Gérer différents formats de données possibles
      if (nft.mint) {
        address = nft.mint;
      } else if (nft.id) {
        address = nft.id;
      }
      
      if (nft.name) {
        name = nft.name;
      } else if (nft.metadata?.name) {
        name = nft.metadata.name;
      }
      
      if (nft.description) {
        description = nft.description;
      } else if (nft.metadata?.description) {
        description = nft.metadata.description;
      }
      
      if (nft.image) {
        imageUri = nft.image;
      } else if (nft.metadata?.image) {
        imageUri = nft.metadata.image;
      }
      
      // Traitement des informations de collection
      if (nft.collection) {
        collection = {
          id: nft.collection.key || nft.collection.address || '',
          name: nft.collection.name || 'Unknown Collection',
          floorPrice: { amount: nft.collection.floorPrice || 0, currency: 'usd' }
        };
      }
      
      // Traitement des attributs
      const attributes = [];
      if (nft.attributes && Array.isArray(nft.attributes)) {
        nft.attributes.forEach(attr => {
          attributes.push({
            trait_type: attr.trait_type || attr.name || 'Unknown',
            value: attr.value || ''
          });
        });
      } else if (nft.metadata?.attributes && Array.isArray(nft.metadata.attributes)) {
        nft.metadata.attributes.forEach(attr => {
          attributes.push({
            trait_type: attr.trait_type || attr.name || 'Unknown',
            value: attr.value || ''
          });
        });
      }
      
      // Créer l'asset au format portfolio
      return {
        networkId: 'solana',
        type: this.constructor.ASSET_TYPES.COLLECTIBLE,
        value: { 
          amount: collection?.floorPrice?.amount || 0, 
          currency: 'usd' 
        },
        attributes: {
          isDeprecated: false,
          isClaimable: false,
          tags: []
        },
        name,
        imageUri,
        data: {
          address,
          amount: 1,
          price: { amount: collection?.floorPrice?.amount || 0, currency: 'usd' },
          name,
          description,
          imageUri,
          attributes,
          collection
        }
      };
    });
  }
  
  /**
   * Formate les tokens stakés en assets de portfolio
   * @private
   * @param {Array<Object>} stakedTokens - Tokens stakés
   * @returns {Array<Object>} - Assets de portfolio pour les tokens stakés
   */
  _formatStakedTokensToPortfolioAssets(stakedTokens) {
    if (!Array.isArray(stakedTokens) || stakedTokens.length === 0) {
      return [];
    }
    
    return stakedTokens.map(stakedToken => {
      // Extraire les informations pertinentes du token staké
      const mintAddress = stakedToken.mint || stakedToken.tokenMint || '';
      const amount = stakedToken.amount || stakedToken.tokenAmount?.uiAmount || 0;
      
      // Créer l'asset au format portfolio
      return {
        networkId: 'solana',
        type: this.constructor.ASSET_TYPES.TOKEN,
        value: { amount: 0, currency: 'usd' }, // Sera mis à jour plus tard avec les prix
        attributes: {
          isDeprecated: false,
          isClaimable: false,
          tags: ['staked']
        },
        data: {
          address: mintAddress,
          amount,
          price: { amount: 0, currency: 'usd' } // Sera mis à jour plus tard avec les prix
        }
      };
    });
  }
  
  /**
   * Crée un asset pour SOL au format du portfolio
   * @private
   * @param {Object} nativeBalance - Solde natif SOL
   * @returns {Object} - Asset SOL au format portfolio
   */
  _createSolPortfolioAsset(nativeBalance) {
    return {
      networkId: 'solana',
      type: this.constructor.ASSET_TYPES.TOKEN,
      value: { amount: 0, currency: 'usd' }, // Sera mis à jour plus tard avec les prix
      attributes: {
        isDeprecated: false,
        isClaimable: false,
        tags: ['native']
      },
      name: 'Solana',
      imageUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      data: {
        address: 'So11111111111111111111111111111111111111112', // Wrapped SOL address
        amount: nativeBalance.solAmount || 0,
        price: { amount: 0, currency: 'usd' } // Sera mis à jour plus tard avec les prix
      }
    };
  }
  
  /**
   * Méthode alternative pour récupérer le solde SOL
   * @private
   * @param {string} walletAddress - Adresse du portefeuille
   * @returns {Promise<{lamports: number, sol: number}>} - Solde SOL
   */
  async _getSolBalanceAlternative(walletAddress) {
    try {
      const solanaWebService = require('./solanaWebService');
      return await solanaWebService.getSolBalance(walletAddress);
    } catch (error) {
      console.error(`PortfolioAssetsService: Erreur lors de la récupération du solde SOL alternatif: ${error.message}`);
      return { lamports: 0, sol: 0 };
    }
  }

  /**
   * Formate les tokens depuis l'API Helius getAssetsByOwner en assets de portfolio
   * @private
   * @param {Array<Object>} tokens - Tokens depuis Helius
   * @returns {Array<Object>} - Assets de portfolio pour les tokens
   */
  _formatHeliusAssetsToPortfolioAssets(tokens) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return [];
    }
    
    return tokens.filter(token => token && token.id).map(token => {
      // Extraire les informations pertinentes du token
      const mintAddress = token.id;
      
      // Extraire le montant du token (différents formats possibles selon Helius)
      let amount = 0;
      if (token.ownership && token.ownership.amount) {
        // Nouveau format Helius
        amount = token.ownership.amount;
        // Si le token a des décimales, ajuster le montant
        if (token.tokenInfo && token.tokenInfo.decimals) {
          amount = amount / (10 ** token.tokenInfo.decimals);
        }
      } else if (token.amount) {
        // Format direct
        amount = token.amount;
      }
      
      // Extraire les métadonnées
      const name = token.content?.metadata?.name || token.metadata?.name || token.name || `Token ${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`;
      const symbol = token.content?.metadata?.symbol || token.metadata?.symbol || token.symbol || "UNKNOWN";
      const decimals = token.tokenInfo?.decimals || token.decimals || 0;
      const logoURI = token.content?.links?.image || token.content?.metadata?.image || token.metadata?.image || null;
      
      // Créer l'asset au format portfolio
      return {
        networkId: 'solana',
        type: this.constructor.ASSET_TYPES.TOKEN,
        value: { amount: 0, currency: 'usd' }, // Sera mis à jour plus tard avec les prix
        attributes: {},
        name,
        imageUri: logoURI,
        data: {
          address: mintAddress,
          amount,
          price: { amount: 0, currency: 'usd' }, // Sera mis à jour plus tard avec les prix
          symbol,
          decimals
        }
      };
    });
  }
  
  /**
   * Formate les NFTs depuis l'API Helius getAssetsByOwner en assets de portfolio
   * @private
   * @param {Array<Object>} nfts - NFTs depuis Helius
   * @returns {Array<Object>} - Assets de portfolio pour les NFTs
   */
  _formatHeliusNFTsToPortfolioAssets(nfts) {
    if (!Array.isArray(nfts) || nfts.length === 0) {
      return [];
    }
    
    return nfts.filter(nft => nft && nft.id).map(nft => {
      // Extraire les informations pertinentes du NFT
      const address = nft.id;
      const name = nft.content?.metadata?.name || nft.metadata?.name || nft.name || 'Unknown NFT';
      const description = nft.content?.metadata?.description || nft.metadata?.description || nft.description || '';
      const imageUri = nft.content?.links?.image || nft.content?.files?.[0]?.uri || nft.content?.metadata?.image || nft.metadata?.image || null;
      
      // Traitement des informations de collection
      let collection = null;
      if (nft.grouping && nft.grouping.length > 0) {
        // Trouver le premier groupement qui est une collection
        const collectionGroup = nft.grouping.find(g => g.group_key === 'collection');
        if (collectionGroup) {
          collection = {
            id: collectionGroup.group_value,
            name: collectionGroup.collection_metadata?.name || 'Unknown Collection',
            floorPrice: { 
              amount: collectionGroup.collection_metadata?.floorPrice || 0, 
              currency: 'usd' 
            }
          };
        }
      } else if (nft.collection) {
        collection = {
          id: nft.collection.key || nft.collection.address || '',
          name: nft.collection.name || 'Unknown Collection',
          floorPrice: { amount: nft.collection.floorPrice || 0, currency: 'usd' }
        };
      }
      
      // Traitement des attributs
      const attributes = [];
      if (nft.content?.metadata?.attributes && Array.isArray(nft.content.metadata.attributes)) {
        nft.content.metadata.attributes.forEach(attr => {
          attributes.push({
            trait_type: attr.trait_type || attr.name || 'Unknown',
            value: attr.value || ''
          });
        });
      } else if (nft.attributes && Array.isArray(nft.attributes)) {
        nft.attributes.forEach(attr => {
          attributes.push({
            trait_type: attr.trait_type || attr.name || 'Unknown',
            value: attr.value || ''
          });
        });
      }
      
      // Créer l'asset au format portfolio
      return {
        networkId: 'solana',
        type: this.constructor.ASSET_TYPES.COLLECTIBLE,
        value: { 
          amount: collection?.floorPrice?.amount || 0, 
          currency: 'usd' 
        },
        attributes: {
          isDeprecated: false,
          isClaimable: false,
          tags: []
        },
        name,
        imageUri,
        data: {
          address,
          amount: 1,
          price: { amount: collection?.floorPrice?.amount || 0, currency: 'usd' },
          name,
          description,
          imageUri,
          attributes,
          collection
        }
      };
    });
  }
}

module.exports = new PortfolioAssetsService();