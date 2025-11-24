const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/config.db');

// Garante que o diretório existe
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Inicializa banco de dados
function initDatabase() {
    return new Promise((resolve, reject) => {
        try {
            db.exec(`
                CREATE TABLE IF NOT EXISTS integrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    instance_name TEXT UNIQUE NOT NULL,
                    wuzapi_url TEXT NOT NULL,
                    wuzapi_token TEXT NOT NULL,
                    chatwoot_url TEXT NOT NULL,
                    chatwoot_account_id INTEGER NOT NULL,
                    chatwoot_api_token TEXT NOT NULL,
                    chatwoot_inbox_id INTEGER,
                    enabled BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            console.log('✅ Banco de dados SQLite conectado');
            resolve();
        } catch (error) {
            console.error('❌ Erro ao inicializar banco de dados:', error);
            reject(error);
        }
    });
}

// Busca todas as integrações
function getAllIntegrations() {
    const stmt = db.prepare('SELECT * FROM integrations ORDER BY created_at DESC');
    return stmt.all();
}

// Busca integração por nome da instância
function getIntegrationByInstance(instanceName) {
    const stmt = db.prepare('SELECT * FROM integrations WHERE instance_name = ? AND enabled = 1');
    return stmt.get(instanceName);
}

// Cria nova integração
function createIntegration(data) {
    const stmt = db.prepare(`
        INSERT INTO integrations (
            instance_name, wuzapi_url, wuzapi_token, 
            chatwoot_url, chatwoot_account_id, chatwoot_api_token, 
            chatwoot_inbox_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
        data.instance_name,
        data.wuzapi_url,
        data.wuzapi_token,
        data.chatwoot_url,
        data.chatwoot_account_id,
        data.chatwoot_api_token,
        data.chatwoot_inbox_id || null
    );
    
    return { id: result.lastInsertRowid };
}

// Atualiza integração
function updateIntegration(id, data) {
    const fields = [];
    const values = [];
    
    if (data.wuzapi_url) {
        fields.push('wuzapi_url = ?');
        values.push(data.wuzapi_url);
    }
    if (data.wuzapi_token) {
        fields.push('wuzapi_token = ?');
        values.push(data.wuzapi_token);
    }
    if (data.chatwoot_url) {
        fields.push('chatwoot_url = ?');
        values.push(data.chatwoot_url);
    }
    if (data.chatwoot_account_id) {
        fields.push('chatwoot_account_id = ?');
        values.push(data.chatwoot_account_id);
    }
    if (data.chatwoot_api_token) {
        fields.push('chatwoot_api_token = ?');
        values.push(data.chatwoot_api_token);
    }
    if (data.chatwoot_inbox_id) {
        fields.push('chatwoot_inbox_id = ?');
        values.push(data.chatwoot_inbox_id);
    }
    if (typeof data.enabled !== 'undefined') {
        fields.push('enabled = ?');
        values.push(data.enabled ? 1 : 0);
    }
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const stmt = db.prepare(`UPDATE integrations SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
}

// Deleta integração
function deleteIntegration(id) {
    const stmt = db.prepare('DELETE FROM integrations WHERE id = ?');
    return stmt.run(id);
}

module.exports = {
    db,
    initDatabase,
    getAllIntegrations,
    getIntegrationByInstance,
    createIntegration,
    updateIntegration,
    deleteIntegration
};
