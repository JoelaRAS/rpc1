const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://rpc1-taupe.vercel.app/api';
const LOG_FILE = path.join(__dirname, 'test-transaction-results.log');

// Transaction connue pour contenir des tokens (swap Jupiter)
const TEST_TRANSACTION = '4CscY8Efho9gPuMSDXKFwKogVaWTn5viSQR2ELYH1z2DVaA7snzy8Wsc2nAM13qBqaMbGnBWCETuRQ2yUUySuMnV';

// Initialiser le fichier de log
fs.writeFileSync(LOG_FILE, `====== TEST ENDPOINT TRANSACTION - ${new Date().toISOString()} ======\n\n`, 'utf8');

// Fonction pour logger dans un fichier et sur la console
function log(message) {
  console.log(message);
  fs.appendFileSync(LOG_FILE, message + '\n', 'utf8');
}

// Fonction utilitaire pour les appels API
async function callAPI(endpoint, method = 'GET', data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`
    };
    
    if (data && method === 'POST') {
      config.data = data;
    }
    
    log(`\n🔄 Appel API: ${method} ${config.url}`);
    const start = Date.now();
    const response = await axios(config);
    const duration = Date.now() - start;
    
    log(`✅ Réponse reçue en ${duration}ms`);
    return response.data;
  } catch (error) {
    log(`❌ Erreur lors de l'appel API: ${error.message}`);
    if (error.response) {
      log(`Code: ${error.response.status}, Message: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Analyse les résultats de l'API pour vérifier le flux d'information
 * et la présence d'historique des prix
 */
function analyzeResults(data) {
  log('\n===== ANALYSE DES RÉSULTATS =====');
  
  // Vérifier la structure générale de la réponse
  if (!data || !data.data) {
    log('❌ Structure de réponse invalide');
    return;
  }
  
  const txData = data.data;
  
  // 1. Vérifier si la transaction a été analysée correctement
  log('\n1. INFORMATIONS GÉNÉRALES:');
  log(`- Signature: ${txData.signature || 'Non disponible'}`);
  log(`- Statut: ${txData.status || 'Non disponible'}`);
  log(`- Date: ${txData.blockTime || 'Non disponible'}`);
  log(`- Frais: ${txData.fee || 'Non disponible'} SOL`);
  
  // 2. Vérifier la présence de l'analyse
  log('\n2. ANALYSE DE TRANSACTION:');
  if (txData.analysis) {
    log(`- Protocole: ${txData.analysis.protocol || 'Non identifié'}`);
    log(`- Type: ${txData.analysis.type || 'Non identifié'}`);
    
    // Afficher les programmes impliqués
    if (txData.analysis.programIds) {
      log('- Programmes impliqués:');
      txData.analysis.programIds.forEach(program => {
        log(`  • ${program.name} (${program.address})`);
      });
    }
  } else {
    log('❌ Aucune analyse disponible');
  }
  
  // 3. Vérifier la présence de l'historique des prix
  log('\n3. HISTORIQUE DES PRIX:');
  if (txData.transaction && txData.transaction.priceHistory) {
    const priceHistory = txData.transaction.priceHistory;
    const mintAddresses = Object.keys(priceHistory);
    
    log(`✅ HISTORIQUE DES PRIX TROUVÉ: ${mintAddresses.length} tokens`);
    
    mintAddresses.forEach(mint => {
      const tokenData = priceHistory[mint];
      const priceInfo = tokenData.priceHistory || tokenData;
      // Utiliser le symbole de priceInfo en priorité, puis tokenData.symbol, puis l'adresse mint
      log(`- ${priceInfo.symbol || tokenData.symbol || mint}: ${priceInfo.price} USD (source: ${priceInfo.source})`);
    });
    
    // Vérifier si XRP est présent dans les résultats
    const xrpTokens = mintAddresses.filter(mint => {
      return priceHistory[mint].symbol === 'XRP';
    });
    
    if (xrpTokens.length > 0) {
      log('\n⚠️ ALERTE: Token XRP détecté dans les résultats!');
      xrpTokens.forEach(mint => {
        log(`- Mint: ${mint}`);
        log(`- Source de données: ${priceHistory[mint].priceHistory?.source || 'Non spécifiée'}`);
      });
    }
  } else {
    log('❌ AUCUN HISTORIQUE DE PRIX TROUVÉ');
  }
  
  // 4. Vérifier la présence d'informations sur les assets via Jupiter
  log('\n4. INFORMATIONS SUR LES ASSETS:');
  if (txData.transaction && txData.transaction.assetInfo) {
    const assetInfo = txData.transaction.assetInfo;
    const mintAddresses = Object.keys(assetInfo);
    
    log(`✅ INFORMATIONS SUR LES ASSETS TROUVÉES: ${mintAddresses.length} tokens`);
    
    mintAddresses.forEach(mint => {
      const tokenData = assetInfo[mint];
      log(`- ${tokenData.symbol || 'UNKNOWN'} (${tokenData.name || 'Unknown Token'}): ${mint.substring(0, 6)}...`);
    });
  } else {
    log('❌ AUCUNE INFORMATION SUR LES ASSETS TROUVÉE');
  }
}

/**
 * Test de l'endpoint de transaction avec des signatures connues
 */
async function testTransactionEndpoint() {
  log('🚀 Début du test de l\'endpoint de transaction');
  log(`API URL: ${BASE_URL}`);
  
  try {
    // Test avec la transaction de test connue (swap Jupiter)
    log(`\n==== TEST TRANSACTION CONNUE: ${TEST_TRANSACTION} ====`);
    const result = await callAPI(`/transaction/${TEST_TRANSACTION}`);
    log('\nRésultat brut:');
    log(JSON.stringify(result, null, 2));
    
    // Analyse des résultats
    analyzeResults(result);
    
    log('\n✅ Test terminé !');
    log(`\n📝 Les résultats ont été enregistrés dans: ${LOG_FILE}`);
  } catch (error) {
    log('\n❌ Une erreur est survenue durant le test: ' + error.message);
    if (error.stack) {
      log(error.stack);
    }
  }
}

// Exécuter le test
testTransactionEndpoint();