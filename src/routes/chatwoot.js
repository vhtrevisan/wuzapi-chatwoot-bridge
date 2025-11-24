const express = require('express');
const router = express.Router();
const { getAllIntegrations } = require('../database/sqlite');
const WuzAPIService = require('../services/wuzapi');

router.post('/events', async (req, res) => {
    try {
        const event = req.body;

        console.log('📨 Evento recebido do Chatwoot:', event.event);

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
        const integration = integrations.find(int => 
            int.chatwoot_inbox_id === event.inbox?.id && int.enabled
        );

        if (!integration) {
            console.log('⚠️ Integração não encontrada para inbox:', event.inbox?.id);
            return res.status(404).json({ error: 'Integração não encontrada' });
        }

        console.log('✅ Integração encontrada:', integration.instance_name);

        // Extrai número de telefone do contato
        const phoneNumber = event.conversation?.meta?.sender?.phone_number;

        if (!phoneNumber) {
            console.log('⚠️ Número de telefone não encontrado no evento');
            return res.status(400).json({ error: 'Número de telefone não encontrado' });
        }

        const messageContent = event.content || '';
        let attachments = event.attachments || [];

        // Extrai nome do arquivo da URL se não vier no attachment
        attachments = attachments.map(att => {
            let fileName = att.fallback_title || att.file_name || 'file';
            
            // Se o nome for genérico, tenta extrair da URL
            if (fileName === 'file' && att.data_url) {
                try {
                    const urlParts = att.data_url.split('/');
                    const lastPart = urlParts[urlParts.length - 1];
                    // Decodifica URL encoding
                    const decodedName = decodeURIComponent(lastPart);
                    if (decodedName && decodedName.length > 0 && decodedName !== 'file') {
                        fileName = decodedName;
                    }
                } catch (e) {
                    console.log('⚠️ Erro ao extrair nome da URL:', e.message);
                }
            }
            
            return {
                ...att,
                file_name: fileName
            };
        });

        // Verifica se tem conteúdo OU anexos
        if (!messageContent && attachments.length === 0) {
            console.log('⚠️ Mensagem sem conteúdo e sem anexos');
            return res.status(400).json({ error: 'Mensagem sem conteúdo' });
        }

        console.log('📤 Enviando para WhatsApp:', phoneNumber);
        console.log('📝 Texto:', messageContent || '(sem texto)');
        console.log('📎 Anexos:', attachments.length);
        
        if (attachments.length > 0) {
            console.log('📋 Detalhes dos anexos:', attachments.map(a => ({
                name: a.file_name,
                type: a.file_type,
                url: a.data_url
            })));
        }

        // Envia mensagem via WuzAPI
        const wuzapi = new WuzAPIService(integration);
        await wuzapi.sendMessage(phoneNumber, messageContent, attachments);

        console.log('✅ Mensagem enviada com sucesso!');

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('❌ Erro ao processar evento do Chatwoot:', error.message);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'Sem detalhes adicionais'
        });
    }
});

module.exports = router;
