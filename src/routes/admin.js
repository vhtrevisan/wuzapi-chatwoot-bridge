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
        
        console.log('📝 Criando nova integração:', data.instance_name);

        // Cria inbox no Chatwoot
        const chatwoot = new ChatwootService({
            chatwoot_url: data.chatwoot_url,
            chatwoot_account_id: data.chatwoot_account_id,
            chatwoot_api_token: data.chatwoot_api_token
        });

        console.log('📮 Criando inbox no Chatwoot...');
        const inbox = await chatwoot.createInbox(
            `WhatsApp - ${data.instance_name}`,
            data.instance_name
        );

        console.log(`✅ Inbox criado: ${inbox.id}`);

        data.chatwoot_inbox_id = inbox.id;

        // Salva no banco
        const result = await createIntegration(data);
        console.log(`✅ Integração salva no banco: ID ${result.id}`);

        // Gera URL do webhook
        const webhookUrl = `${process.env.PUBLIC_URL || req.protocol + '://' + req.get('host')}/webhook/${data.instance_name}`;
        
        // Envia mensagem de boas-vindas
        console.log('💬 Enviando mensagem de boas-vindas...');
        await chatwoot.sendWelcomeMessage(inbox.id, data.instance_name, webhookUrl);
        
        res.json({ 
            success: true, 
            id: result.id,
            inbox_id: inbox.id,
            webhook_url: webhookUrl
        });
    } catch (error) {
        console.error('❌ Erro ao criar integração:', error);
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
