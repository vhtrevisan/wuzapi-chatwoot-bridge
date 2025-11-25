const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getIntegrationByInstance } = require('../database/sqlite');
const ChatwootService = require('../services/chatwoot');
const WuzAPIService = require('../services/wuzapi');

// Cache de mensagens enviadas pelo Chatwoot (IDs das últimas mensagens enviadas)
const chatwootMessageCache = new Map();

// Limpa cache a cada 5 minutos (mensagens antigas)
setInterval(() => {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    for (const [messageId, timestamp] of chatwootMessageCache.entries()) {
        if (timestamp < fiveMinutesAgo) {
            chatwootMessageCache.delete(messageId);
        }
    }
}, 60000);

router.post('/:instanceName', async (req, res) => {
    try {
        const { instanceName } = req.params;
        const webhookData = req.body;

        console.log(`📨 Webhook recebido para instância: ${instanceName}`);

        const integration = await getIntegrationByInstance(instanceName);
        
        if (!integration || !integration.enabled) {
            console.log('⚠️ Instância não encontrada ou desabilitada');
            return res.status(404).json({ error: 'Instância não configurada' });
        }

        let parsedData;

        if (typeof webhookData === 'object' && webhookData.type) {
            parsedData = webhookData;
        } else if (webhookData.jsonData) {
            try {
                parsedData = JSON.parse(webhookData.jsonData);
            } catch (parseError) {
                console.log('⚠️ Erro ao fazer parse do jsonData:', parseError.message);
                return res.status(400).json({ error: 'Formato de dados inválido' });
            }
        } else {
            console.log('⚠️ Formato de webhook não reconhecido');
            return res.status(400).json({ error: 'Formato de webhook não reconhecido' });
        }

        console.log('📋 Tipo de evento:', parsedData.type);

        // ========================================
        // PROCESSA MENSAGENS RECEBIDAS (APENAS TEXTO)
        // ========================================
        if (parsedData.type === 'Message') {
            const info = parsedData.event?.Info;
            const message = parsedData.event?.Message;
            const isFromMe = info?.IsFromMe;
            const isGroup = info?.IsGroup;
            const messageId = info?.ID;

            if (!info || !message) {
                console.log('⚠️ Estrutura de dados incompleta');
                return res.status(400).json({ error: 'Dados incompletos' });
            }

            // IGNORA GRUPOS
            if (isGroup === true) {
                console.log('⏭️ Mensagem de grupo ignorada');
                return res.status(200).json({ success: true, message: 'Group message ignored' });
            }

            // Verifica se mensagem já foi processada (evita duplicação)
            if (chatwootMessageCache.has(messageId)) {
                console.log('⏭️ Mensagem já processada (duplicada)');
                return res.status(200).json({ success: true, message: 'Duplicate message ignored' });
            }

            // MARCA MENSAGEM COMO PROCESSADA IMEDIATAMENTE
            chatwootMessageCache.set(messageId, Date.now());

            // Extrai número de telefone CORRETO
            let phoneNumber;
            if (isFromMe === true) {
                phoneNumber = info.Chat || '';
            } else {
                phoneNumber = info.Sender || info.Chat || '';
            }

            phoneNumber = phoneNumber.replace('@s.whatsapp.net', '')
                                     .replace('@c.us', '')
                                     .replace('@lid', '')
                                     .split(':')[0];

            const senderName = info.PushName || phoneNumber;

            if (!phoneNumber) {
                console.log('⚠️ Número de telefone não encontrado');
                return res.status(400).json({ error: 'Número de telefone não encontrado' });
            }

            // Extrai texto da mensagem
            let messageText = message.conversation || 
                             message.extendedTextMessage?.text ||
                             '';

            // Detecta mídia mas IGNORA processamento
            if (message.imageMessage) {
                messageText = message.imageMessage.caption || '📷 Imagem (mídia temporariamente desabilitada)';
            } else if (message.videoMessage) {
                messageText = message.videoMessage.caption || '🎥 Vídeo (mídia temporariamente desabilitada)';
            } else if (message.audioMessage) {
                messageText = '🎵 Áudio (mídia temporariamente desabilitada)';
            } else if (message.documentMessage) {
                messageText = `📄 Documento (mídia temporariamente desabilitada)`;
            } else if (message.stickerMessage) {
                messageText = '🎨 Sticker (mídia temporariamente desabilitada)';
            } else if (!messageText) {
                messageText = '[Mensagem sem conteúdo de texto]';
            }

            console.log('📞 Telefone:', phoneNumber);
            console.log('👤 Nome:', senderName);
            console.log('💬 Mensagem:', messageText);

            try {
                const chatwoot = new ChatwootService(integration);

                console.log('🔍 Buscando/criando contato...');
                const contact = await chatwoot.getOrCreateContact(phoneNumber, senderName);
                console.log('✅ Contato ID:', contact.id);

                console.log('🔍 Buscando/criando conversa...');
                const conversation = await chatwoot.getOrCreateConversation(
                    integration.chatwoot_inbox_id,
                    contact.id
                );
                console.log('✅ Conversa ID:', conversation.id);

                const messageType = isFromMe === true ? 'outgoing' : 'incoming';
                console.log(`📝 Tipo de mensagem: ${messageType}`);

                // Envia apenas mensagem de texto
                console.log('📤 Enviando mensagem para Chatwoot...');
                await chatwoot.sendMessage(conversation.id, {
                    content: messageText,
                    text: messageText
                }, messageType);

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
        }

        // ========================================
        // PROCESSA STATUS DE ENTREGA/LEITURA
        // ========================================
        else if (parsedData.type === 'Receipt') {
            const receipt = parsedData.event;
            console.log('📬 Recibo de status recebido:', receipt?.Type);
            
            const statusType = receipt?.Type;
            const messageIds = receipt?.MessageIDs || [];
            
            console.log(`📊 Status "${statusType}" para ${messageIds.length} mensagens`);
            
            return res.status(200).json({ 
                success: true, 
                message: 'Receipt processed',
                status: statusType,
                count: messageIds.length
            });
        }

        // ========================================
        // IGNORA OUTROS EVENTOS
        // ========================================
        else {
            console.log('⏭️ Evento ignorado (tipo não tratado)');
            return res.status(200).json({ success: true, message: 'Event type not handled' });
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

// Exporta função para adicionar IDs ao cache
router.addToChatwootCache = (messageId) => {
    chatwootMessageCache.set(messageId, Date.now());
};

module.exports = router;
