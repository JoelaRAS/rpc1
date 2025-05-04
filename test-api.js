// Script de test pour vérifier le fonctionnement de l'API

const axios = require('axios');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3001'; // Utilise l'API locale sur le port 3001
const TEST_WALLET = process.env.TEST_WALLET || '6MKZipzxQpvoShQxNZ89jP63KMckcJRw9exwNwAuRGGe';
// Transaction de swap sur Jupiter qui contient des tokens (remplace celle qui n'en contient pas)
const TEST_TRANSACTION = process.env.TEST_TRANSACTION || '3vDU7vBzwVDojtza9aNJLTmW3HZ7SZkmLiTga6k8J3H1PXqiUdo33RLW6KnLpqUUx4ssK7hxKfAMfVYsd23gddVL';

// Fonction pour mesurer le temps d'exécution
function timer() {
  const start = Date.now();
  return {
    elapsed: () => {
      return ((Date.now() - start) / 1000).toFixed(3);
    }
  };
}

// Fonction principale de test
async function runTests() {
  console.log("\n==================================================");
  console.log("DÉBUT DES TESTS DE L'API");
  console.log("==================================================\n");
  
  console.log(`API: ${API_URL}`);
  console.log(`Adresse de test: ${TEST_WALLET}`);
  
  let transaction = null;
  
  // Test 1: Portfolio
  console.log("\n==================================================");
  console.log("TEST PORTFOLIO");
  console.log("==================================================\n");
  
  console.log(`Récupération du portefeuille: ${TEST_WALLET}`);
  try {
    const t = timer();
    const response = await axios.get(`${API_URL}/api/portfolio/${TEST_WALLET}`);
    
    if (response.data && (response.data.success || response.data.data)) {
      const data = response.data.data || response.data;
      console.log(`✅ Succès! Temps: ${t.elapsed()} secondes`);
      console.log(`Solde SOL: ${data.nativeBalance?.solAmount || 'Non disponible'}`);
      console.log(`Nombre de tokens: ${data.tokenAccounts?.length || 0}`);
      
      // Pour tester ensuite une transaction, on prend une des transactions récentes si aucune n'est spécifiée
      if (!TEST_TRANSACTION) {
        try {
          const historyResponse = await axios.get(`${API_URL}/api/portfolio/history/${TEST_WALLET}?limit=5`);
          if (historyResponse.data && historyResponse.data.transactions && historyResponse.data.transactions.length > 0) {
            transaction = historyResponse.data.transactions[0].signature;
            console.log(`\nRécupération d'une transaction récente...`);
          }
        } catch (error) {
          console.log("Impossible de récupérer l'historique des transactions");
        }
      } else {
        transaction = TEST_TRANSACTION;
        console.log(`\nUtilisation de la transaction de test...`);
      }
    } else {
      console.log(`❌ Erreur: Format de réponse incorrect`);
    }
  } catch (error) {
    console.log(`❌ Erreur: ${error.message}`);
    console.log(`Détails: ${JSON.stringify(error.response?.data || {})}`);
  }
  
  // Test 2: Token (test basique, juste vérifier si l'endpoint répond)
  console.log("\n==================================================");
  console.log("TEST TOKEN");
  console.log("==================================================\n");
  
  // Ce test est optionnel selon qu'on a récupéré des tokens ou non
  let tokenToTest = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC par défaut
  
  try {
    const t = timer();
    const response = await axios.get(`${API_URL}/api/token/${tokenToTest}`);
    
    if (response.data && (response.data.success || response.data.data)) {
      console.log(`✅ Succès! Temps: ${t.elapsed()} secondes`);
      const data = response.data.data || response.data;
      console.log(`Token: ${data.symbol || 'Non disponible'}`);
    } else {
      console.log(`❌ Erreur: Format de réponse incorrect`);
    }
  } catch (error) {
    console.log(`❌ Erreur: ${error.message}`);
  }
  
  // Test 3: Transaction (avec un focus sur l'historique des prix)
  console.log("\n==================================================");
  console.log("TEST TRANSACTION");
  console.log("==================================================\n");
  
  if (!transaction) {
    transaction = TEST_TRANSACTION;
  }
  
  console.log(`Récupération de la transaction: ${transaction}`);
  
  try {
    const t = timer();
    const response = await axios.get(`${API_URL}/api/transaction/${transaction}`);
    
    if (response.data && (response.data.success || response.data.data)) {
      console.log(`✅ Succès! Temps: ${t.elapsed()} secondes`);
      
      const data = response.data.data || response.data;
      console.log(`Statut: ${data.status || 'Non disponible'}`);
      console.log(`Date: ${data.blockTime || 'Non disponible'}`);
      
      // Vérifier si l'analyse a détecté un protocole
      if (data.analysis && data.analysis.protocol) {
        console.log(`Protocol identifié: ${data.analysis.protocol}`);
      } else {
        console.log(`Protocol: Non identifié`);
      }
      
      // Vérifier si l'analyse a détecté un type de transaction
      if (data.analysis && data.analysis.type) {
        console.log(`Type de transaction: ${data.analysis.type}`);
      } else {
        console.log(`Type de transaction: unknown`);
      }
      
      // Vérifier la présence de l'historique des prix
      if (data.transaction && data.transaction.priceHistory) {
        const priceHistoryEntries = Object.entries(data.transaction.priceHistory);
        
        if (priceHistoryEntries.length > 0) {
          console.log(`\n✅ HISTORIQUE DES PRIX TROUVÉ: ${priceHistoryEntries.length} tokens`);
          
          priceHistoryEntries.forEach(([mint, info]) => {
            if (info.priceHistory) {
              console.log(`- ${info.symbol}: ${info.priceHistory.price} USD (source: ${info.priceHistory.source})`);
            }
          });
        } else {
          console.log(`\n❌ AUCUN HISTORIQUE DE PRIX TROUVÉ`);
        }
      } else {
        console.log(`\n❌ AUCUN HISTORIQUE DE PRIX TROUVÉ`);
      }
    } else {
      console.log(`❌ Erreur: Format de réponse incorrect`);
    }
  } catch (error) {
    console.log(`❌ Erreur: ${error.message}`);
    if (error.response) {
      console.log(`Statut: ${error.response.status}`);
      console.log(`Détails: ${JSON.stringify(error.response.data || {})}`);
    }
  }
  
  // Résumé des tests
  console.log("\n==================================================");
  console.log("FIN DES TESTS");
  console.log("==================================================\n");
  
  console.log("Résumé:");
  console.log(`- Test Portfolio: ${!error1 ? '✅ Réussi' : '❌ Échoué'}`);
  console.log(`- Test Token: ${!error2 ? '✅ Réussi' : error2 === 'skipped' ? '⚠️ Non testé' : '❌ Échoué'}`);
  console.log(`- Test Transaction: ${!error3 ? '✅ Réussi' : '❌ Échoué'}`);
}

// Exécuter les tests
let error1 = false, error2 = 'skipped', error3 = false;
runTests().catch(console.error);