require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const ResponseUtils = require('./utils/responseUtils');

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
// Forcer l'utilisation du port 3001 en local pour éviter les conflits
const PORT = process.env.NODE_ENV === 'production' ? (process.env.PORT || 3000) : 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Middleware pour le logging de toutes les requêtes
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
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

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`Serveur RPC démarré sur le port ${PORT}`);
  fs.appendFileSync('server.log', `${new Date().toISOString()} - Serveur démarré sur le port ${PORT}\n`);
});