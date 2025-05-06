/**
 * Circuit Breaker Service
 * 
 * Ce service implémente le pattern Circuit Breaker pour protéger le système
 * contre les appels répétés à des services externes défaillants.
 * 
 * États possibles:
 * - CLOSED: Le circuit est fermé, les requêtes sont autorisées
 * - OPEN: Le circuit est ouvert, les requêtes sont bloquées
 * - HALF_OPEN: Le circuit est semi-ouvert, une requête test est autorisée
 */

// Configuration par défaut pour chaque service
const DEFAULT_CONFIG = {
  threshold: 5,           // Nombre d'échecs avant ouverture du circuit
  resetTimeMs: 60000,     // Temps avant tentative de réinitialisation (1 minute)
  halfOpenRetryRatio: 3,  // Une requête sur 3 est autorisée en mode half-open
};

// État des circuits pour tous les services
const circuits = {};

// Constantes pour les états du circuit
const CIRCUIT_STATE = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

// Métriques de surveillance
const metrics = {};

const circuitBreakerService = {
  /**
   * Initialiser un circuit pour un service
   * @param {string} serviceName - Nom du service
   * @param {Object} config - Configuration spécifique (optionnel)
   */
  registerService: function(serviceName, config = {}) {
    if (!circuits[serviceName]) {
      circuits[serviceName] = {
        state: CIRCUIT_STATE.CLOSED,
        failures: 0,
        lastFailure: 0,
        lastSuccess: Date.now(),
        halfOpenAttempts: 0,
        ...DEFAULT_CONFIG,
        ...config
      };
      
      metrics[serviceName] = {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        lastOpenedAt: null,
        totalTimeOpen: 0,
      };
      
      console.log(`Circuit Breaker: Service ${serviceName} enregistré`);
    }
  },
  
  /**
   * Vérifie si une requête vers un service peut être effectuée
   * @param {string} serviceName - Nom du service
   * @returns {boolean} - true si la requête est autorisée
   */
  canRequest: function(serviceName) {
    // Enregistrer automatiquement le service s'il n'existe pas
    if (!circuits[serviceName]) {
      this.registerService(serviceName);
    }
    
    const circuit = circuits[serviceName];
    metrics[serviceName].totalCalls++;
    
    // Si le circuit est fermé, autoriser la requête
    if (circuit.state === CIRCUIT_STATE.CLOSED) {
      return true;
    }
    
    const currentTime = Date.now();
    
    // Si le circuit est ouvert, vérifier si on peut passer en half-open
    if (circuit.state === CIRCUIT_STATE.OPEN) {
      if (currentTime - circuit.lastFailure > circuit.resetTimeMs) {
        console.log(`Circuit Breaker: Passage en HALF_OPEN pour ${serviceName}`);
        circuit.state = CIRCUIT_STATE.HALF_OPEN;
        circuit.halfOpenAttempts = 0;
      } else {
        // Circuit toujours ouvert
        return false;
      }
    }
    
    // En mode half-open, autoriser une requête test selon le ratio configuré
    if (circuit.state === CIRCUIT_STATE.HALF_OPEN) {
      circuit.halfOpenAttempts++;
      return circuit.halfOpenAttempts % circuit.halfOpenRetryRatio === 0;
    }
    
    return false;
  },
  
  /**
   * Signaler un succès pour un service
   * @param {string} serviceName - Nom du service
   */
  reportSuccess: function(serviceName) {
    if (!circuits[serviceName]) {
      this.registerService(serviceName);
    }
    
    const circuit = circuits[serviceName];
    metrics[serviceName].successCalls++;
    
    circuit.lastSuccess = Date.now();
    
    // Si le circuit était en half-open, le fermer
    if (circuit.state === CIRCUIT_STATE.HALF_OPEN || circuit.state === CIRCUIT_STATE.OPEN) {
      console.log(`Circuit Breaker: Circuit FERMÉ pour ${serviceName}`);
      
      // Si le circuit était ouvert, calculer le temps total en état ouvert
      if (circuit.state === CIRCUIT_STATE.OPEN && metrics[serviceName].lastOpenedAt) {
        metrics[serviceName].totalTimeOpen += Date.now() - metrics[serviceName].lastOpenedAt;
        metrics[serviceName].lastOpenedAt = null;
      }
      
      circuit.state = CIRCUIT_STATE.CLOSED;
    }
    
    // Réduire progressivement le compteur d'échecs en cas de succès
    if (circuit.failures > 0) {
      circuit.failures = Math.max(0, circuit.failures - 1);
    }
  },
  
  /**
   * Signaler un échec pour un service
   * @param {string} serviceName - Nom du service
   */
  reportFailure: function(serviceName) {
    if (!circuits[serviceName]) {
      this.registerService(serviceName);
    }
    
    const circuit = circuits[serviceName];
    metrics[serviceName].failedCalls++;
    
    circuit.failures++;
    circuit.lastFailure = Date.now();
    
    // Si le seuil est dépassé, ouvrir le circuit
    if (circuit.failures >= circuit.threshold && circuit.state !== CIRCUIT_STATE.OPEN) {
      console.warn(`Circuit Breaker: Circuit OUVERT pour ${serviceName} - ${circuit.failures} échecs`);
      circuit.state = CIRCUIT_STATE.OPEN;
      metrics[serviceName].lastOpenedAt = Date.now();
    }
  },
  
  /**
   * Obtenir l'état actuel d'un circuit
   * @param {string} serviceName - Nom du service
   * @returns {Object} - État du circuit
   */
  getCircuitState: function(serviceName) {
    if (!circuits[serviceName]) {
      return null;
    }
    
    const circuit = circuits[serviceName];
    const serviceMetrics = metrics[serviceName];
    
    return {
      service: serviceName,
      state: circuit.state,
      failures: circuit.failures,
      threshold: circuit.threshold,
      lastFailure: circuit.lastFailure,
      lastSuccess: circuit.lastSuccess,
      metrics: {
        totalCalls: serviceMetrics.totalCalls,
        successRate: serviceMetrics.totalCalls === 0 ? 100 : 
          ((serviceMetrics.successCalls / serviceMetrics.totalCalls) * 100).toFixed(2),
        failureRate: serviceMetrics.totalCalls === 0 ? 0 :
          ((serviceMetrics.failedCalls / serviceMetrics.totalCalls) * 100).toFixed(2),
        totalTimeOpen: serviceMetrics.totalTimeOpen,
        isCurrentlyOpen: circuit.state !== CIRCUIT_STATE.CLOSED
      }
    };
  },
  
  /**
   * Obtenir l'état de tous les circuits
   * @returns {Object} - État de tous les circuits
   */
  getAllCircuitStates: function() {
    const states = {};
    
    for (const serviceName in circuits) {
      states[serviceName] = this.getCircuitState(serviceName);
    }
    
    return states;
  },
  
  /**
   * Réinitialiser l'état d'un circuit manuellement
   * @param {string} serviceName - Nom du service
   */
  resetCircuit: function(serviceName) {
    if (!circuits[serviceName]) {
      return;
    }
    
    const circuit = circuits[serviceName];
    circuit.state = CIRCUIT_STATE.CLOSED;
    circuit.failures = 0;
    circuit.lastSuccess = Date.now();
    circuit.halfOpenAttempts = 0;
    
    console.log(`Circuit Breaker: Circuit réinitialisé manuellement pour ${serviceName}`);
  }
};

module.exports = circuitBreakerService;