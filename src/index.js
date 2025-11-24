const express = require('express');
const path = require('path');
const { initDatabase } = require('./database/sqlite');

const app = express();

// CRÍTICO: Aumenta limite do body-parser para aceitar payloads grandes do WuzAPI
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve arquivos estáticos (interface web)
app.use(express.static(path.join(__dirname, 'public')));

// Rotas
app.use('/webhook', require('./routes/webhook'));
app.use('/admin', require('./routes/admin'));
app.use('/chatwoot', require('./routes/chatwoot'));  // ← NOVA ROTA!

// Rota raiz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Inicializa banco de dados e servidor
const PORT = process.env.PORT || 80;

initDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Servidor rodando na porta ${PORT}`);
        console.log(`📊 Interface admin: http://localhost:${PORT}`);
        console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
        console.log(`🔗 Chatwoot events: http://localhost:${PORT}/chatwoot/events`);
    });
}).catch(error => {
    console.error('❌ Erro ao inicializar banco de dados:', error);
    process.exit(1);
});
