require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ResponseUtils = require('./utils/responseUtils');

// Import des routes
const portfolioRoutes = require('./routes/portfolioRoutes');
const tokenRoutes = require('./routes/tokenRoutes');
const transactionRoutes = require('./routes/transactionRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/transaction', transactionRoutes);

// Route par défaut
app.get('/', (req, res) => {
  res.json(ResponseUtils.success({ message: 'Bienvenue sur l\'API RPC du projet 2Profiler' }));
});

// Gestion des routes non trouvées
app.use(ResponseUtils.notFoundHandler());

// Gestion des erreurs
app.use(ResponseUtils.errorHandler());

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`Serveur RPC démarré sur le port ${PORT}`);
});