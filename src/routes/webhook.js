const express = require('express');
const router = express.Router();
const { getIntegrationByInstance } = require('../database/sqlite');
const ChatwootService = require('../services/chatwoot');

router.post('/:instanceName', async (req, res) => {
    try {
        const { instanceName } = req.params;
        const webhookData = req.body;

        console.log(`📨 Webhook recebido para instância: ${instanceName}`);

        // Busca configuração da instância
        const integration = await getIntegrationByInstance(instanceName);
        
        if (!integration || !integration.enabled) {
            console.log('⚠️ Instância não encontrada ou desabilitada');
            return res.status(404).json({ error: 'Instância não configurada' });
        }

        // Parse do jsonData que vem como string
        let parsedData;
        try {
            parsedData = JSON.parse(webhookData.jsonData);
        } catch (parseError) {
            console.log('⚠️ Erro ao fazer parse do jsonData:', parseError.message);
            return res.status(400).json({ error: 'Formato de dados inválido' });
        }

        console.log('Tipo de evento:', parsedData.type);

        // Processa apenas eventos do tipo "Message"
        if (parsedData.type !== 'Message') {
            console.log('⏭️ Evento ignorado (não é uma mensagem)');
            return res.status(200).json({ success: true, message: 'Ignored non-message event' });
        }

        // Verifica se é mensagem recebida (não enviada por você)
        const isFromMe = parsedData.event?.Info?.IsFromMe;
        
        if (isFromMe === true) {
            console.log('⏭️ Mensagem ignorada (enviada por você)');
            return res.status(200).json({ success: true, message: 'Ignored outgoing message' });
        }

        // Extrai dados da mensagem
        const info = parsedData.event?.Info;
        const message = parsedData.event?.Message;

        if (!info || !message) {
            console.log('⚠️ Estrutura de dados incompleta');
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        // Extrai número de telefone
        let phoneNumber = info.Sender || info.Chat || '';
        phoneNumber = phoneNumber.replace('@s.whatsapp.net', '')
                                 .replace('@c.us', '')
                                 .replace('@lid', '')
                                 .split(':')[0]; // Remove sufixo :82

        const senderName = info.PushName || phoneNumber;

        // Extrai texto da mensagem
        let messageText = message.conversation || 
                         message.extendedTextMessage?.text ||
                         '';

        // Trata mensagens de mídia
        if (!messageText) {
            if (message.imageMessage) {
                messageText = message.imageMessage.caption || '📷 Imagem';
            } else if (message.videoMessage) {
                messageText = message.videoMessage.caption || '🎥 Vídeo';
            } else if (message.audioMessage) {
                messageText = '🎵 Áudio';
            } else if (message.documentMessage) {
                messageText = `📄 ${message.documentMessage.fileName || 'Documento'}`;
            } else if (message.stickerMessage) {
                messageText = '🎨 Sticker';
            } else {
                messageText = '[Mensagem sem conteúdo de texto]';
            }
        }

        console.log('📞 Telefone:', phoneNumber);
        console.log('👤 Nome:', senderName);
        console.log('💬 Mensagem:', messageText);

        if (!phoneNumber) {
            console.log('⚠️ Número de telefone não encontrado');
            return res.status(400).json({ error: 'Número de telefone não encontrado' });
        }

        try {
            const chatwoot = new ChatwootService(integration);

            // Cria/busca contato
            console.log('🔍 Buscando/criando contato...');
            const contact = await chatwoot.getOrCreateContact(phoneNumber, senderName);
            console.log('✅ Contato ID:', contact.id);

            // Cria/busca conversa
            console.log('🔍 Buscando/criando conversa...');
            const conversation = await chatwoot.getOrCreateConversation(
                integration.chatwoot_inbox_id,
                contact.id
            );
            console.log('✅ Conversa ID:', conversation.id);

            // Envia mensagem
            console.log('📤 Enviando mensagem para Chatwoot...');
            await chatwoot.sendMessage(conversation.id, {
                content: messageText,
                text: messageText
            }, 'incoming');

            console.log(`✅ Mensagem enviada com sucesso!`);
            
            return res.status(200).json({ 
                success: true,
                conversation_id: conversation.id,
                contact_id: contact.id
            });

        } catch (chatwootError) {
            console.error('❌ Erro ao comunicar com Chatwoot:', chatwootError.response?.data || chatwootError.message);
            throw chatwootError;
        }

    } catch (error) {
        console.error('❌ Erro ao processar webhook:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'Sem detalhes adicionais'
        });
    }
});

module.exports = router;
