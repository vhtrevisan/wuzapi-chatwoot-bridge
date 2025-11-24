const express = require('express');
const router = express.Router();
const { getAllIntegrations } = require('../database/sqlite');
const WuzAPIService = require('../services/wuzapi');

router.post('/events', async (req, res) => {
    try {
        const event = req.body;

        console.log('📨 Evento recebido do Chatwoot:', event.event);
        console.log('📋 EVENTO COMPLETO:', JSON.stringify(event, null, 2));

        // Processa apenas mensagens enviadas por agentes (outgoing)
        if (event.event !== 'message_created') {
            console.log('⏭️ Evento ignorado (não é message_created)');
            return res.status(200).json({ success: true });
        }

        if (event.message_type !== 'outgoing') {
            console.log('⏭️ Mensagem ignorada (não é outgoing)');
            return res.status(200).json({ success: true });
        }

        // Ignora mensagens privadas (notas internas)
        if (event.private) {
            console.log('⏭️ Mensagem privada ignorada');
            return res.status(200).json({ success: true });
        }

        // Busca integração pelo inbox_id
        const integrations = await getAllIntegrations();
        console.log('🔍 Integrações disponíveis:', integrations.map(i => ({ 
            id: i.id, 
            instance: i.instance_name, 
            inbox_id: i.chatwoot_inbox_id,
            enabled: i.enabled
        })));

        const integration = integrations.find(int => 
            int.chatwoot_inbox_id === event.inbox?.id && int.enabled
        );

        if (!integration) {
            console.log('⚠️ Integração não encontrada para inbox:', event.inbox?.id);
            console.log('⚠️ Integrações disponíveis:', integrations);
            return res.status(404).json({ error: 'Integração não encontrada' });
        }

        console.log('✅ Integração encontrada:', integration.instance_name);

        // Extrai número de telefone do contato (várias fontes possíveis)
        const phoneNumber = event.conversation?.contact_inbox?.phone_number || 
                          event.conversation?.meta?.sender?.phone_number ||
                          event.conversation?.contact?.phone_number ||
                          event.sender?.phone_number ||
                          event.contact?.phone_number;

        console.log('📞 Número extraído:', phoneNumber);
        console.log('📋 Estrutura conversation:', JSON.stringify(event.conversation, null, 2));
        console.log('📋 Estrutura contact:', JSON.stringify(event.sender || event.contact, null, 2));

        if (!phoneNumber) {
            console.log('⚠️ Número de telefone não encontrado no evento');
            return res.status(400).json({ error: 'Número de telefone não encontrado' });
        }

        const messageContent = event.content || '';

        if (!messageContent) {
            console.log('⚠️ Mensagem sem conteúdo');
            return res.status(400).json({ error: 'Mensagem sem conteúdo' });
        }

        // Envia mensagem via WuzAPI
        const wuzapi = new WuzAPIService(integration);
        await wuzapi.sendMessage(phoneNumber, messageContent);

        console.log('✅ Mensagem enviada com sucesso para WhatsApp!');

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('❌ Erro ao processar evento do Chatwoot:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'Sem detalhes adicionais'
        });
    }
});

module.exports = router;
