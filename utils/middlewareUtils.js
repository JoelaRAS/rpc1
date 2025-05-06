const cacheService = require('../services/cacheService');
const ResponseUtils = require('./responseUtils');

/**
 * Middleware pour gérer le cache des données du portefeuille
 * @param {Object} options - Options de configuration
 * @param {string} options.dataType - Type de données à récupérer (tokens, nfts, staking, protocols, etc.)
 * @param {Function} options.getData - Fonction pour obtenir les données si pas en cache
 * @returns {Function} Middleware Express
 */
const cacheMiddleware = (options = {}) => {
  const { dataType, getData } = options;
  
  return async (req, res, next) => {
    try {
      const { walletAddress } = req.params;
      const { refresh = false, network = 'mainnet' } = req.query;
      
      // Si refresh est demandé ou pas de type de données spécifié, passer au controller
      if (refresh === 'true' || !dataType) {
        return next();
      }
      
      // Vérifier le cache
      const cachedData = cacheService.getWalletData(walletAddress);
      
      // Si les données sont en cache et du type demandé, renvoyer directement
      if (cachedData && (dataType === 'all' || cachedData[dataType])) {
        console.log(`Données du cache utilisées pour ${walletAddress} (${dataType})`);
        
        // Préparer la réponse en fonction du type de données
        let responseData = { walletAddress };
        
        if (dataType === 'all') {
          responseData = cachedData;
        } else if (dataType === 'summary') {
          responseData = {
            walletAddress,
            totalValueUsd: cachedData.totalValueUsd || 0,
            solBalance: cachedData.solBalance || 0,
            solValueUsd: cachedData.solValueUsd || 0,
            tokensCount: cachedData.tokens ? cachedData.tokens.length : 0,
            nftsCount: cachedData.nfts ? cachedData.nfts.length : 0
          };
        } else {
          responseData[dataType] = cachedData[dataType] || [];
          
          // Ajouter les données SOL pour l'endpoint tokens
          if (dataType === 'tokens') {
            responseData.solBalance = cachedData.solBalance;
            responseData.solValueUsd = cachedData.solValueUsd;
          }
        }
        
        return res.json(ResponseUtils.success(responseData));
      }
      
      // Si pas en cache et getData fourni, récupérer les données
      if (getData) {
        const data = await getData(walletAddress, network);
        // Mettre en cache
        if (!cacheService.getWalletData(walletAddress)) {
          cacheService.setWalletData(walletAddress, data);
        } else {
          // Mise à jour sélective du cache
          const existingData = cacheService.getWalletData(walletAddress);
          existingData[dataType] = data[dataType];
          cacheService.setWalletData(walletAddress, existingData);
        }
        return res.json(ResponseUtils.success(data));
      }
      
      // Passer au controller si aucune autre action
      next();
    } catch (error) {
      console.error(`Erreur dans le middleware de cache:`, error);
      next(error);
    }
  };
};

/**
 * Middleware pour gérer les erreurs de manière uniforme
 */
const errorHandlerMiddleware = (err, req, res, next) => {
  console.error('Erreur API:', err);
  res.status(err.statusCode || 500).json(
    ResponseUtils.error(err.message || 'Erreur serveur interne', err.details)
  );
};

module.exports = {
  cacheMiddleware,
  errorHandlerMiddleware
};