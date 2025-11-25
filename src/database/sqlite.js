const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/config.db');

// Garante que o diretório existe
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    console.log(`📁 Criando diretório de dados: ${dbDir}`);
    fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`💾 Caminho do banco de dados: ${DB_PATH}`);

let db;

try {
    db = new Database(DB_PATH);
    
    // CONFIGURAÇÕES DE PERFORMANCE E SEGURANÇA
    db.pragma('journal_mode = WAL'); // Write-Ahead Logging para melhor concorrência
    db.pragma('synchronous = NORMAL'); // Balance entre segurança e performance
    db.pragma('foreign_keys = ON'); // Habilita foreign keys
    
    console.log('✅ Conexão com banco de dados estabelecida');
} catch (error) {
    console.error('❌ Erro ao conectar ao banco de dados:', error.message);
    process.exit(1);
}

// Inicializa banco de dados
function initDatabase() {
    return new Promise((resolve, reject) => {
        try {
            // Cria tabela de integrações
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
            
            // Cria índices para performance
            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_instance_name ON integrations(instance_name);
                CREATE INDEX IF NOT EXISTS idx_enabled ON integrations(enabled);
                CREATE INDEX IF NOT EXISTS idx_inbox_id ON integrations(chatwoot_inbox_id);
            `);
            
            console.log('✅ Banco de dados SQLite conectado');
            console.log('📊 Tabelas e índices verificados');
            
            // Exibe estatísticas
            const count = db.prepare('SELECT COUNT(*) as total FROM integrations').get();
            console.log(`📋 Total de integrações cadastradas: ${count.total}`);
            
            resolve();
        } catch (error) {
            console.error('❌ Erro ao inicializar banco de dados:', error.message);
            reject(error);
        }
    });
}

// Busca todas as integrações
function getAllIntegrations() {
    try {
        const stmt = db.prepare('SELECT * FROM integrations ORDER BY created_at DESC');
        const integrations = stmt.all();
        
        console.log(`📋 Buscadas ${integrations.length} integrações do banco`);
        
        return integrations;
    } catch (error) {
        console.error('❌ Erro ao buscar integrações:', error.message);
        throw error;
    }
}

// Busca integração por nome da instância
function getIntegrationByInstance(instanceName) {
    try {
        const stmt = db.prepare('SELECT * FROM integrations WHERE instance_name = ? AND enabled = 1');
        const integration = stmt.get(instanceName);
        
        if (integration) {
            console.log(`✅ Integração encontrada: ${instanceName} (ID: ${integration.id})`);
        } else {
            console.log(`⚠️ Integração não encontrada ou desabilitada: ${instanceName}`);
        }
        
        return integration;
    } catch (error) {
        console.error('❌ Erro ao buscar integração por instância:', error.message);
        throw error;
    }
}

// Cria nova integração
function createIntegration(data) {
    try {
        // VALIDAÇÃO: Verifica se instance_name já existe
        const existing = db.prepare('SELECT id FROM integrations WHERE instance_name = ?').get(data.instance_name);
        
        if (existing) {
            throw new Error(`Integração com o nome "${data.instance_name}" já existe (ID: ${existing.id})`);
        }
        
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
        
        console.log(`✅ Integração criada no banco: ${data.instance_name} (ID: ${result.lastInsertRowid})`);
        
        return { id: result.lastInsertRowid };
    } catch (error) {
        console.error('❌ Erro ao criar integração:', error.message);
        throw error;
    }
}

// Atualiza integração
function updateIntegration(id, data) {
    try {
        // VALIDAÇÃO: Verifica se a integração existe
        const existing = db.prepare('SELECT id, instance_name FROM integrations WHERE id = ?').get(id);
        
        if (!existing) {
            throw new Error(`Integração com ID ${id} não encontrada`);
        }
        
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
        
        if (fields.length === 0) {
            throw new Error('Nenhum campo para atualizar');
        }
        
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        
        const stmt = db.prepare(`UPDATE integrations SET ${fields.join(', ')} WHERE id = ?`);
        const result = stmt.run(...values);
        
        console.log(`✅ Integração ${id} (${existing.instance_name}) atualizada: ${result.changes} registro(s) alterado(s)`);
        
        return result;
    } catch (error) {
        console.error('❌ Erro ao atualizar integração:', error.message);
        throw error;
    }
}

// Deleta integração
function deleteIntegration(id) {
    try {
        // VALIDAÇÃO: Verifica se a integração existe
        const existing = db.prepare('SELECT id, instance_name FROM integrations WHERE id = ?').get(id);
        
        if (!existing) {
            throw new Error(`Integração com ID ${id} não encontrada`);
        }
        
        const stmt = db.prepare('DELETE FROM integrations WHERE id = ?');
        const result = stmt.run(id);
        
        console.log(`✅ Integração ${id} (${existing.instance_name}) deletada: ${result.changes} registro(s) removido(s)`);
        
        return result;
    } catch (error) {
        console.error('❌ Erro ao deletar integração:', error.message);
        throw error;
    }
}

// Fecha conexão com banco (para graceful shutdown)
function closeDatabase() {
    try {
        if (db) {
            db.close();
            console.log('✅ Conexão com banco de dados fechada');
        }
    } catch (error) {
        console.error('❌ Erro ao fechar banco de dados:', error.message);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⚠️ Recebido SIGINT, fechando banco de dados...');
    closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n⚠️ Recebido SIGTERM, fechando banco de dados...');
    closeDatabase();
    process.exit(0);
});

module.exports = {
    db,
    initDatabase,
    getAllIntegrations,
    getIntegrationByInstance,
    createIntegration,
    updateIntegration,
    deleteIntegration,
    closeDatabase
};
