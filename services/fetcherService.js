/**
 * Service d'intégration pour tous les fetchers Solana
 * Implémenté pour reproduire exactement la structure du projet portfolio
 */
const networkService = require('./networkService');

// Types de plateformes, exactement comme dans portfolio.js
const PLATFORM_TYPES = {
  WALLET: 'wallet',
  STAKING: 'staking',
  LIQUIDITY_POOL: 'liquidity_pool',
  LENDING: 'lending',
  FARMING: 'farming',
  NFT: 'nft',
  MULTIPLE: 'multiple'
};

// Utiliser les constantes de réseau du networkService
const { NETWORKS, NETWORK_TYPES } = networkService;

/**
 * Classe de base Fetcher, suivant exactement la structure du projet portfolio
 */
class Fetcher {
  /**
   * Constructeur du fetcher
   * @param {string} id - ID unique du fetcher
   * @param {string} networkId - ID du réseau
   * @param {string} platformId - ID de la plateforme
   * @param {string} platformType - Type de la plateforme
   */
  constructor(id, networkId, platformId, platformType) {
    this.id = id;
    this.networkId = networkId;
    this.platformId = platformId;
    this.platformType = platformType;
  }

  /**
   * Méthode d'exécution à implémenter par les classes filles
   * @param {string} owner - Adresse du propriétaire
   * @returns {Promise<Array>} - Éléments de portfolio
   */
  async execute(owner) {
    throw new Error('La méthode execute doit être implémentée par les classes filles');
  }
}

// Exporter d'abord la classe Fetcher et les constantes
module.exports = {
  PLATFORM_TYPES,
  NETWORKS,
  Fetcher
};

// IMPORTANT: L'importation des fetchers doit se faire APRÈS l'exportation de Fetcher
// pour éviter les dépendances circulaires
const walletFetcher = require('../fetchers/walletFetcher');
const marinadeFetcher = require('../fetchers/marinadeFetcher');
const jitoFetcher = require('../fetchers/jitoFetcher');
const orcaFetcher = require('../fetchers/orcaFetcher');
const kaminoFetcher = require('../fetchers/kaminoFetcher');
const jupiterFetcher = require('../fetchers/jupiterFetcher');
const nftFetcher = require('../fetchers/nftFetcher');
const stakedFetcher = require('../fetchers/stakedFetcher');

// Liste de tous les fetchers disponibles
const ALL_FETCHERS = [
  walletFetcher,
  marinadeFetcher,
  jitoFetcher,
  orcaFetcher,
  kaminoFetcher,
  jupiterFetcher,
  nftFetcher,
  stakedFetcher
];

/**
 * Exécuter des fetchers pour une adresse donnée
 * @param {Array} fetchers - Liste des fetchers à exécuter
 * @param {string} address - Adresse du portefeuille
 * @param {string} addressSystem - Système d'adressage (par défaut: 'solana')
 * @returns {Promise<Object>} - Résultat combiné de tous les fetchers
 */
async function runFetchers(fetchers, address, addressSystem = 'solana') {
  console.log(`[FetcherService] Exécution de ${fetchers.length} fetchers pour ${address}`);
  
  const startTime = Date.now();
  
  const result = {
    date: Date.now(),
    owner: address,
    addressSystem,
    value: { amount: 0, currency: 'usd' },
    elements: [],
    fetcherReports: {},
    duration: 0
  };
  
  // Exécuter les fetchers en parallèle
  const fetcherPromises = fetchers.map(fetcher => {
    const fetcherStartTime = Date.now();
    
    return fetcher.execute(address)
      .then(elements => {
        // Calculer la durée d'exécution de ce fetcher
        const fetcherDuration = Date.now() - fetcherStartTime;
        
        console.log(`[FetcherService] ${fetcher.id} a retourné ${elements?.length || 0} éléments en ${fetcherDuration}ms`);
        
        // Ajouter un rapport pour ce fetcher
        result.fetcherReports[fetcher.id] = {
          status: 'success',
          duration: fetcherDuration,
          count: elements?.length || 0
        };
        
        // Si des éléments sont retournés, les ajouter au résultat
        if (elements && elements.length > 0) {
          result.elements.push(...elements);
          
          // Calculer la valeur totale
          for (const element of elements) {
            if (element.value && typeof element.value.amount === 'number') {
              result.value.amount += element.value.amount;
            }
          }
        }
        
        return elements;
      })
      .catch(error => {
        console.error(`[FetcherService] Erreur dans ${fetcher.id}: ${error.message}`);
        
        // Ajouter un rapport d'erreur pour ce fetcher
        result.fetcherReports[fetcher.id] = {
          status: 'error',
          duration: Date.now() - fetcherStartTime,
          error: error.message
        };
        
        // Retourner un tableau vide en cas d'erreur
        return [];
      });
  });
  
  // Attendre que tous les fetchers soient terminés
  await Promise.all(fetcherPromises);
  
  // Calculer la durée totale
  result.duration = Date.now() - startTime;
  console.log(`[FetcherService] Exécution terminée en ${result.duration}ms avec ${result.elements.length} éléments`);
  
  return result;
}

/**
 * Obtenir les fetchers par ID de réseau
 * @param {string} networkId - ID du réseau
 * @returns {Array} - Liste des fetchers disponibles pour ce réseau
 */
function getFetchersByNetworkId(networkId) {
  return ALL_FETCHERS.filter(fetcher => fetcher.networkId === networkId);
}

/**
 * Exécute tous les fetchers pour une adresse donnée
 * @param {string} address - Adresse du portefeuille
 * @returns {Promise<Object>} - Portfolio complet avec tous les éléments
 */
async function fetchAllPortfolio(address) {
  console.log(`[FetcherService] Récupération du portfolio complet pour ${address}`);
  return runFetchers(ALL_FETCHERS, address);
}

/**
 * Exécute un fetcher spécifique pour une adresse donnée
 * @param {string} fetcherId - ID du fetcher à exécuter
 * @param {string} address - Adresse du portefeuille
 * @returns {Promise<Array>} - Éléments de portfolio pour ce fetcher
 */
async function fetchSpecificPlatform(fetcherId, address) {
  console.log(`[FetcherService] Récupération spécifique pour ${fetcherId} et l'adresse ${address}`);
  
  const fetcher = ALL_FETCHERS.find(f => f.id === fetcherId);
  
  if (!fetcher) {
    throw new Error(`Fetcher avec l'ID ${fetcherId} non trouvé`);
  }
  
  return fetcher.execute(address);
}

/**
 * Retourne la liste de tous les fetchers disponibles
 * Utilisé pour l'UI
 * @returns {Array} - Liste des fetchers
 */
function getAllFetchers() {
  return ALL_FETCHERS.map(fetcher => ({
    id: fetcher.id,
    networkId: fetcher.networkId,
    platformId: fetcher.platformId,
    platformType: fetcher.platformType
  }));
}

// Étendre les exports pour inclure les fonctions
Object.assign(module.exports, {
  fetchAllPortfolio,
  fetchSpecificPlatform,
  getAllFetchers,
  runFetchers,
  getFetchersByNetworkId
});