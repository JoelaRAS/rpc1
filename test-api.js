// Script de test pour l'API RPC déployée
const axios = require('axios');
require('dotenv').config();

// URL de l'API déployée
const API_URL = 'https://rpc1-taupe.vercel.app';
const WALLET_ADDRESS = '6MKZipzxQpvoShQxNZ89jP63KMckcJRw9exwNwAuRGGe';

// Fonction pour formater la sortie console
function logSection(title) {
  console.log('\n' + '='.repeat(50));
  console.log(`${title}`);
  console.log('='.repeat(50) + '\n');
}

// Fonction pour mesurer le temps d'exécution
function measureTime(startTime) {
  const endTime = new Date();
  return `${(endTime - startTime) / 1000} secondes`;
}

// 1. Test de l'endpoint portfolio
async function testPortfolio() {
  logSection('TEST PORTFOLIO');
  console.log(`Récupération du portefeuille: ${WALLET_ADDRESS}`);
  
  const startTime = new Date();
  try {
    const response = await axios.get(`${API_URL}/api/portfolio/${WALLET_ADDRESS}`);
    console.log(`✅ Succès! Temps: ${measureTime(startTime)}`);
    console.log('Solde SOL:', response.data.data.nativeBalance?.solAmount || 'Non disponible');
    console.log(`Nombre de tokens: ${response.data.data.tokenAccounts?.length || 0}`);
    
    // Afficher quelques tokens (si disponibles)
    if (response.data.data.tokenAccounts && response.data.data.tokenAccounts.length > 0) {
      console.log('\nExemples de tokens:');
      const tokens = response.data.data.tokenAccounts.slice(0, 3); // Afficher max 3 tokens
      
      tokens.forEach(token => {
        console.log(`- ${token.symbol || 'Unknown'}: ${token.uiAmount || 'N/A'} (${token.mint.slice(0, 8)}...)`);
      });
    }
    
    return response.data;
  } catch (error) {
    console.log(`❌ Erreur: ${error.message}`);
    if (error.response) {
      console.log('Détails:', error.response.data);
    }
    return null;
  }
}

// 2. Test de l'endpoint token pour un token du portefeuille
async function testToken(tokenAddress) {
  if (!tokenAddress) {
    console.log('Aucune adresse de token fournie pour le test');
    return;
  }
  
  logSection('TEST TOKEN');
  console.log(`Récupération du token: ${tokenAddress}`);
  
  const startTime = new Date();
  try {
    const response = await axios.get(`${API_URL}/api/token/${tokenAddress}`);
    console.log(`✅ Succès! Temps: ${measureTime(startTime)}`);
    console.log('Symbole:', response.data.data.symbol || 'Non disponible');
    console.log('Nom:', response.data.data.name || 'Non disponible');
    console.log('Prix actuel:', response.data.data.price?.usd || 'Non disponible');
    
    return response.data;
  } catch (error) {
    console.log(`❌ Erreur: ${error.message}`);
    if (error.response) {
      console.log('Détails:', error.response.data);
    }
    return null;
  }
}

// 3. Test de l'endpoint transaction pour la dernière transaction
async function testTransaction(signature) {
  if (!signature) {
    console.log('Aucune signature de transaction fournie pour le test');
    return;
  }
  
  logSection('TEST TRANSACTION');
  console.log(`Récupération de la transaction: ${signature}`);
  
  const startTime = new Date();
  try {
    const response = await axios.get(`${API_URL}/api/transaction/${signature}`);
    console.log(`✅ Succès! Temps: ${measureTime(startTime)}`);
    console.log('Statut:', response.data.data.status || 'Non disponible');
    console.log('Date:', response.data.data.blockTime || 'Non disponible');
    console.log('Protocol identifié:', response.data.data.analysis?.protocol || 'Non disponible');
    console.log('Type de transaction:', response.data.data.analysis?.type || 'Non disponible');
    
    // Vérifier si l'historique des prix est inclus
    if (response.data.data.transaction.priceHistory) {
      console.log('\n✅ HISTORIQUE DES PRIX PRÉSENT:');
      
      const priceHistory = response.data.data.transaction.priceHistory;
      const mints = Object.keys(priceHistory);
      
      mints.forEach(mint => {
        const token = priceHistory[mint];
        console.log(`- ${token.symbol} (${mint.slice(0, 8)}...): ${token.priceHistory ? 'Historique disponible' : 'Pas d\'historique'}`);
      });
    } else {
      console.log('\n❌ AUCUN HISTORIQUE DE PRIX TROUVÉ');
    }
    
    return response.data;
  } catch (error) {
    console.log(`❌ Erreur: ${error.message}`);
    if (error.response) {
      console.log('Détails:', error.response.data);
    }
    return null;
  }
}

// Fonction principale qui exécute tous les tests
async function runAllTests() {
  try {
    logSection('DÉBUT DES TESTS DE L\'API');
    console.log(`API: ${API_URL}`);
    console.log(`Adresse de test: ${WALLET_ADDRESS}`);
    
    // 1. Test du portefeuille
    const portfolioData = await testPortfolio();
    
    // 2. Test d'un token (si un token est disponible dans le portefeuille)
    let tokenAddress = null;
    if (portfolioData && portfolioData.data && portfolioData.data.tokenAccounts && portfolioData.data.tokenAccounts.length > 0) {
      tokenAddress = portfolioData.data.tokenAccounts[0].mint;
      await testToken(tokenAddress);
    }
    
    // 3. Récupérer une signature de transaction récente
    let txSignature = null;
    try {
      // Utiliser le service Helius directement pour récupérer l'historique des transactions
      console.log('\nRécupération d\'une transaction récente...');
      const heliusUrl = process.env.HELIUS_RPC_URL;
      const history = await axios.post(heliusUrl, {
        jsonrpc: '2.0',
        id: 'history',
        method: 'getSignaturesForAddress',
        params: [WALLET_ADDRESS, { limit: 1 }],
      });
      
      if (history.data && history.data.result && history.data.result.length > 0) {
        txSignature = history.data.result[0].signature;
        await testTransaction(txSignature);
      } else {
        console.log('Aucune transaction récente trouvée pour cette adresse');
      }
    } catch (error) {
      console.log(`Erreur lors de la récupération des transactions: ${error.message}`);
    }
    
    logSection('FIN DES TESTS');
    console.log('Résumé:');
    console.log(`- Test Portfolio: ${portfolioData ? '✅ Réussi' : '❌ Échoué'}`);
    console.log(`- Test Token: ${tokenAddress ? '✅ Réussi' : '⚠️ Non testé'}`);
    console.log(`- Test Transaction: ${txSignature ? '✅ Réussi' : '⚠️ Non testé'}`);
    
  } catch (error) {
    console.error('Erreur lors de l\'exécution des tests:', error.message);
  }
}

// Exécuter les tests
runAllTests();