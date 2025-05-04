const express = require('express');
const router = express.Router();

const alchemyService = require('../services/alchemyService');
const birdeyeService = require('../services/birdeyeService');
const coinGeckoService = require('../services/coinGeckoService');
const cryptoCompareService = require('../services/cryptoCompareService');
const jupiterService = require('../services/jupiterService');
const heliusService = require('../services/heliusService');
const responseUtils = require('../utils/responseUtils');

/**
 * @route GET /api/token/info/:tokenAddress
 * @description Récupère les informations complètes d'un token
 * @access Public
 */
router.get('/info/:tokenAddress', async (req, res, next) => {
  try {
    const { tokenAddress } = req.params;
    
    // Récupération des métadonnées du token via différentes APIs
    const [alchemyData, birdeyeData] = await Promise.all([
      alchemyService.getTokenMetadata(tokenAddress).catch(() => null),
      birdeyeService.getTokenMetadata(tokenAddress).catch(() => null)
    ]);
    
    // Fusion des données des différentes sources
    const tokenInfo = {
      address: tokenAddress,
      metadata: {
        ...alchemyData,
        ...birdeyeData?.data
      }
    };
    
    res.json({
      success: true,
      tokenInfo
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/token/price/:tokenAddress
 * @description Récupère le prix actuel d'un token
 * @access Public
 */
router.get('/price/:tokenAddress', async (req, res, next) => {
  try {
    const { tokenAddress } = req.params;
    
    // Récupération du prix via Birdeye
    const priceData = await birdeyeService.getTokenPrice(tokenAddress);
    
    res.json({
      success: true,
      priceData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/token/price-history/:tokenAddress
 * @description Récupère l'historique des prix d'un token
 * @access Public
 */
router.get('/price-history/:tokenAddress', async (req, res, next) => {
  try {
    const { tokenAddress } = req.params;
    const { days = 30, resolution = '1D' } = req.query;
    
    // Calcul des timestamps
    const endTimestamp = Date.now();
    const startTimestamp = endTimestamp - (parseInt(days) * 24 * 60 * 60 * 1000);
    
    // Récupération de l'historique des prix via Birdeye
    const priceHistory = await birdeyeService.getTokenPriceHistory(
      tokenAddress,
      startTimestamp,
      endTimestamp,
      resolution
    );
    
    res.json({
      success: true,
      priceHistory: priceHistory.data || [],
      timeframe: {
        startDate: new Date(startTimestamp).toISOString(),
        endDate: new Date(endTimestamp).toISOString(),
        resolution
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/token/market-data/:symbol
 * @description Récupère des données de marché plus larges pour un token via CryptoCompare
 * @access Public
 */
router.get('/market-data/:symbol', async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { currency = 'USD' } = req.query;
    
    // Récupération du prix et des données OHLCV via CryptoCompare
    const [priceData, historyData] = await Promise.all([
      cryptoCompareService.getPrice(symbol, currency),
      cryptoCompareService.getHistoricalPrice(symbol, currency, 30)
    ]);
    
    res.json({
      success: true,
      marketData: {
        currentPrice: priceData,
        historicalData: historyData
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/token/compare
 * @description Compare plusieurs tokens entre eux
 * @access Public
 */
router.get('/compare', async (req, res, next) => {
  try {
    const { tokens, days = 30 } = req.query;
    
    if (!tokens) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre tokens est requis'
      });
    }
    
    const tokenAddresses = tokens.split(',');
    
    // Calcul des timestamps
    const endTimestamp = Date.now();
    const startTimestamp = endTimestamp - (parseInt(days) * 24 * 60 * 60 * 1000);
    
    // Récupération des prix actuels
    const currentPrices = await birdeyeService.getMultipleTokenStats(tokenAddresses);
    
    // Récupération des historiques de prix pour chaque token
    const historyPromises = tokenAddresses.map(address => 
      birdeyeService.getTokenPriceHistory(
        address,
        startTimestamp,
        endTimestamp,
        days <= 7 ? '1H' : '1D'
      ).catch(() => ({ data: [] }))
    );
    
    const historyResults = await Promise.all(historyPromises);
    
    // Construction de la comparaison
    const comparison = tokenAddresses.map((address, index) => ({
      tokenAddress: address,
      currentPrice: currentPrices[address] || null,
      priceHistory: historyResults[index].data || []
    }));
    
    res.json({
      success: true,
      comparison,
      timeframe: {
        startDate: new Date(startTimestamp).toISOString(),
        endDate: new Date(endTimestamp).toISOString(),
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/token/liquidity/:tokenAddress
 * @description Récupère les informations de liquidité pour un token
 * @access Public
 */
router.get('/liquidity/:tokenAddress', async (req, res, next) => {
  try {
    const { tokenAddress } = req.params;
    
    // Récupération des statistiques de liquidité via Birdeye
    const liquidityData = await birdeyeService.getTokenLiquidityStats(tokenAddress);
    
    res.json({
      success: true,
      liquidityData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/token/quote
 * @description Récupère une cotation pour un échange de token via Jupiter
 * @access Public
 */
router.get('/quote', async (req, res, next) => {
  try {
    const { inputMint, outputMint, amount, slippageBps = 50, onlyDirectRoutes = false } = req.query;
    
    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Les paramètres inputMint, outputMint et amount sont requis'
      });
    }
    
    // Options pour la cotation
    const options = {
      slippageBps: parseInt(slippageBps),
      onlyDirectRoutes: onlyDirectRoutes === 'true'
    };
    
    // Récupération de la cotation via Jupiter
    const quoteData = await jupiterService.getQuote(
      inputMint,
      outputMint,
      amount,
      options
    );
    
    res.json({
      success: true,
      quoteData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/token/trending
 * @description Récupère les tokens tendance du moment
 * @access Public
 */
router.get('/trending', async (req, res, next) => {
  try {
    // Récupération des tokens tendance via CoinGecko
    const trendingData = await coinGeckoService.getTrending();
    
    res.json({
      success: true,
      trendingData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/token/staking-opportunities/:symbol
 * @description Récupère les opportunités de staking pour un token donné
 * @access Public
 */
router.get('/staking-opportunities/:symbol', async (req, res, next) => {
  try {
    const { symbol } = req.params;
    
    // Définition de quelques opportunités de staking statiques pour SOL
    // Dans une implémentation réelle, ces données viendraient d'un service externe
    let stakingOpportunities = [];
    
    if (symbol.toUpperCase() === 'SOL') {
      stakingOpportunities = [
        {
          provider: 'Lido',
          apy: 6.5,
          tvl: 948500000,
          minStake: 0.01,
          lockPeriod: 0,
          tokenReceived: 'stSOL',
          website: 'https://solana.lido.fi/',
          description: 'Liquid staking solution for Solana'
        },
        {
          provider: 'Marinade',
          apy: 6.1,
          tvl: 726100000,
          minStake: 0.01,
          lockPeriod: 0,
          tokenReceived: 'mSOL',
          website: 'https://marinade.finance/',
          description: 'Liquid staking protocol on Solana'
        },
        {
          provider: 'Socean',
          apy: 5.9,
          tvl: 134500000,
          minStake: 0.1,
          lockPeriod: 0,
          tokenReceived: 'scnSOL',
          website: 'https://socean.fi/',
          description: 'Staking pool on Solana with auto-compounding'
        },
        {
          provider: 'Jito',
          apy: 7.1,
          tvl: 687300000,
          minStake: 0.01,
          lockPeriod: 0,
          tokenReceived: 'jitoSOL',
          website: 'https://jito.network/',
          description: 'MEV-enhanced liquid staking for Solana'
        }
      ];
    } else if (symbol.toUpperCase() === 'ETH' || symbol.toUpperCase() === 'ETHEREUM') {
      stakingOpportunities = [
        {
          provider: 'Lido',
          apy: 3.7,
          tvl: 21500000000,
          minStake: 0.0001,
          lockPeriod: 0,
          tokenReceived: 'stETH',
          website: 'https://lido.fi/',
          description: 'Liquid staking solution for Ethereum'
        },
        {
          provider: 'Rocket Pool',
          apy: 3.9,
          tvl: 3200000000,
          minStake: 0.01,
          lockPeriod: 0,
          tokenReceived: 'rETH',
          website: 'https://rocketpool.net/',
          description: 'Decentralized Ethereum staking protocol'
        }
      ];
    }
    
    res.json({
      success: true,
      stakingOpportunities,
      symbol: symbol.toUpperCase()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/token/staking-opportunities/:tokenAddress
 * @desc Récupère les opportunités de staking pour un token spécifique
 * @param {string} tokenAddress - Adresse du token
 * @access Public
 */
router.get('/staking-opportunities/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    
    // Définir les opportunités de staking pour SOL (pour les tests)
    if (tokenAddress.toLowerCase() === 'sol' || tokenAddress === 'So11111111111111111111111111111111111111112') {
      return responseUtils.successResponse(res, {
        opportunities: [
          {
            provider: "Lido",
            tokenName: "Lido Staked SOL",
            tokenSymbol: "stSOL",
            apy: 5.8,
            minStake: 0.01,
            lockupPeriod: "Aucun", // Pas de période de blocage
            url: "https://solana.lido.fi/"
          },
          {
            provider: "Marinade Finance",
            tokenName: "Marinade Staked SOL",
            tokenSymbol: "mSOL",
            apy: 6.2,
            minStake: 0.01,
            lockupPeriod: "Aucun",
            url: "https://marinade.finance/"
          },
          {
            provider: "Jito",
            tokenName: "Jito Staked SOL",
            tokenSymbol: "jitoSOL",
            apy: 6.5,
            minStake: 0.01,
            lockupPeriod: "Aucun",
            url: "https://www.jito.network/"
          },
          {
            provider: "SolBlaze",
            tokenName: "SolBlaze Staked SOL",
            tokenSymbol: "bSOL",
            apy: 6.0,
            minStake: 0.1,
            lockupPeriod: "Aucun",
            url: "https://solblaze.org/"
          }
        ],
        network: "Solana",
        tokenAddress: tokenAddress,
        totalValueLocked: {
          Lido: 1450000000, // 1.45 milliards USD
          Marinade: 780000000, // 780 millions USD
          Jito: 420000000, // 420 millions USD
          SolBlaze: 85000000 // 85 millions USD
        }
      });
    } else if (tokenAddress === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
      // Pour USDC
      return responseUtils.successResponse(res, {
        opportunities: [
          {
            provider: "Solend",
            tokenName: "USDC Supply",
            tokenSymbol: "USDC",
            apy: 3.2,
            minStake: 1,
            lockupPeriod: "Variable",
            url: "https://solend.fi/"
          },
          {
            provider: "UXD Protocol",
            tokenName: "UXD Stablecoin",
            tokenSymbol: "UXD",
            apy: 8.5,
            minStake: 10,
            lockupPeriod: "7 jours",
            url: "https://uxd.fi/"
          }
        ],
        network: "Solana",
        tokenAddress: tokenAddress,
        totalValueLocked: {
          Solend: 250000000, // 250 millions USD
          UXD: 45000000 // 45 millions USD
        }
      });
    } else {
      // Pour les autres tokens, retourner un message générique
      return responseUtils.successResponse(res, {
        opportunities: [],
        message: "Pas d'opportunités de staking disponibles pour ce token actuellement.",
        network: "Solana",
        tokenAddress: tokenAddress,
        totalValueLocked: {}
      });
    }
    
  } catch (error) {
    console.error('Erreur lors de la récupération des opportunités de staking:', error);
    return responseUtils.errorResponse(res, 'Erreur lors de la récupération des opportunités de staking', error, 500);
  }
});

module.exports = router;