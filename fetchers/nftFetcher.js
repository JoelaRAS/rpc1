/**
 * Fetcher spécifique pour les NFTs sur Solana
 * Implémenté selon l'architecture exacte du projet portfolio
 */
const { Fetcher, PLATFORM_TYPES } = require('../services/fetcherService');
const networkService = require('../services/networkService');
const metaplexService = require('../services/metaplexService');
const priceService = require('../services/priceService');
const cacheService = require('../services/cacheService');
const heliusService = require('../services/heliusService');

// Référence directe au réseau Solana
const SOLANA_NETWORK_ID = networkService.NETWORK_TYPES.SOLANA;

class NftFetcher extends Fetcher {
  constructor() {
    // ID unique, networkId, platformId, platformType (exactement comme portfolio)
    super('nft-solana', SOLANA_NETWORK_ID, 'nft', PLATFORM_TYPES.NFT);
  }

  /**
   * Exécute le fetcher pour récupérer les NFTs
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Éléments de portfolio pour les NFTs
   */
  async execute(owner) {
    console.log(`[NftFetcher] Récupération des NFTs pour ${owner}`);
    
    // Vérifier le cache d'abord
    const cacheKey = `nft_${owner}`;
    const cachedData = cacheService.get(cacheKey);
    
    if (cachedData) {
      console.log(`[NftFetcher] Données récupérées depuis le cache pour ${owner}`);
      return cachedData;
    }
    
    try {
      // Récupérer les NFTs via Metaplex ou Helius
      const nfts = await this._fetchNfts(owner);
      
      // Si aucun NFT n'est trouvé, retourner un tableau vide
      if (nfts.length === 0) {
        console.log(`[NftFetcher] Aucun NFT trouvé pour ${owner}`);
        return [];
      }
      
      // Créer les éléments de portfolio pour chaque collection de NFTs
      const portfolioElements = this._formatNftsAsPortfolioElements(nfts, owner);
      
      // Mettre en cache pour 5 minutes
      cacheService.set(cacheKey, portfolioElements, 300);
      
      return portfolioElements;
    } catch (error) {
      console.error(`[NftFetcher] Erreur dans l'exécution: ${error.message}`);
      return []; // Retourner un tableau vide en cas d'erreur
    }
  }
  
  /**
   * Récupère les NFTs de l'utilisateur via Metaplex ou Helius
   * @private
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - NFTs bruts
   */
  async _fetchNfts(owner) {
    try {
      console.log(`[NftFetcher] Tentative de récupération des NFTs via Metaplex pour ${owner}`);
      
      // Essayer avec Metaplex d'abord
      const nfts = await metaplexService.getNFTsByOwner(owner);
      
      if (nfts && nfts.length > 0) {
        console.log(`[NftFetcher] ${nfts.length} NFTs récupérés via Metaplex pour ${owner}`);
        return nfts;
      }
      
      // Si Metaplex échoue ou ne retourne rien, essayer avec Helius
      console.log(`[NftFetcher] Tentative de récupération des NFTs via Helius pour ${owner}`);
      const heliusNfts = await heliusService.getNFTsForOwner(owner);
      
      if (heliusNfts && heliusNfts.length > 0) {
        console.log(`[NftFetcher] ${heliusNfts.length} NFTs récupérés via Helius pour ${owner}`);
        return heliusNfts;
      }
      
      console.log(`[NftFetcher] Aucun NFT trouvé via Metaplex ou Helius pour ${owner}`);
      return [];
    } catch (error) {
      console.warn(`[NftFetcher] Erreur lors de la récupération des NFTs: ${error.message}`);
      
      // Plan B : si la première méthode échoue, essayer l'autre
      try {
        console.log(`[NftFetcher] Plan B: Tentative de récupération des NFTs via Helius pour ${owner}`);
        const heliusNfts = await heliusService.getNFTsForOwner(owner);
        
        if (heliusNfts && heliusNfts.length > 0) {
          console.log(`[NftFetcher] ${heliusNfts.length} NFTs récupérés via Helius (Plan B) pour ${owner}`);
          return heliusNfts;
        }
      } catch (heliusError) {
        console.warn(`[NftFetcher] Plan B échoué: ${heliusError.message}`);
      }
      
      // Plan C : utiliser des données simulées si configuré
      if (process.env.USE_SIMULATED_DATA === 'true') {
        console.log(`[NftFetcher] Utilisation de données simulées pour ${owner}`);
        return this._getSimulatedNfts();
      }
      
      return [];
    }
  }
  
  /**
   * Formate les NFTs en éléments de portfolio
   * @private
   * @param {Array} nfts - NFTs bruts
   * @param {string} owner - Adresse du propriétaire
   * @returns {Array} - Éléments de portfolio pour les NFTs
   */
  _formatNftsAsPortfolioElements(nfts, owner) {
    // Regrouper les NFTs par collection
    const nftsByCollection = {};
    
    for (const nft of nfts) {
      const collectionId = nft.collection?.address || nft.collection?.name || 'unknown';
      const collectionName = nft.collection?.name || nft.collectionName || 'Collection Inconnue';
      
      if (!nftsByCollection[collectionId]) {
        nftsByCollection[collectionId] = {
          id: collectionId,
          name: collectionName,
          items: []
        };
      }
      
      nftsByCollection[collectionId].items.push(nft);
    }
    
    // Créer des éléments de portfolio pour chaque collection
    const portfolioElements = [];
    
    for (const collectionId in nftsByCollection) {
      const collection = nftsByCollection[collectionId];
      
      // Estimer la valeur de la collection
      let collectionValue = 0;
      for (const nft of collection.items) {
        const nftValue = nft.price || nft.estimatedValue || 0;
        collectionValue += nftValue;
      }
      
      // Créer l'élément de portfolio au format du projet portfolio
      const portfolioElement = {
        networkId: this.networkId,
        platformId: this.platformId,
        type: 'nft-collection',
        label: 'NFT Collection',
        name: collection.name,
        value: { amount: collectionValue, currency: 'usd' },
        attributes: {
          itemCount: collection.items.length,
          isVerified: collection.items[0]?.collection?.verified || false,
          tags: ['nft', 'collectible']
        },
        data: {
          collectionId: collection.id,
          collectionName: collection.name,
          collectionImage: collection.items[0]?.collection?.image || collection.items[0]?.image || null,
          ref: owner,
          items: collection.items.map(nft => ({
            mint: nft.mint || nft.address,
            name: nft.name || 'NFT Sans Nom',
            symbol: nft.symbol || '',
            image: nft.image || nft.metadata?.image || '',
            attributes: nft.attributes || nft.metadata?.attributes || [],
            estimatedValue: nft.price || nft.estimatedValue || 0
          }))
        }
      };
      
      portfolioElements.push(portfolioElement);
    }
    
    return portfolioElements;
  }
  
  /**
   * Génère des données de NFTs simulées pour les tests
   * @private
   * @returns {Array} - NFTs simulés
   */
  _getSimulatedNfts() {
    // NFTs simulés pour les tests
    return [
      {
        mint: 'simu-nft-1',
        name: 'CryptoPunk #1234',
        symbol: 'PUNK',
        image: 'https://example.com/nft1.png',
        collection: {
          address: 'simu-collection-1',
          name: 'CryptoPunks',
          image: 'https://example.com/collection1.png',
          verified: true
        },
        price: 25,
        attributes: [
          { trait_type: 'Background', value: 'Blue' },
          { trait_type: 'Hair', value: 'Mohawk' }
        ]
      },
      {
        mint: 'simu-nft-2',
        name: 'CryptoPunk #5678',
        symbol: 'PUNK',
        image: 'https://example.com/nft2.png',
        collection: {
          address: 'simu-collection-1',
          name: 'CryptoPunks',
          image: 'https://example.com/collection1.png',
          verified: true
        },
        price: 30,
        attributes: [
          { trait_type: 'Background', value: 'Red' },
          { trait_type: 'Hair', value: 'Cap' }
        ]
      },
      {
        mint: 'simu-nft-3',
        name: 'Bored Ape #9012',
        symbol: 'BAYC',
        image: 'https://example.com/nft3.png',
        collection: {
          address: 'simu-collection-2',
          name: 'Bored Ape Yacht Club',
          image: 'https://example.com/collection2.png',
          verified: true
        },
        price: 150,
        attributes: [
          { trait_type: 'Background', value: 'Jungle' },
          { trait_type: 'Fur', value: 'Brown' },
          { trait_type: 'Eyes', value: 'Bored' }
        ]
      }
    ];
  }
}

// Exporter une instance
module.exports = new NftFetcher();