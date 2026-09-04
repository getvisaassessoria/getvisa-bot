/bin/bash
# pesquisa_dashboard.sh - Pesquisa completa sobre dashboard

echo "============================================"
echo "🔍 PESQUISA COMPLETA: DASHBOARD"
echo "============================================"

# 1. ROTAS NO SERVER.JS
echo ""
echo "📌 1. ROTAS /dashboard NO SERVER.JS:"
echo "----------------------------------------"
grep -n "app.get.*dashboard" server.js

# 2. ARQUIVOS HTML NA PASTA PUBLIC
echo ""
echo "📌 2. ARQUIVOS DASHBOARD NA PASTA PUBLIC:"
echo "----------------------------------------"
ls -la public/*dashboard*.html 2>/dev/null || echo "Nenhum arquivo dashboard encontrado"

# 3. ARQUIVOS HTML QUE CONTÊM "dashboard" NO NOME
echo ""
echo "📌 3. TODOS OS ARQUIVOS COM 'dashboard' NO NOME:"
echo "----------------------------------------"
find . -name "*dashboard*" -type f 2>/dev/null | grep -v node_modules

# 4. ARQUIVOS QUE CONTÊM "dashboard" NO CONTEÚDO
echo ""
echo "📌 4. ARQUIVOS QUE CONTÊM A PALAVRA 'dashboard':"
echo "----------------------------------------"
grep -rn "dashboard" --include="*.html" --include="*.js" --include="*.css" . 2>/dev/null | grep -v node_modules | head -30

# 5. LINKS NOS ARQUIVOS HTML
echo ""
echo "📌 5. LINKS PARA DASHBOARD NOS ARQUIVOS HTML:"
echo "----------------------------------------"
grep -rn "href.*dashboard" --include="*.html" public/ 2>/dev/null | head -20

# 6. REDIRECIONAMENTOS NO SERVER.JS
echo ""
echo "📌 6. REDIRECIONAMENTOS PARA DASHBOARD:"
echo "----------------------------------------"
grep -n "redirect.*dashboard" server.js

# 7. ARQUIVO DE CONFIGURAÇÃO DO DASHBOARD (se existir)
echo ""
echo "📌 7. ARQUIVO DE CONFIGURAÇÃO (se existir):"
echo "----------------------------------------"
ls -la public/js/dashboard*.js 2>/dev/null || echo "Nenhum arquivo JS de dashboard encontrado"

echo ""
echo "============================================"
echo "✅ PESQUISA CONCLUÍDA!"
echo "============================================"

