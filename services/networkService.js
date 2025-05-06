/**
 * Service de gestion des réseaux blockchain
 * Ce service s'inspire de la gestion multi-réseaux du projet portfolio
 */

// Définition des types de réseaux supportés
const NETWORK_TYPES = {
  SOLANA: 'solana',
  ETHEREUM: 'ethereum',
  POLYGON: 'polygon',
  AVALANCHE: 'avalanche',
  BINANCE: 'binance-smart-chain',
  // Ajouter d'autres réseaux selon les besoins
};

// Définition des systèmes d'adressage
const ADDRESS_SYSTEMS = {
  SOLANA: 'solana',
  EVM: 'evm', // Ethereum, Polygon, BSC, Avalanche, etc.
};

/**
 * Configuration des réseaux supportés
 * Chaque réseau a ses propres configurations et endpoints
 */
const NETWORKS = {
  // Réseau Solana
  [NETWORK_TYPES.SOLANA]: {
    id: NETWORK_TYPES.SOLANA,
    name: 'Solana',
    shortName: 'SOL',
    addressSystem: ADDRESS_SYSTEMS.SOLANA,
    nativeToken: 'SOL',
    nativeTokenAddress: 'So11111111111111111111111111111111111111112',
    decimals: 9,
    blockExplorerUrl: 'https://solscan.io',
    rpcEndpoint: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    chainId: '101',
    enabled: true,
    fetchers: ['wallet-solana', 'nft-solana', 'staked-solana', 'marinade-solana', 'jupiter-solana']
  },
  
  // Réseau Ethereum (exemple, à implémenter plus tard)
  [NETWORK_TYPES.ETHEREUM]: {
    id: NETWORK_TYPES.ETHEREUM,
    name: 'Ethereum',
    shortName: 'ETH',
    addressSystem: ADDRESS_SYSTEMS.EVM,
    nativeToken: 'ETH',
    nativeTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    decimals: 18,
    blockExplorerUrl: 'https://etherscan.io',
    rpcEndpoint: process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
    chainId: '1',
    enabled: false, // Désactivé par défaut
    fetchers: [] // À remplir lorsque les fetchers Ethereum seront implémentés
  },
  
  // Réseau Polygon (exemple, à implémenter plus tard)
  [NETWORK_TYPES.POLYGON]: {
    id: NETWORK_TYPES.POLYGON,
    name: 'Polygon',
    shortName: 'MATIC',
    addressSystem: ADDRESS_SYSTEMS.EVM,
    nativeToken: 'MATIC',
    nativeTokenAddress: '0x0000000000000000000000000000000000001010',
    decimals: 18,
    blockExplorerUrl: 'https://polygonscan.com',
    rpcEndpoint: process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.g.alchemy.com/v2/demo',
    chainId: '137',
    enabled: false, // Désactivé par défaut
    fetchers: [] // À remplir lorsque les fetchers Polygon seront implémentés
  }
};

/**
 * Normalise une adresse selon le système d'adressage
 * @param {string} address - Adresse à normaliser
 * @param {string} addressSystem - Système d'adressage (solana, evm, etc.)
 * @returns {string} - Adresse normalisée
 */
function formatAddress(address, addressSystem) {
  if (!address) return '';
  
  switch (addressSystem) {
    case ADDRESS_SYSTEMS.SOLANA:
      // Solana addresses don't need special formatting
      return address;
    
    case ADDRESS_SYSTEMS.EVM:
      // Pour les adresses EVM, convertir en minuscules
      return address.toLowerCase();
      
    default:
      return address;
  }
}

/**
 * Normalise une adresse selon le réseau
 * @param {string} address - Adresse à normaliser
 * @param {string} networkId - ID du réseau
 * @returns {string} - Adresse normalisée
 */
function formatAddressByNetworkId(address, networkId) {
  const network = NETWORKS[networkId];
  if (!network) return address; // Si réseau inconnu, renvoyer l'adresse telle quelle
  
  return formatAddress(address, network.addressSystem);
}

/**
 * Vérifie si une adresse est valide pour un système d'adressage donné
 * @param {string} address - Adresse à vérifier
 * @param {string} addressSystem - Système d'adressage
 * @returns {boolean} - True si l'adresse est valide
 */
function isValidAddress(address, addressSystem) {
  if (!address) return false;
  
  switch (addressSystem) {
    case ADDRESS_SYSTEMS.SOLANA:
      // Vérifier si c'est une adresse base58 valide (44 caractères pour Solana)
      return /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(address);
    
    case ADDRESS_SYSTEMS.EVM:
      // Vérifier si c'est une adresse Ethereum valide (0x + 40 caractères hex)
      return /^0x[0-9a-fA-F]{40}$/.test(address);
      
    default:
      return false;
  }
}

/**
 * Retourne les fetcheurs disponibles pour un réseau
 * @param {string} networkId - ID du réseau
 * @returns {Array<string>} - Liste des IDs de fetcheurs pour ce réseau
 */
function getNetworkFetchers(networkId) {
  const network = NETWORKS[networkId];
  if (!network || !network.enabled) return [];
  
  return network.fetchers || [];
}

/**
 * Retourne tous les réseaux activés
 * @returns {Array} - Liste des réseaux activés
 */
function getEnabledNetworks() {
  return Object.values(NETWORKS).filter(network => network.enabled);
}

/**
 * Retourne un réseau par son ID
 * @param {string} networkId - ID du réseau
 * @returns {Object|null} - Configuration du réseau ou null si non trouvé
 */
function getNetworkById(networkId) {
  return NETWORKS[networkId] || null;
}

module.exports = {
  NETWORK_TYPES,
  ADDRESS_SYSTEMS,
  NETWORKS,
  formatAddress,
  formatAddressByNetworkId,
  isValidAddress,
  getNetworkFetchers,
  getEnabledNetworks,
  getNetworkById
};