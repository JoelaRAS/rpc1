// filepath: c:\Users\rasam\Downloads\rpc1-1\services\metaplexService.js
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const { fetchAllDigitalAssetWithTokenByOwner } = require("@metaplex-foundation/mpl-token-metadata");
const { publicKey } = require("@metaplex-foundation/umi");

// Nécessaire pour la sérialisation des BigInt dans les réponses JSON
if (typeof BigInt.prototype.toJSON !== 'function') {
  BigInt.prototype.toJSON = function() { 
    return this.toString();
  };
}

class MetaplexService {
  constructor() {
    // Utiliser la variable d'environnement RPC_URL ou un endpoint par défaut
    const rpcUrl = process.env.RPC_URL || process.env.HELIUS_RPC_URL || process.env.ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.umi = createUmi(rpcUrl);
    
    // Garder un cache de NFTs pour éviter des appels répétés
    this.nftCache = new Map(); // walletAddress -> {timestamp, nfts}
    this.cacheTtl = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Récupère tous les NFTs appartenant à une adresse en utilisant Metaplex
   * @param {string} walletAddress - L'adresse du portefeuille
   * @returns {Promise<Array>} - Tableau de NFTs avec leurs métadonnées
   */
  async getNFTsByOwner(walletAddress) {
    console.log(`MetaplexService: Récupération des NFTs pour ${walletAddress} avec Metaplex...`);
    
    try {
      // Vérifier si les résultats sont en cache et encore frais
      const cachedResult = this.nftCache.get(walletAddress);
      if (cachedResult && (Date.now() - cachedResult.timestamp) < this.cacheTtl) {
        console.log(`MetaplexService: Utilisation des NFTs en cache pour ${walletAddress}`);
        return cachedResult.nfts;
      }
      
      // Convertir l'adresse en format Umi PublicKey
      const ownerPublicKey = publicKey(walletAddress);
      
      // Récupérer tous les NFTs (digital assets) avec leurs tokens associés
      console.log(`MetaplexService: Appel à fetchAllDigitalAssetWithTokenByOwner pour ${walletAddress}`);
      const start = Date.now();
      const allNFTs = await fetchAllDigitalAssetWithTokenByOwner(this.umi, ownerPublicKey);
      console.log(`MetaplexService: ${allNFTs.length} NFTs récupérés en ${Date.now() - start}ms`);
      
      // Transformer les résultats en format plus utilisable
      const formattedNFTs = allNFTs.map(nft => {
        // Extraire les métadonnées importantes
        const collectionData = nft.metadata?.collection ? {
          verified: nft.metadata.collection.verified,
          key: nft.metadata.collection.key ? nft.metadata.collection.key.toString() : null,
          name: null // Rempli plus tard si possible
        } : null;
        
        return {
          mint: nft.publicKey.toString(),
          name: nft.metadata?.name || `NFT ${nft.publicKey.toString().slice(0, 8)}...`,
          symbol: nft.metadata?.symbol || "NFT",
          uri: nft.metadata?.uri || null,
          sellerFeeBasisPoints: nft.metadata?.sellerFeeBasisPoints,
          collection: collectionData,
          tokenAccount: nft.token ? nft.token.publicKey.toString() : null,
          // Certaines métadonnées peuvent être à récupérer via l'URI en externe
          externalMetadata: null
        };
      });
      
      // Essayer de récupérer des métadonnées externes pour les 10 premiers NFTs
      // (limité pour éviter de faire trop de requêtes)
      const limitedNFTs = formattedNFTs.slice(0, 10);
      await Promise.allSettled(
        limitedNFTs.map(async (nft, index) => {
          if (nft.uri) {
            try {
              const response = await fetch(nft.uri, { timeout: 3000 });
              if (response.ok) {
                const metadata = await response.json();
                formattedNFTs[index].externalMetadata = {
                  image: metadata.image || null,
                  description: metadata.description || null,
                  attributes: metadata.attributes || null,
                  animation_url: metadata.animation_url || null
                };
                
                // Mettre à jour le nom et le symbole s'ils étaient vides
                if (!nft.name || nft.name.startsWith("NFT ")) {
                  formattedNFTs[index].name = metadata.name || nft.name;
                }
                if (!nft.symbol || nft.symbol === "NFT") {
                  formattedNFTs[index].symbol = metadata.symbol || nft.symbol;
                }
                
                // Mettre à jour le nom de la collection si disponible
                if (nft.collection && metadata.collection && metadata.collection.name) {
                  formattedNFTs[index].collection.name = metadata.collection.name;
                } else if (metadata.collection && typeof metadata.collection === 'string') {
                  formattedNFTs[index].collection = {
                    ...formattedNFTs[index].collection,
                    name: metadata.collection
                  };
                }
              }
            } catch (error) {
              console.warn(`Erreur lors de la récupération des métadonnées externes pour ${nft.mint}:`, error.message);
            }
          }
        })
      );
      
      // Stocker dans le cache
      this.nftCache.set(walletAddress, {
        timestamp: Date.now(),
        nfts: formattedNFTs
      });
      
      return formattedNFTs;
    } catch (error) {
      console.error('Erreur lors de la récupération des NFTs avec Metaplex:', error);
      // En cas d'erreur, retourner un tableau vide
      return [];
    }
  }

  /**
   * Récupère les métadonnées d'un NFT spécifique par son adresse de mint
   * @param {string} mintAddress - Adresse de mint du NFT
   * @returns {Promise<Object|null>} - Métadonnées du NFT ou null si non trouvé
   */
  async getNFTMetadata(mintAddress) {
    try {
      console.log(`MetaplexService: Récupération des métadonnées pour le NFT ${mintAddress}`);
      
      // Convertir l'adresse en format Umi PublicKey
      const nftPublicKey = publicKey(mintAddress);
      
      // Récupérer l'asset digital
      const asset = await this.umi.rpc.getDigitalAsset(nftPublicKey);
      
      if (!asset) {
        console.warn(`NFT ${mintAddress} non trouvé`);
        return null;
      }
      
      // Formater les métadonnées
      const metadata = {
        mint: mintAddress,
        name: asset.metadata.name || `NFT ${mintAddress.slice(0, 8)}...`,
        symbol: asset.metadata.symbol || "NFT",
        uri: asset.metadata.uri || null,
        sellerFeeBasisPoints: asset.metadata.sellerFeeBasisPoints,
        collection: asset.metadata.collection ? {
          verified: asset.metadata.collection.verified,
          key: asset.metadata.collection.key.toString(),
        } : null
      };
      
      // Essayer de récupérer des métadonnées externes si une URI est disponible
      if (metadata.uri) {
        try {
          const response = await fetch(metadata.uri, { timeout: 3000 });
          if (response.ok) {
            const externalMetadata = await response.json();
            metadata.externalMetadata = {
              image: externalMetadata.image || null,
              description: externalMetadata.description || null,
              attributes: externalMetadata.attributes || null,
              animation_url: externalMetadata.animation_url || null
            };
          }
        } catch (error) {
          console.warn(`Erreur lors de la récupération des métadonnées externes pour ${mintAddress}:`, error.message);
        }
      }
      
      return metadata;
    } catch (error) {
      console.error(`Erreur lors de la récupération des métadonnées pour le NFT ${mintAddress}:`, error);
      return null;
    }
  }
}

module.exports = new MetaplexService();