// Script de test complet pour vérifier le fonctionnement de l'API
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration pour l'API déployée sur Vercel
const BASE_URL = 'https://rpc1-taupe.vercel.app/api';
const WALLET_ADDRESS = '6QU5GxYgQbCi87FHwJfk8BuSLZM4SxEvpdswrFXx5pSe';
const LOG_FILE = path.join(__dirname, 'test-api-results.log');

// Initialiser le fichier de log
fs.writeFileSync(LOG_FILE, `====== TESTS RPC (API Vercel) - ${new Date().toISOString()} ======\n\n`, 'utf8');

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

// SCÉNARIO 1 : Portfolio Analytics
async function testPortfolioAnalytics() {
  log('\n==== TEST SCÉNARIO 1: Portfolio Analytics ====');
  
  // 1.1 Obtenir les soldes du portefeuille
  log('\n📊 Test 1.1: Récupération des soldes du portefeuille');
  const balances = await callAPI(`/portfolio/balances/${WALLET_ADDRESS}`);
  log(JSON.stringify(balances, null, 2));
  
  // 1.2 Obtenir les assets du portefeuille
  log('\n📊 Test 1.2: Récupération des assets du portefeuille');
  const assets = await callAPI(`/portfolio/assets/${WALLET_ADDRESS}`);
  log(JSON.stringify(assets, null, 2));
  
  // 1.3 Obtenir l'historique des transactions
  log('\n📊 Test 1.3: Récupération de l\'historique des transactions');
  const history = await callAPI(`/portfolio/history/${WALLET_ADDRESS}?limit=5`);
  log(JSON.stringify(history, null, 2));
  
  // 1.4 Obtenir l'analyse du portefeuille
  log('\n📊 Test 1.4: Analyse du portefeuille');
  const analysis = await callAPI(`/portfolio/analysis/${WALLET_ADDRESS}?days=30`);
  log(JSON.stringify(analysis, null, 2));
}

// SCÉNARIO 2 : Token Information
async function testTokenInformation() {
  log('\n==== TEST SCÉNARIO 2: Token Information ====');
  
  // 2.1 Récupérer les informations d'un token
  const tokenAddress = 'So11111111111111111111111111111111111111112'; // wSOL
  log(`\n💰 Test 2.1: Informations sur le token ${tokenAddress}`);
  const tokenInfo = await callAPI(`/token/info/${tokenAddress}`);
  log(JSON.stringify(tokenInfo, null, 2));
  
  // 2.2 Récupérer le prix d'un token
  log(`\n💰 Test 2.2: Prix du token ${tokenAddress}`);
  const tokenPrice = await callAPI(`/token/price/${tokenAddress}`);
  log(JSON.stringify(tokenPrice, null, 2));
  
  // 2.3 Récupérer l'historique des prix
  log(`\n💰 Test 2.3: Historique des prix du token ${tokenAddress}`);
  const priceHistory = await callAPI(`/token/price-history/${tokenAddress}?days=7`);
  log(JSON.stringify(priceHistory, null, 2));
  
  // 2.4 Récupérer les tokens tendance
  log('\n💰 Test 2.4: Tokens tendance');
  const trending = await callAPI('/token/trending');
  log(JSON.stringify(trending, null, 2));
}

// SCÉNARIO 3 : Transaction Analysis avec une transaction qui contient des tokens
async function testTransactionAnalysis() {
  log('\n==== TEST SCÉNARIO 3: Transaction Analysis ====');
  
  // Utiliser une transaction connue qui contient des tokens pour tester l'historique des prix
  const TEST_TRANSACTION = '4CscY8Efho9gPuMSDXKFwKogVaWTn5viSQR2ELYH1z2DVaA7snzy8Wsc2nAM13qBqaMbGnBWCETuRQ2yUUySuMnV';
  
  // 3.1 Obtenir l'historique des transactions pour trouver une signature
  log('\n💼 Test 3.1: Recherche d\'une signature de transaction');
  const history = await callAPI(`/portfolio/history/${WALLET_ADDRESS}?limit=1`);
  let txSignature = history.data?.transactions?.[0]?.signature;
  
  if (!txSignature) {
    log('Aucune signature de transaction trouvée dans l\'historique. Utilisation de la transaction de test.');
    txSignature = TEST_TRANSACTION;
  }
  
  log(`Signature de transaction trouvée: ${txSignature}`);
  
  // 3.2 Analyser une transaction
  log(`\n💼 Test 3.2: Analyse de la transaction ${txSignature}`);
  const txAnalysis = await callAPI(`/transaction/${txSignature}`);
  log(JSON.stringify(txAnalysis, null, 2));
  
  // Focus spécial sur l'historique des prix
  if (txAnalysis.data?.transaction?.priceHistory) {
    const priceHistoryEntries = Object.entries(txAnalysis.data.transaction.priceHistory);
    
    if (priceHistoryEntries.length > 0) {
      log(`\n✅ HISTORIQUE DES PRIX TROUVÉ: ${priceHistoryEntries.length} tokens`);
      
      priceHistoryEntries.forEach(([mint, info]) => {
        const priceInfo = info.price ? info : (info.priceHistory || {});
        log(`- ${info.symbol || mint}: ${priceInfo.price} USD (source: ${priceInfo.source})`);
      });
    } else {
      log(`\n❌ AUCUN HISTORIQUE DE PRIX TROUVÉ`);
    }
  } else {
    log(`\n❌ AUCUN HISTORIQUE DE PRIX TROUVÉ`);
  }
  
  // Tester aussi avec la transaction de test connue pour contenir des tokens
  log(`\n💼 Test 3.2b: Analyse de la transaction de test ${TEST_TRANSACTION}`);
  const testTxAnalysis = await callAPI(`/transaction/${TEST_TRANSACTION}`);
  log(JSON.stringify(testTxAnalysis, null, 2));
  
  // Focus spécial sur l'historique des prix pour la transaction de test
  if (testTxAnalysis.data?.transaction?.priceHistory) {
    const priceHistoryEntries = Object.entries(testTxAnalysis.data.transaction.priceHistory);
    
    if (priceHistoryEntries.length > 0) {
      log(`\n✅ HISTORIQUE DES PRIX TROUVÉ (transaction de test): ${priceHistoryEntries.length} tokens`);
      
      priceHistoryEntries.forEach(([mint, info]) => {
        const priceInfo = info.price ? info : (info.priceHistory || {});
        log(`- ${info.symbol || mint}: ${priceInfo.price} USD (source: ${priceInfo.source})`);
      });
    } else {
      log(`\n❌ AUCUN HISTORIQUE DE PRIX TROUVÉ DANS LA TRANSACTION DE TEST`);
    }
  } else {
    log(`\n❌ AUCUN HISTORIQUE DE PRIX TROUVÉ DANS LA TRANSACTION DE TEST`);
  }
  
  // 3.3 Simuler un swap via Jupiter
  log('\n💼 Test 3.3: Simulation d\'un swap via Jupiter');
  const swapData = {
    inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    outputMint: 'So11111111111111111111111111111111111111112',  // wSOL
    amount: '1000000',  // 1 USDC
    slippageBps: 50,
    walletAddress: WALLET_ADDRESS
  };
  
  try {
    const swapResult = await callAPI('/transaction/swap', 'POST', swapData);
    log(JSON.stringify(swapResult, null, 2));
  } catch (error) {
    log('Note: La simulation de swap peut échouer si le wallet ne possède pas les tokens nécessaires.');
  }
}

// SCÉNARIO 4 : Portfolio Optimization / Strategy
async function testPortfolioOptimization() {
  log('\n==== TEST SCÉNARIO 4: Portfolio Optimization / Strategy ====');
  
  // 4.1 Obtenir des opportunités de staking
  log('\n📈 Test 4.1: Opportunités de staking');
  try {
    const stakingOpportunities = await callAPI('/token/staking-opportunities/SOL');
    log(JSON.stringify(stakingOpportunities, null, 2));
  } catch (error) {
    log('Note: Cette fonctionnalité peut ne pas être encore implémentée.');
  }
  
  // 4.2 Comparer des tokens
  log('\n📈 Test 4.2: Comparaison de tokens');
  try {
    const comparison = await callAPI('/token/compare?tokens=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v,So11111111111111111111111111111111111111112');
    log(JSON.stringify(comparison, null, 2));
  } catch (error) {
    log('Note: Cette fonctionnalité peut ne pas être encore implémentée.');
  }
}

// Fonction principale pour exécuter tous les tests
async function runAllTests() {
  log('🚀 Début des tests du RPC sur l\'API Vercel');
  log(`API URL: ${BASE_URL}`);
  
  try {
    await testPortfolioAnalytics();
    await testTokenInformation();
    await testTransactionAnalysis();
    await testPortfolioOptimization();
    
    log('\n✅ Tous les tests ont été exécutés !');
    log(`\n📝 Les résultats des tests ont été enregistrés dans: ${LOG_FILE}`);
  } catch (error) {
    log('\n❌ Une erreur est survenue durant les tests: ' + error.message);
  }
}

// Exécuter les tests
runAllTests();