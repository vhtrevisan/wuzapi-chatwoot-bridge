const express = require('express');
const path = require('path');
const { initDatabase, closeDatabase } = require('./database/sqlite');

const app = express();

// ========================================
// CONFIGURAÇÃO DE LOGS INICIAIS
// ========================================
console.log('🚀 Iniciando WuzAPI × Chatwoot Bridge...');
console.log('📅 Data/Hora:', new Date().toISOString());
console.log('🖥️ Node.js:', process.version);
console.log('🔧 Ambiente:', process.env.NODE_ENV || 'development');

// ========================================
// VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE
// ========================================
const PUBLIC_URL = process.env.PUBLIC_URL;
if (!PUBLIC_URL) {
    console.warn('⚠️ AVISO: Variável PUBLIC_URL não configurada. URLs de webhook usarão host da requisição.');
} else {
    console.log('🔗 Public URL:', PUBLIC_URL);
}

// ========================================
// MIDDLEWARES
// ========================================
// CRÍTICO: Aumenta limite do body-parser para aceitar payloads grandes do WuzAPI
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

console.log('✅ Body parser configurado (limite: 100mb)');

// Middleware de log de requisições (apenas em desenvolvimento)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`📨 ${req.method} ${req.path}`);
        next();
    });
}

// ========================================
// ARQUIVOS ESTÁTICOS
// ========================================
app.use(express.static(path.join(__dirname, 'public')));
console.log('📂 Servindo arquivos estáticos de:', path.join(__dirname, 'public'));

// ========================================
// ROTAS
// ========================================
app.use('/webhook', require('./routes/webhook'));
app.use('/admin', require('./routes/admin'));
app.use('/chatwoot', require('./routes/chatwoot'));

console.log('✅ Rotas registradas:');
console.log('   - /webhook/:instanceName (POST)');
console.log('   - /admin/integrations (GET, POST, PUT, DELETE)');
console.log('   - /chatwoot/events (POST)');

// ========================================
// ROTA RAIZ
// ========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================================
// HEALTH CHECK MELHORADO
// ========================================
app.get('/health', async (req, res) => {
    const uptime = process.uptime();
    const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
    
    const healthData = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: uptimeFormatted,
        uptime_seconds: Math.floor(uptime),
        memory: {
            used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024)
        },
        node_version: process.version,
        environment: process.env.NODE_ENV || 'development'
    };
    
    // Tenta buscar número de integrações
    try {
        const { getAllIntegrations } = require('./database/sqlite');
        const integrations = await getAllIntegrations();
        healthData.integrations_count = integrations.length;
        healthData.integrations_enabled = integrations.filter(i => i.enabled).length;
    } catch (error) {
        healthData.database_error = error.message;
        healthData.status = 'degraded';
    }
    
    const statusCode = healthData.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthData);
});

// ========================================
// ROTA 404
// ========================================
app.use((req, res) => {
    console.log(`⚠️ Rota não encontrada: ${req.method} ${req.path}`);
    res.status(404).json({ 
        error: 'Rota não encontrada',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

// ========================================
// HANDLER DE ERROS GLOBAL
// ========================================
app.use((error, req, res, next) => {
    console.error('❌ Erro não tratado:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

// ========================================
// GRACEFUL SHUTDOWN
// ========================================
function gracefulShutdown(signal) {
    console.log(`\n⚠️ Recebido sinal ${signal}, encerrando servidor...`);
    
    // Fecha servidor HTTP
    server.close(() => {
        console.log('✅ Servidor HTTP fechado');
        
        // Fecha banco de dados
        closeDatabase();
        
        console.log('👋 Encerramento concluído');
        process.exit(0);
    });
    
    // Força encerramento após 10 segundos
    setTimeout(() => {
        console.error('⚠️ Encerramento forçado após timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
    console.error('❌ Exceção não capturada:', error.message);
    console.error('Stack:', error.stack);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejection não tratada:', reason);
    console.error('Promise:', promise);
});

// ========================================
// INICIALIZAÇÃO DO SERVIDOR
// ========================================
const PORT = process.env.PORT || 80;
let server;

initDatabase()
    .then(() => {
        server = app.listen(PORT, '0.0.0.0', () => {
            console.log('\n' + '='.repeat(60));
            console.log('🎉 SERVIDOR INICIADO COM SUCESSO!');
            console.log('='.repeat(60));
            console.log(`🚀 Porta: ${PORT}`);
            console.log(`📊 Interface admin: http://localhost:${PORT}`);
            console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook/:instanceName`);
            console.log(`🔗 Chatwoot events: http://localhost:${PORT}/chatwoot/events`);
            console.log(`💚 Health check: http://localhost:${PORT}/health`);
            console.log('='.repeat(60) + '\n');
            console.log('✅ Sistema pronto para receber requisições!');
            console.log('📝 Monitore os logs abaixo para acompanhar as operações...\n');
        });
        
        // Configurações do servidor
        server.setTimeout(120000); // Timeout de 2 minutos
        server.keepAliveTimeout = 65000; // Keep-alive de 65 segundos
        
        console.log('⚙️ Configurações do servidor:');
        console.log(`   - Timeout: ${server.setTimeout / 1000}s`);
        console.log(`   - Keep-Alive: ${server.keepAliveTimeout / 1000}s`);
    })
    .catch(error => {
        console.error('\n' + '='.repeat(60));
        console.error('❌ ERRO CRÍTICO AO INICIALIZAR SERVIDOR');
        console.error('='.repeat(60));
        console.error('Erro:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(60) + '\n');
        process.exit(1);
    });
