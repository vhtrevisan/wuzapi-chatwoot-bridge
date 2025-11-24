const express = require('express');
const router = express.Router();
const {
    getAllIntegrations,
    createIntegration,
    updateIntegration,
    deleteIntegration
} = require('../database/sqlite');
const ChatwootService = require('../services/chatwoot');

// Lista todas as integrações
router.get('/integrations', async (req, res) => {
    try {
        const integrations = await getAllIntegrations();
        res.json(integrations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cria nova integração
router.post('/integrations', async (req, res) => {
    try {
        const data = req.body;
        
        // Cria inbox no Chatwoot
        const chatwoot = new ChatwootService({
            chatwoot_url: data.chatwoot_url,
            chatwoot_account_id: data.chatwoot_account_id,
            chatwoot_api_token: data.chatwoot_api_token
        });

        const inbox = await chatwoot.createInbox(
            `WhatsApp - ${data.instance_name}`,
            data.instance_name
        );

        data.chatwoot_inbox_id = inbox.id;

        // Salva no banco
        const result = await createIntegration(data);
        
        res.json({ 
            success: true, 
            id: result.id,
            inbox_id: inbox.id,
            webhook_url: `${process.env.PUBLIC_URL || req.protocol + '://' + req.get('host')}/webhook/${data.instance_name}`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Atualiza integração
router.put('/integrations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        await updateIntegration(id, data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Deleta integração
router.delete('/integrations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await deleteIntegration(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
