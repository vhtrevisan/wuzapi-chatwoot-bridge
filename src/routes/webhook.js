const express = require('express');
const router = express.Router();
const { getIntegrationByInstance } = require('../database/sqlite');
const ChatwootService = require('../services/chatwoot');

router.post('/:instanceName', async (req, res) => {
    try {
        const { instanceName } = req.params;
        const webhookData = req.body;

        console.log(`📨 Webhook recebido para instância: ${instanceName}`);
        console.log('Dados:', JSON.stringify(webhookData, null, 2));

        // Busca configuração da instância
        const integration = await getIntegrationByInstance(instanceName);
        
        if (!integration || !integration.enabled) {
            console.log('⚠️ Instância não encontrada ou desabilitada');
            return res.status(404).json({ error: 'Instância não configurada' });
        }

        // Processa apenas mensagens recebidas
        if (webhookData.event === 'message' && !webhookData.fromMe) {
            const chatwoot = new ChatwootService(integration);

            // Extrai dados da mensagem
            const phoneNumber = webhookData.from.replace('@c.us', '');
            const senderName = webhookData.pushName || webhookData.notifyName || phoneNumber;
            const messageText = webhookData.body || webhookData.message?.conversation || '';

            // Cria/busca contato no Chatwoot
            const contact = await chatwoot.getOrCreateContact(phoneNumber, senderName);

            // Cria/busca conversa no Chatwoot
            const conversation = await chatwoot.getOrCreateConversation(
                integration.chatwoot_inbox_id,
                contact.id
            );

            // Envia mensagem para o Chatwoot
            await chatwoot.sendMessage(conversation.id, {
                content: messageText,
                text: messageText
            }, 'incoming');

            console.log(`✅ Mensagem enviada para Chatwoot - Conversa ID: ${conversation.id}`);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('❌ Erro ao processar webhook:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
