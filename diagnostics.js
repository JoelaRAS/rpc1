const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

// Services à tester
const birdeyeService = require('./services/birdeyeService');
const coinGeckoService = require('./services/coinGeckoService');
const jupiterService = require('./services/jupiterService');
const cryptoCompareService = require('./services/cryptoCompareService');
const heliusService = require('./services/heliusService');

// Configuration des logs
const logFile = 'diagnostics.log';
fs.writeFileSync(logFile, `=== DIAGNOSTICS DÉMARRÉS LE ${new Date().toISOString()} ===\n\n`);

// Fonction pour logger dans le fichier et la console
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(logFile, logMessage);
}

// Test d'une API avec timeout explicite
async function testApiWithTimeout(name, testFn, timeout = 10000) {
  log(`🔄 Test de l'API ${name}...`);
  
  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout après ${timeout}ms`)), timeout)
    );
    
    const result = await Promise.race([testFn(), timeoutPromise]);
    log(`✅ API ${name}: Succès`);
    return { success: true, data: result };
  } catch (error) {
    log(`❌ API ${name}: Échec - ${error.message}`);
    if (error.response) {
      log(`   Détails: ${JSON.stringify(error.response.data || {})}`);
      log(`   Status: ${error.response.status}`);
    }
    return { success: false, error: error.message };
  }
}

// Tests des différentes API
async function testAllApis() {
  log('🔍 VÉRIFICATION DES CONNEXIONS API');
  
  // 1. Test de l'API Birdeye
  const birdeyeResult = await testApiWithTimeout('Birdeye', async () => {
    const knownToken = 'So11111111111111111111111111111111111111112'; // wSOL address
    const result = await birdeyeService.getTokenMetadata(knownToken);
    return result;
  });
  
  // 2. Test de l'API CoinGecko
  const coinGeckoResult = await testApiWithTimeout('CoinGecko', async () => {
    const result = await coinGeckoService.getPrice('solana', 'usd');
    return result;
  });
  
  // 3. Test de l'API Jupiter
  const jupiterResult = await testApiWithTimeout('Jupiter', async () => {
    const tokens = await jupiterService.getSupportedTokens();
    return { count: tokens.length };
  });
  
  // 4. Test de l'API CryptoCompare
  const cryptoCompareResult = await testApiWithTimeout('CryptoCompare', async () => {
    const result = await cryptoCompareService.getCurrentPrice('SOL', 'USD');
    return result;
  });
  
  // 5. Test de l'API Helius
  const heliusResult = await testApiWithTimeout('Helius', async () => {
    // Utiliser une transaction connue
    const tx = '2VbqguMerW8mawCMCZVbWu5GFYDGyqT19y5bn7bTPqBjuJCnU11iqEVj5pvC7AiV7mErVZkxbaFoXwbNCsmWSqYJ';
    const result = await heliusService.getTransaction(tx);
    return { blockTime: result.blockTime };
  });
  
  return {
    birdeye: birdeyeResult,
    coinGecko: coinGeckoResult,
    jupiter: jupiterResult,
    cryptoCompare: cryptoCompareResult,
    helius: heliusResult
  };
}

// Test spécifique pour la récupération de l'historique des prix
async function testHistoricalPrices() {
  log('\n🔍 TEST DE RÉCUPÉRATION DES HISTORIQUES DE PRIX');
  
  // Liste de tokens populaires à tester
  const tokens = [
    { name: 'SOL (wSOL)', address: 'So11111111111111111111111111111111111111112', timestamp: Math.floor(Date.now() / 1000) - 86400 }, // wSOL, 24h ago
    { name: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', timestamp: Math.floor(Date.now() / 1000) - 86400 }, // USDC, 24h ago
    { name: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', timestamp: Math.floor(Date.now() / 1000) - 86400 } // BONK, 24h ago
  ];
  
  const results = {};
  
  for (const token of tokens) {
    log(`\n▶️ Test pour ${token.name} à ${new Date(token.timestamp * 1000).toISOString()}`);
    
    // 1. Essai via Birdeye
    try {
      log(`Testing Birdeye price history for ${token.name}...`);
      const oneDayBefore = token.timestamp * 1000 - 24 * 60 * 60 * 1000;
      const oneDayAfter = token.timestamp * 1000 + 24 * 60 * 60 * 1000;
      
      const priceHistoryResponse = await birdeyeService.getTokenPriceHistory(
        token.address,
        oneDayBefore,
        oneDayAfter,
        '15m'
      );
      
      if (priceHistoryResponse?.data?.length > 0) {
        const prices = priceHistoryResponse.data;
        log(`✅ Birdeye: ${prices.length} points de prix trouvés`);
        
        // Trouver le prix le plus proche
        const timestamp = token.timestamp * 1000;
        let closestPrice = prices[0];
        let minDiff = Math.abs(timestamp - prices[0].unixTime);
        
        for (let i = 1; i < prices.length; i++) {
          const diff = Math.abs(timestamp - prices[i].unixTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestPrice = prices[i];
          }
        }
        
        log(`   Prix le plus proche: ${closestPrice.value} USD à ${new Date(closestPrice.unixTime).toISOString()}`);
        log(`   Différence de temps: ${Math.round(minDiff / 1000 / 60)} minutes`);
        
        results[token.name] = {
          ...results[token.name] || {},
          birdeye: {
            success: true,
            price: closestPrice.value,
            timestamp: closestPrice.unixTime,
            timeDifference: `${Math.round(minDiff / 1000 / 60)} minutes`
          }
        };
      } else {
        log(`❌ Birdeye: Aucun historique de prix trouvé`);
        results[token.name] = {
          ...results[token.name] || {},
          birdeye: { success: false }
        };
      }
    } catch (error) {
      log(`❌ Birdeye Error: ${error.message}`);
      results[token.name] = {
        ...results[token.name] || {},
        birdeye: { success: false, error: error.message }
      };
    }
    
    // 2. Test via CoinGecko
    try {
      log(`Testing CoinGecko price history for ${token.name}...`);
      
      // Récupérer d'abord le coingeckoId via recherche
      const tokenMetadata = await birdeyeService.getTokenMetadata(token.address);
      let coingeckoId = tokenMetadata?.data?.coingeckoId;
      
      if (!coingeckoId && tokenMetadata?.data?.symbol) {
        // Essai de recherche par symbole
        const searchResult = await coinGeckoService.searchToken(tokenMetadata.data.symbol);
        if (searchResult?.coins?.length > 0) {
          const match = searchResult.coins.find(c => 
            c.symbol.toLowerCase() === tokenMetadata.data.symbol.toLowerCase()
          );
          if (match) coingeckoId = match.id;
        }
      }
      
      if (coingeckoId) {
        log(`Found CoinGecko ID: ${coingeckoId}`);
        const cgHistory = await coinGeckoService.getPriceAtTimestamp(
          coingeckoId,
          token.timestamp
        );
        
        if (cgHistory?.market_data?.current_price?.usd) {
          log(`✅ CoinGecko: Prix trouvé: ${cgHistory.market_data.current_price.usd} USD`);
          results[token.name] = {
            ...results[token.name] || {},
            coingecko: {
              success: true,
              price: cgHistory.market_data.current_price.usd,
              coingeckoId
            }
          };
        } else {
          log(`❌ CoinGecko: Pas de données de prix dans la réponse`);
          results[token.name] = {
            ...results[token.name] || {},
            coingecko: { success: false, coingeckoId, error: 'No price data' }
          };
        }
      } else {
        log(`❌ CoinGecko: ID CoinGecko non trouvé`);
        results[token.name] = {
          ...results[token.name] || {},
          coingecko: { success: false, error: 'No CoinGecko ID' }
        };
      }
    } catch (error) {
      log(`❌ CoinGecko Error: ${error.message}`);
      results[token.name] = {
        ...results[token.name] || {},
        coingecko: { success: false, error: error.message }
      };
    }
    
    // 3. Test via CryptoCompare pour les tokens populaires
    if (['SOL (wSOL)', 'USDC', 'BONK'].includes(token.name)) {
      try {
        log(`Testing CryptoCompare price history for ${token.name}...`);
        const symbol = token.name === 'SOL (wSOL)' ? 'SOL' : 
                       token.name === 'USDC' ? 'USDC' : 'BONK';
        
        const ccHistory = await cryptoCompareService.getPriceAtTimestamp(
          symbol,
          token.timestamp
        );
        
        if (ccHistory?.USD) {
          log(`✅ CryptoCompare: Prix trouvé: ${ccHistory.USD} USD`);
          results[token.name] = {
            ...results[token.name] || {},
            cryptocompare: {
              success: true,
              price: ccHistory.USD
            }
          };
        } else {
          log(`❌ CryptoCompare: Pas de données de prix trouvées`);
          results[token.name] = {
            ...results[token.name] || {},
            cryptocompare: { success: false, error: 'No price data' }
          };
        }
      } catch (error) {
        log(`❌ CryptoCompare Error: ${error.message}`);
        results[token.name] = {
          ...results[token.name] || {},
          cryptocompare: { success: false, error: error.message }
        };
      }
    }
    
    // 4. Test Jupiter pour les métadonnées
    try {
      log(`Testing Jupiter metadata for ${token.name}...`);
      const allTokens = await jupiterService.getSupportedTokens();
      
      const jupiterToken = allTokens.find(t => t.address === token.address);
      
      if (jupiterToken) {
        log(`✅ Jupiter: Token trouvé - ${jupiterToken.symbol} (${jupiterToken.name})`);
        results[token.name] = {
          ...results[token.name] || {},
          jupiter: {
            success: true,
            metadata: {
              symbol: jupiterToken.symbol,
              name: jupiterToken.name,
              decimals: jupiterToken.decimals
            }
          }
        };
      } else {
        log(`❌ Jupiter: Token non trouvé`);
        results[token.name] = {
          ...results[token.name] || {},
          jupiter: { success: false, error: 'Token not found' }
        };
      }
    } catch (error) {
      log(`❌ Jupiter Error: ${error.message}`);
      results[token.name] = {
        ...results[token.name] || {},
        jupiter: { success: false, error: error.message }
      };
    }
  }
  
  return results;
}

// Test avec une transaction réelle
async function testTransactionEnrichment() {
  log('\n🔍 TEST D\'ENRICHISSEMENT DE TRANSACTION RÉELLE');
  
  const txSignature = '2VbqguMerW8mawCMCZVbWu5GFYDGyqT19y5bn7bTPqBjuJCnU11iqEVj5pvC7AiV7mErVZkxbaFoXwbNCsmWSqYJ';
  
  try {
    log(`Récupération de la transaction: ${txSignature}`);
    const transaction = await heliusService.getTransaction(txSignature);
    
    if (!transaction) {
      log('❌ Transaction non trouvée');
      return { success: false, error: 'Transaction not found' };
    }
    
    log(`✅ Transaction récupérée, blockTime: ${transaction.blockTime}`);
    
    // Extraction des tokens impliqués
    const tokenMints = new Set();
    const meta = transaction.meta || {};
    
    // Vérification des preTokenBalances
    if (meta.preTokenBalances && Array.isArray(meta.preTokenBalances)) {
      meta.preTokenBalances.forEach(balance => {
        if (balance.mint) {
          tokenMints.add(balance.mint);
          log(`Token trouvé dans preTokenBalances: ${balance.mint}`);
        }
      });
    } else {
      log(`⚠️ Pas de preTokenBalances dans la transaction`);
    }
    
    // Vérification des postTokenBalances
    if (meta.postTokenBalances && Array.isArray(meta.postTokenBalances)) {
      meta.postTokenBalances.forEach(balance => {
        if (balance.mint) {
          tokenMints.add(balance.mint);
          log(`Token trouvé dans postTokenBalances: ${balance.mint}`);
        }
      });
    } else {
      log(`⚠️ Pas de postTokenBalances dans la transaction`);
    }
    
    if (tokenMints.size === 0) {
      log(`❌ Aucun token trouvé dans la transaction`);
      return { success: true, tokenCount: 0, message: 'No tokens in transaction' };
    }
    
    log(`✅ ${tokenMints.size} tokens trouvés dans la transaction`);
    
    // Pour chaque token, essayons de récupérer les données historiques
    for (const mint of tokenMints) {
      log(`\nAnalyse du token: ${mint}`);
      
      // Test des metadonnées via Birdeye
      try {
        const metadata = await birdeyeService.getTokenMetadata(mint);
        if (metadata?.data) {
          log(`✅ Birdeye metadata: ${metadata.data.symbol || 'Unknown'} (${metadata.data.name || 'Unknown Name'})`);
          
          if (metadata.data.coingeckoId) {
            log(`   CoinGecko ID: ${metadata.data.coingeckoId}`);
          } else {
            log(`   ⚠️ Pas de CoinGecko ID`);
          }
        } else {
          log(`❌ Pas de métadonnées Birdeye`);
        }
      } catch (error) {
        log(`❌ Erreur Birdeye metadata: ${error.message}`);
      }
      
      // Essayer l'historique des prix via Birdeye
      try {
        const timestamp = transaction.blockTime * 1000;
        const oneDayBefore = timestamp - 24 * 60 * 60 * 1000;
        const oneDayAfter = timestamp + 24 * 60 * 60 * 1000;
        
        log(`Recherche de prix historiques entre ${new Date(oneDayBefore).toISOString()} et ${new Date(oneDayAfter).toISOString()}`);
        
        const priceHistory = await birdeyeService.getTokenPriceHistory(
          mint,
          oneDayBefore,
          oneDayAfter,
          '15m'
        );
        
        if (priceHistory?.data?.length > 0) {
          log(`✅ Birdeye price history: ${priceHistory.data.length} points trouvés`);
          
          // Trouver le prix le plus proche
          let closestPrice = priceHistory.data[0];
          let minDiff = Math.abs(timestamp - priceHistory.data[0].unixTime);
          
          for (let i = 1; i < priceHistory.data.length; i++) {
            const diff = Math.abs(timestamp - priceHistory.data[i].unixTime);
            if (diff < minDiff) {
              minDiff = diff;
              closestPrice = priceHistory.data[i];
            }
          }
          
          log(`   Prix le plus proche: ${closestPrice.value} USD à ${new Date(closestPrice.unixTime).toISOString()}`);
          log(`   Différence de temps: ${Math.round(minDiff / 1000 / 60)} minutes`);
        } else {
          log(`❌ Pas d'historique de prix Birdeye`);
        }
      } catch (error) {
        log(`❌ Erreur Birdeye price history: ${error.message}`);
      }
      
      log(`--------------------------------------------------`);
    }
    
    return { success: true, tokenCount: tokenMints.size };
  } catch (error) {
    log(`❌ Erreur lors du test de transaction: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Fonction principale
async function runDiagnostics() {
  try {
    log('🚀 DÉMARRAGE DES DIAGNOSTICS');
    
    // Test des APIs
    log('\n========== TEST DES APIS ==========');
    const apiResults = await testAllApis();
    log(`\n📊 Résumé des APIs:`);
    for (const [api, result] of Object.entries(apiResults)) {
      log(`${result.success ? '✅' : '❌'} ${api}: ${result.success ? 'OK' : result.error}`);
    }
    
    // Test des historiques de prix
    log('\n========== TEST DES HISTORIQUES DE PRIX ==========');
    const priceResults = await testHistoricalPrices();
    log(`\n📊 Résumé des tests d'historique de prix:`);
    for (const [token, sources] of Object.entries(priceResults)) {
      log(`\n📌 ${token}:`);
      for (const [source, result] of Object.entries(sources)) {
        log(`${result.success ? '✅' : '❌'} ${source}: ${result.success ? (result.price ? `${result.price} USD` : 'OK') : result.error}`);
      }
    }
    
    // Test d'enrichissement de transaction
    log('\n========== TEST D\'ENRICHISSEMENT DE TRANSACTION ==========');
    const txResult = await testTransactionEnrichment();
    log(`\n📊 Résultat du test de transaction: ${txResult.success ? '✅' : '❌'}`);
    
    // Conclusion
    log('\n========== CONCLUSION ==========');
    const birdeye = apiResults.birdeye.success;
    const coingecko = apiResults.coinGecko.success;
    const jupiter = apiResults.jupiter.success;
    const cryptocompare = apiResults.cryptoCompare.success;
    
    log(`API Birdeye: ${birdeye ? '✅' : '❌'}`);
    log(`API CoinGecko: ${coingecko ? '✅' : '❌'}`);
    log(`API Jupiter: ${jupiter ? '✅' : '❌'}`);
    log(`API CryptoCompare: ${cryptocompare ? '✅' : '❌'}`);
    
    if (!birdeye && !coingecko && !cryptocompare) {
      log(`\n❌ CRITIQUE: Aucune source de prix n'est fonctionnelle, l'historique des prix ne peut pas fonctionner.`);
    } else if (!birdeye) {
      log(`\n⚠️ AVERTISSEMENT: L'API Birdeye ne fonctionne pas, ce qui est la source principale pour l'historique des prix.`);
    }
    
    if (txResult.tokenCount === 0) {
      log(`\n⚠️ AVERTISSEMENT: La transaction de test ne contient aucun token, impossible de tester l'historique des prix.`);
    }
    
    log('\n🏁 DIAGNOSTICS TERMINÉS');
    log(`Les résultats complets sont disponibles dans le fichier ${logFile}`);
    
  } catch (error) {
    log(`❌ ERREUR FATALE: ${error.message}`);
    log(error.stack);
  }
}

// Exécuter les diagnostics
runDiagnostics();