/**
 * Service pour interagir avec Jito (staking liquide et MEV)
 * Ce service gère les requêtes liées aux tokens jitoSOL et aux positions de staking
 */
const axios = require('axios');
const priceService = require('./priceService');
const solanaWebService = require('./solanaWebService');

// Constantes
const JITO_PROGRAM_ID = 'jito11111111111111111111111111111111111111';
const JITOSOL_TOKEN = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn';

/**
 * Récupère les détails généraux du staking Jito (taux jitoSOL/SOL, APY)
 * @returns {Promise<Object>} Détails du staking
 */
async function getStakingDetails() {
  try {
    // Dans une implémentation réelle, on interrogerait l'API Jito ou le programme on-chain
    // Pour la simplicité, on retourne des valeurs statiques
    return {
      jitosolToSolRate: 1.045, // 1 jitoSOL = 1.045 SOL
      apy: 0.072, // 7.2% APY
      totalStaked: 28000000, // 28M SOL stakés
      mevRewards: 0.012 // 1.2% de rendement supplémentaire via MEV
    };
  } catch (error) {
    console.error(`[JitoService] Erreur lors de la récupération des détails de staking: ${error.message}`);
    // En cas d'erreur, retourner des valeurs par défaut
    return {
      jitosolToSolRate: 1.04,
      apy: 0.07,
      totalStaked: 0,
      mevRewards: 0.01
    };
  }
}

/**
 * Récupère le taux de conversion jitoSOL/SOL actuel
 * @returns {Promise<number>} Taux de conversion
 */
async function getJitosolToSolRate() {
  try {
    const { jitosolToSolRate } = await getStakingDetails();
    return jitosolToSolRate;
  } catch (error) {
    console.error(`[JitoService] Erreur lors de la récupération du taux jitoSOL/SOL: ${error.message}`);
    return 1.04; // Valeur par défaut
  }
}

/**
 * Calcule les récompenses MEV pour un utilisateur Jito
 * @param {string} owner - Adresse du propriétaire 
 * @returns {Promise<Object>} Informations sur les récompenses MEV
 */
async function getMevRewards(owner) {
  try {
    // Dans une implémentation réelle, on interrogerait l'API Jito
    // Pour la simplicité, on retourne des valeurs simulées
    return {
      totalRewards: 0.05, // 0.05 SOL de récompenses MEV
      lastEpochRewards: 0.002, // 0.002 SOL de récompenses dans la dernière époque
      annualizedYield: 0.012 // 1.2% de rendement annuel
    };
  } catch (error) {
    console.error(`[JitoService] Erreur lors de la récupération des récompenses MEV: ${error.message}`);
    return {
      totalRewards: 0,
      lastEpochRewards: 0,
      annualizedYield: 0
    };
  }
}

module.exports = {
  getStakingDetails,
  getJitosolToSolRate,
  getMevRewards,
  JITO_PROGRAM_ID,
  JITOSOL_TOKEN
};