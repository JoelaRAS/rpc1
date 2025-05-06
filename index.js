require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const rfs = require('rotating-file-stream');
const net = require('net');
const ResponseUtils = require('./utils/responseUtils');
const cacheService = require('./services/cacheService');

// Ajout d'une journalisation améliorée pour déboguer les erreurs de déploiement Vercel
process.on('uncaughtException', (err) => {
  console.error('ERREUR NON CAPTURÉE:', err.message);
  console.error(err.stack);
  try {
    fs.appendFileSync('error.log', `${new Date().toISOString()} - UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}\n\n`);
  } catch (logErr) {
    console.error('Impossible d\'écrire dans le fichier log:', logErr);
  }
});

// Import des routes
const portfolioRoutes = require('./routes/portfolioRoutes');
const tokenRoutes = require('./routes/tokenRoutes');
const transactionRoutes = require('./routes/transactionRoutes');

const app = express();
// Changer le port par défaut à 3002, mais prévoir un système pour trouver un port disponible
const DEFAULT_PORT = process.env.NODE_ENV === 'production' ? (process.env.PORT || 3000) : 3002;

// Fonction pour vérifier si un port est disponible
const isPortAvailable = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
};

// Fonction pour trouver un port disponible
const findAvailablePort = async (startPort) => {
  let port = startPort;
  while (!(await isPortAvailable(port)) && port < startPort + 100) {
    port++;
  }
  return port;
};

// Middleware de journalisation
const logDirectory = path.join(__dirname, 'logs');
// S'assurer que le répertoire de logs existe
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

// Création d'un flux de journal rotatif
const accessLogStream = rfs.createStream('server.log', {
  interval: '1d', // rotation quotidienne
  path: logDirectory
});

// Configuration des middleware
app.use(morgan('combined', { stream: accessLogStream })); // journalisation dans un fichier
app.use(morgan('dev')); // journalisation dans la console
app.use(express.json({ limit: '50mb' })); // support json
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // support formulaires urlencoded

// Middleware de compression pour réduire la taille des réponses
app.use(compression({
  level: 6, // niveau de compression (1-9), 6 est un bon équilibre
  threshold: 1024, // seulement compresser les réponses > 1kb
  filter: (req, res) => {
    // Ne pas compresser les réponses pour les clients qui ne supportent pas la compression
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Utiliser la compression par défaut pour toutes les autres requêtes
    return compression.filter(req, res);
  }
}));

// Middleware
app.use(cors({
  origin: '*', // Permissif pour développement, à restreindre en production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// Middleware pour le logging de toutes les requêtes
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Middleware pour suivre les temps de réponse
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) { // Enregistrer les requêtes lentes (> 1s)
      console.warn(`Requête lente: ${req.method} ${req.originalUrl} - ${duration}ms`);
    }
  });
  next();
});

// Routes
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/transaction', transactionRoutes);

// Route de diagnostique
app.get('/api/diagnostics', (req, res) => {
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Route de santé pour les vérifications de surveillance
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route par défaut
app.get('/', (req, res) => {
  res.json(ResponseUtils.success({ message: 'Bienvenue sur l\'API RPC du projet 2Profiler' }));
});

// Gestion des routes non trouvées
app.use(ResponseUtils.notFoundHandler());

// Middleware de gestion d'erreurs global
app.use((err, req, res, next) => {
  console.error('Erreur API:', err.message);
  try {
    fs.appendFileSync('error.log', `${new Date().toISOString()} - API ERROR: ${req.method} ${req.url} - ${err.message}\n${err.stack}\n\n`);
  } catch (logErr) {
    console.error('Impossible d\'écrire dans le fichier log:', logErr);
  }

  res.status(500).json({
    success: false,
    message: 'Une erreur est survenue sur le serveur',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
    statusCode: 500,
    timestamp: new Date().toISOString()
  });
});

// Démarrage du serveur avec recherche de port disponible
(async () => {
  try {
    const PORT = await findAvailablePort(DEFAULT_PORT);
    app.listen(PORT, async () => {
      console.log(`Serveur RPC démarré sur le port ${PORT}`);
      fs.appendFileSync('server.log', `${new Date().toISOString()} - Serveur démarré sur le port ${PORT}\n`);
      
      // Initialiser le cache au démarrage
      try {
        await cacheService.initializeAllCaches();
        console.log('Cache initialisé avec succès');
      } catch (error) {
        console.error('Erreur lors de l\'initialisation du cache:', error);
      }
    });
  } catch (error) {
    console.error('Erreur lors du démarrage du serveur:', error);
    fs.appendFileSync('error.log', `${new Date().toISOString()} - SERVER START ERROR: ${error.message}\n${error.stack}\n\n`);
    process.exit(1);
  }
})();