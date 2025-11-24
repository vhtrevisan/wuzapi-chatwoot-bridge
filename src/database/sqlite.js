const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/config.db');
let db;

function initDatabase() {
    db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
            console.error('❌ Erro ao abrir banco de dados:', err);
        } else {
            console.log('✅ Banco de dados SQLite conectado');
        }
    });

    db.run(`
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

    db.run(`
        CREATE TABLE IF NOT EXISTS message_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wuzapi_message_id TEXT UNIQUE NOT NULL,
            chatwoot_message_id INTEGER NOT NULL,
            chatwoot_conversation_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

function getAllIntegrations() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM integrations ORDER BY created_at DESC', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getIntegrationByInstance(instanceName) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM integrations WHERE instance_name = ?', [instanceName], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function createIntegration(data) {
    return new Promise((resolve, reject) => {
        const { instance_name, wuzapi_url, wuzapi_token, chatwoot_url, chatwoot_account_id, chatwoot_api_token } = data;
        
        db.run(
            `INSERT INTO integrations (instance_name, wuzapi_url, wuzapi_token, chatwoot_url, chatwoot_account_id, chatwoot_api_token) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [instance_name, wuzapi_url, wuzapi_token, chatwoot_url, chatwoot_account_id, chatwoot_api_token],
            function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            }
        );
    });
}

function updateIntegration(id, data) {
    return new Promise((resolve, reject) => {
        const fields = [];
        const values = [];
        
        Object.keys(data).forEach(key => {
            fields.push(`${key} = ?`);
            values.push(data[key]);
        });
        
        values.push(id);
        
        db.run(
            `UPDATE integrations SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            values,
            function(err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            }
        );
    });
}

function deleteIntegration(id) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM integrations WHERE id = ?', [id], function(err) {
            if (err) reject(err);
            else resolve({ changes: this.changes });
        });
    });
}

module.exports = {
    initDatabase,
    getAllIntegrations,
    getIntegrationByInstance,
    createIntegration,
    updateIntegration,
    deleteIntegration,
    db
};
