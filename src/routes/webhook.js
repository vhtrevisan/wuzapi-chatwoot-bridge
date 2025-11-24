const express = require('express');
const router = express.Router();
const { getIntegrationByInstance } = require('../database/sqlite');
const ChatwootService = require('../services/chatwoot');

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
}, 60000); // Roda a cada 1 minuto

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

        // Parse do jsonData
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
        // PROCESSA MENSAGENS RECEBIDAS
        // ========================================
        if (parsedData.type === 'Message') {
            const info = parsedData.event?.Info;
            const message = parsedData.event?.Message;
            const isFromMe = info?.IsFromMe;
            const messageId = info?.ID;

            if (!info || !message) {
                console.log('⚠️ Estrutura de dados incompleta');
                return res.status(400).json({ error: 'Dados incompletos' });
            }

            // NOVA LÓGICA: Verifica se mensagem foi enviada pelo Chatwoot
            if (isFromMe === true) {
                // Verifica se está no cache (foi enviada pelo Chatwoot)
                if (chatwootMessageCache.has(messageId)) {
                    console.log('⏭️ Mensagem ignorada (enviada pelo Chatwoot)');
                    return res.status(200).json({ success: true, message: 'Ignored Chatwoot outgoing message' });
                }
                
                // Se não está no cache, é mensagem enviada pelo WhatsApp Web/Celular
                console.log('✅ Mensagem enviada pelo WhatsApp Web/Celular - será processada');
            }

            // Extrai número de telefone
            let phoneNumber = info.Sender || info.Chat || '';
            phoneNumber = phoneNumber.replace('@s.whatsapp.net', '')
                                     .replace('@c.us', '')
                                     .replace('@lid', '')
                                     .split(':')[0];

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

                // Define tipo de mensagem (incoming ou outgoing)
                const messageType = isFromMe === true ? 'outgoing' : 'incoming';
                console.log(`📝 Tipo de mensagem: ${messageType}`);

                // Envia mensagem
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

// Exporta função para adicionar IDs ao cache (será chamada quando enviar pelo Chatwoot)
router.addToChatwootCache = (messageId) => {
    chatwootMessageCache.set(messageId, Date.now());
};

module.exports = router;
