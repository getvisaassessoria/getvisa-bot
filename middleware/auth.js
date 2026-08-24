// middleware/auth.js - Autenticação e Segurança
const fs = require('fs');
const path = require('path');

// ============================================================
// VARIÁVEIS DE AMBIENTE
// ============================================================
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@getvisa.com.br';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '5521974601812';

console.log('✅ Auth: ADMIN_API_KEY configurada:', ADMIN_API_KEY ? '✅ Sim' : '❌ Não');
console.log('✅ Auth: ADMIN_EMAIL configurado:', ADMIN_EMAIL || '❌ Não');
console.log('✅ Auth: ADMIN_PHONE configurado:', ADMIN_PHONE || '❌ Não');

// ============================================================
// VERIFICAR API KEY
// ============================================================
function verificarApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || 
                   req.headers['authorization']?.replace('Bearer ', '') ||
                   req.query.api_key || 
                   req.body.api_key;
    
    if (!apiKey) {
        console.log(`⚠️ Acesso negado: API Key não fornecida - ${req.method} ${req.url}`);
        return res.status(401).json({
            success: false,
            message: 'API Key é obrigatória',
            error: 'Unauthorized'
        });
    }
    
    if (apiKey !== ADMIN_API_KEY) {
        console.log(`⚠️ Acesso negado: API Key inválida - ${req.method} ${req.url}`);
        return res.status(403).json({
            success: false,
            message: 'API Key inválida',
            error: 'Forbidden'
        });
    }
    
    console.log(`✅ Acesso autorizado: ${req.method} ${req.url}`);
    next();
}

// ============================================================
// VERIFICAR ADMIN (para páginas HTML)
// ============================================================
function verificarAdmin(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey || apiKey !== ADMIN_API_KEY) {
        console.log(`⚠️ Redirecionando para login: ${req.url}`);
        return res.redirect('/admin-login.html');
    }
    
    req.admin = {
        email: ADMIN_EMAIL,
        phone: ADMIN_PHONE,
        authenticated: true
    };
    
    next();
}

// ============================================================
// LOG DE ACESSO
// ============================================================
function logAcesso(req, res, next) {
    const start = Date.now();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`📊 ${ip} - ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
    });
    
    next();
}

module.exports = {
    verificarApiKey,
    verificarAdmin,
    logAcesso,
    ADMIN_API_KEY,
    ADMIN_EMAIL,
    ADMIN_PHONE
};