/**
 * Service pour interagir avec Marinade Finance (staking liquide)
 * Ce service gère les requêtes liées aux tokens mSOL et aux positions de staking
 */
const axios = require('axios');
const priceService = require('./priceService');
const solanaWebService = require('./solanaWebService');
const { Connection, PublicKey } = require('@solana/web3.js');

// Constantes
const MARINADE_PROGRAM_ID = 'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD';
const MSOL_TOKEN = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';

/**
 * Récupère les détails généraux du staking Marinade (taux mSOL/SOL, APY)
 * @returns {Promise<Object>} Détails du staking
 */
async function getStakingDetails() {
  try {
    // Dans une implémentation réelle, on interrogerait l'API Marinade ou le programme on-chain
    // Pour la simplicité, on retourne des valeurs statiques
    return {
      msolToSolRate: 1.042, // 1 mSOL = 1.042 SOL
      apy: 0.068, // 6.8% APY
      totalStaked: 59000000, // 59M SOL stakés
      liquidityPool: 120000 // 120K SOL en liquidité
    };
  } catch (error) {
    console.error(`[MarinadeService] Erreur lors de la récupération des détails de staking: ${error.message}`);
    // En cas d'erreur, retourner des valeurs par défaut
    return {
      msolToSolRate: 1.04,
      apy: 0.065,
      totalStaked: 0,
      liquidityPool: 0
    };
  }
}

/**
 * Récupère les stakes directs d'un utilisateur dans Marinade
 * @param {string} owner - Adresse du propriétaire
 * @returns {Promise<Array>} Liste des stakes directs
 */
async function getDirectStakes(owner) {
  try {
    // Simuler l'appel à la blockchain pour les stakes directs
    // Dans une implémentation réelle, on interrogerait la blockchain
    const stakes = await solanaWebService.getStakeAccountsByOwner(owner);
    
    // Filtrer uniquement les stakes gérés par Marinade
    const marinadeStakes = stakes.filter(stake => 
      stake.withdrawer === MARINADE_PROGRAM_ID || 
      stake.staker === MARINADE_PROGRAM_ID
    );
    
    return marinadeStakes.map(stake => ({
      address: stake.address,
      amount: stake.amount,
      activationEpoch: stake.activationEpoch,
      deactivationEpoch: stake.deactivationEpoch || null,
      status: stake.status
    }));
  } catch (error) {
    console.error(`[MarinadeService] Erreur lors de la récupération des stakes directs: ${error.message}`);
    return [];
  }
}

/**
 * Récupère le taux de conversion mSOL/SOL actuel
 * @returns {Promise<number>} Taux de conversion
 */
async function getMsolToSolRate() {
  try {
    const { msolToSolRate } = await getStakingDetails();
    return msolToSolRate;
  } catch (error) {
    console.error(`[MarinadeService] Erreur lors de la récupération du taux mSOL/SOL: ${error.message}`);
    return 1.04; // Valeur par défaut
  }
}

module.exports = {
  getStakingDetails,
  getDirectStakes,
  getMsolToSolRate,
  MARINADE_PROGRAM_ID,
  MSOL_TOKEN
};