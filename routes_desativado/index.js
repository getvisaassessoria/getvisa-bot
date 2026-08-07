cat > routes/index.js << 'EOF'
// routes/index.js
const express = require('express');
const router = express.Router();

// Importa as rotas - USANDO O NOVO ARQUIVO
const webhookRoutes = require('./webhookRoutesNew');
const ds160Routes = require('./ds160Routes');

// Usa as rotas
router.use('/api', webhookRoutes);
router.use('/api', ds160Routes);

module.exports = router;
EOF