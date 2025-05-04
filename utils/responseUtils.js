/**
 * Utilitaire pour standardiser les réponses API
 */
class ResponseUtils {
  /**
   * Crée une réponse de succès standardisée
   * @param {Object} data - Les données à retourner
   * @param {string} message - Message optionnel
   * @returns {Object} - Réponse standardisée
   */
  static success(data = {}, message = 'Opération réussie') {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Crée une réponse d'erreur standardisée
   * @param {string} message - Message d'erreur
   * @param {number} statusCode - Code d'état HTTP
   * @param {Object} errors - Erreurs supplémentaires
   * @returns {Object} - Réponse d'erreur standardisée
   */
  static error(message = 'Une erreur est survenue', statusCode = 500, errors = null) {
    return {
      success: false,
      message,
      statusCode,
      errors,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Middleware Express pour gérer les erreurs de manière standardisée
   */
  static errorHandler() {
    return (err, req, res, next) => {
      console.error(`Erreur: ${err.message}`);
      
      const statusCode = err.statusCode || 500;
      const message = err.message || 'Une erreur serveur est survenue';
      
      res.status(statusCode).json(
        ResponseUtils.error(message, statusCode, err.errors)
      );
    };
  }

  /**
   * Middleware pour les routes non trouvées
   */
  static notFoundHandler() {
    return (req, res) => {
      res.status(404).json(
        ResponseUtils.error('Route non trouvée', 404)
      );
    };
  }
}

module.exports = ResponseUtils;