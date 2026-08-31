// middleware/auth.js - Autenticação e Segurança (COM SESSÃO)
const fs = require('fs');
const path = require('path');

// ============================================================
// VARIÁVEIS DE AMBIENTE
// ============================================================
const ADMIN_API_KEY = 'admin123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@getvisa.com.br';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '5521974601812';

console.log('✅ Auth: ADMIN_API_KEY =', ADMIN_API_KEY);

// ============================================================
// VERIFICAR ADMIN COM SESSÃO (para páginas HTML)
// ============================================================
function verificarAdmin(req, res, next) {
    console.log(`🔒 [verificarAdmin] ${req.method} ${req.url}`);
    
    // 1. VERIFICA SE TEM SESSÃO VÁLIDA
    if (req.session && req.session.admin && req.session.admin.authenticated === true) {
        console.log('✅ Admin autenticado via SESSÃO');
        req.admin = req.session.admin;
        return next();
    }
    
    // 2. VERIFICA SE TEM COOKIE VÁLIDO (fallback)
    if (req.cookies && req.cookies.admin_session) {
        try {
            const sessionData = JSON.parse(req.cookies.admin_session);
            if (sessionData.authenticated === true) {
                console.log('✅ Admin autenticado via COOKIE');
                // Recria a sessão a partir do cookie
                req.session = req.session || {};
                req.session.admin = sessionData;
                req.admin = sessionData;
                return next();
            }
        } catch (e) {
            console.log('⚠️ Erro ao parsear cookie:', e.message);
        }
    }
    
    // 3. VERIFICA SE TEM API KEY NA URL (para desenvolvimento)
    const apiKeyFromUrl = req.query.api_key;
    if (apiKeyFromUrl && apiKeyFromUrl === ADMIN_API_KEY) {
        console.log('✅ Admin autenticado via API KEY na URL');
        // Cria sessão a partir da API Key
        req.session = req.session || {};
        req.session.admin = {
            authenticated: true,
            loginAt: new Date().toISOString(),
            via: 'url'
        };
        req.admin = req.session.admin;
        
        // Cria cookie também
        res.cookie('admin_session', JSON.stringify({
            authenticated: true,
            loginAt: new Date().toISOString()
        }), {
            httpOnly: true,
            maxAge: 8 * 60 * 60 * 1000
        });
        
        return next();
    }
    
    // 4. VERIFICA SE TEM API KEY NO HEADER
    const apiKeyFromHeader = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (apiKeyFromHeader && apiKeyFromHeader === ADMIN_API_KEY) {
        console.log('✅ Admin autenticado via API KEY no HEADER');
        // Cria sessão a partir da API Key
        req.session = req.session || {};
        req.session.admin = {
            authenticated: true,
            loginAt: new Date().toISOString(),
            via: 'header'
        };
        req.admin = req.session.admin;
        
        // Cria cookie também
        res.cookie('admin_session', JSON.stringify({
            authenticated: true,
            loginAt: new Date().toISOString()
        }), {
            httpOnly: true,
            maxAge: 8 * 60 * 60 * 1000
        });
        
        return next();
    }
    
    // 5. NÃO AUTENTICADO - REDIRECIONA PARA LOGIN
    console.log(`❌ Admin NÃO autenticado. Redirecionando para login.`);
    console.log(`   URL: ${req.url}`);
    console.log(`   Session: ${req.session ? 'EXISTE' : 'NÃO EXISTE'}`);
    console.log(`   Cookies: ${req.cookies ? 'EXISTEM' : 'NÃO EXISTEM'}`);
    
    // Se for requisição AJAX/API, retorna 401
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({
            success: false,
            message: 'Sessão expirada. Faça login novamente.',
            redirect: '/admin-login.html'
        });
    }
    
    // Para páginas HTML, redireciona
    res.redirect('/admin-login.html');
}

// ============================================================
// VERIFICAR API KEY (para APIs REST)
// ============================================================
function verificarApiKey(req, res, next) {
    console.log(`🔑 [verificarApiKey] ${req.method} ${req.url}`);
    
    // 1. VERIFICA SESSÃO
    if (req.session && req.session.admin && req.session.admin.authenticated === true) {
        console.log('✅ API autorizada via SESSÃO');
        return next();
    }
    
    // 2. VERIFICA API KEY
    const apiKey = req.headers['x-api-key'] || 
                   req.headers['authorization']?.replace('Bearer ', '') ||
                   req.query.api_key || 
                   req.body.api_key;
    
    console.log(`🔑 API Key recebida: ${apiKey ? '***' : 'NENHUMA'}`);
    
    if (!apiKey) {
        console.log(`⚠️ API Key não fornecida`);
        return res.status(401).json({
            success: false,
            message: 'API Key é obrigatória'
        });
    }
    
    if (apiKey !== ADMIN_API_KEY) {
        console.log(`⚠️ API Key inválida`);
        return res.status(403).json({
            success: false,
            message: 'API Key inválida'
        });
    }
    
    console.log(`✅ API Key válida`);
    
    // Cria sessão para futuras requisições
    req.session = req.session || {};
    req.session.admin = {
        authenticated: true,
        loginAt: new Date().toISOString(),
        via: 'api_key'
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

// ============================================================
// MIDDLEWARE PARA VERIFICAR SESSÃO E RENOVAR
// ============================================================
function renovarSessao(req, res, next) {
    if (req.session && req.session.admin && req.session.admin.authenticated) {
        // Renova o tempo da sessão
        req.session.admin.lastActivity = new Date().toISOString();
        req.session.touch();
    }
    next();
}

module.exports = {
    verificarApiKey,
    verificarAdmin,
    logAcesso,
    renovarSessao,
    ADMIN_API_KEY,
    ADMIN_EMAIL,
    ADMIN_PHONE
};