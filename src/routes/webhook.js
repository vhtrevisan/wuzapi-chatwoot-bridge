const express = require('express');
const router = express.Router();
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
        // PROCESSA MENSAGENS RECEBIDAS
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
                // Se mensagem foi enviada por você (WhatsApp Web), pega o DESTINATÁRIO (Chat)
                phoneNumber = info.Chat || '';
            } else {
                // Se mensagem foi recebida, pega o REMETENTE (Sender)
                phoneNumber = info.Sender || info.Chat || '';
            }

            phoneNumber = phoneNumber.replace('@s.whatsapp.net', '')
                                     .replace('@c.us', '')
                                     .replace('@lid', '')
                                     .split(':')[0];

            const senderName = info.PushName || phoneNumber;

            // VALIDA: Ignora se número estiver vazio
            if (!phoneNumber) {
                console.log('⚠️ Número de telefone não encontrado');
                return res.status(400).json({ error: 'Número de telefone não encontrado' });
            }

            // Extrai texto da mensagem
            let messageText = message.conversation || 
                             message.extendedTextMessage?.text ||
                             '';

            // Detecta e processa mídia
            let hasMedia = false;
            let mediaType = null;
            let mediaFileName = null;
            let mediaMimeType = null;
            let mediaCaption = '';

            if (message.imageMessage) {
                hasMedia = true;
                mediaType = 'image';
                mediaFileName = 'image.jpg';
                mediaMimeType = message.imageMessage.mimetype || 'image/jpeg';
                mediaCaption = message.imageMessage.caption || '';
                messageText = mediaCaption || '📷 Imagem';
            } else if (message.videoMessage) {
                hasMedia = true;
                mediaType = 'video';
                mediaFileName = 'video.mp4';
                mediaMimeType = message.videoMessage.mimetype || 'video/mp4';
                mediaCaption = message.videoMessage.caption || '';
                messageText = mediaCaption || '🎥 Vídeo';
            } else if (message.audioMessage) {
                hasMedia = true;
                mediaType = 'audio';
                mediaFileName = 'audio.ogg';
                mediaMimeType = message.audioMessage.mimetype || 'audio/ogg';
                messageText = '🎵 Áudio';
            } else if (message.documentMessage) {
                hasMedia = true;
                mediaType = 'document';
                mediaFileName = message.documentMessage.fileName || 'document.pdf';
                mediaMimeType = message.documentMessage.mimetype || 'application/pdf';
                messageText = `📄 ${mediaFileName}`;
            } else if (message.stickerMessage) {
                hasMedia = true;
                mediaType = 'sticker';
                mediaFileName = 'sticker.webp';
                mediaMimeType = 'image/webp';
                messageText = '🎨 Sticker';
            } else if (!messageText) {
                messageText = '[Mensagem sem conteúdo de texto]';
            }

            console.log('📞 Telefone:', phoneNumber);
            console.log('👤 Nome:', senderName);
            console.log('💬 Mensagem:', messageText);
            if (hasMedia) {
                console.log('📎 Mídia detectada:', mediaType);
            }

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

                // Define tipo: incoming (recebida) ou outgoing (enviada por você no WhatsApp Web)
                const messageType = isFromMe === true ? 'outgoing' : 'incoming';
                console.log(`📝 Tipo de mensagem: ${messageType}`);

                // PROCESSA MÍDIA SE EXISTIR
                if (hasMedia) {
                    try {
                        console.log(`📥 Processando mídia tipo: ${mediaType}`);
                        
                        // EXTRAI BASE64 DO WEBHOOK (mídia já vem no webhook!)
                        let mediaBase64 = null;
                        let mediaBuffer = null;
                        
                        if (mediaType === 'image' && message.imageMessage) {
                            // Base64 pode estar em 'url' ou em campo específico
                            mediaBase64 = message.imageMessage.url || 
                                         message.imageMessage.jpegThumbnail;
                        } else if (mediaType === 'video' && message.videoMessage) {
                            mediaBase64 = message.videoMessage.url;
                        } else if (mediaType === 'audio' && message.audioMessage) {
                            mediaBase64 = message.audioMessage.url;
                        } else if (mediaType === 'document' && message.documentMessage) {
                            mediaBase64 = message.documentMessage.url;
                        } else if (mediaType === 'sticker' && message.stickerMessage) {
                            mediaBase64 = message.stickerMessage.url;
                        }
                        
                        if (!mediaBase64) {
                            throw new Error('URL da mídia não encontrada no webhook');
                        }
                        
                        console.log(`✅ Base64 extraído (${Math.round(mediaBase64.length / 1024)}KB)`);
                        
                        // Converte base64 para Buffer
                        // Remove prefixo "data:image/jpeg;base64," se existir
                        const base64Data = mediaBase64.replace(/^data:.*?;base64,/, '');
                        mediaBuffer = Buffer.from(base64Data, 'base64');
                        
                        console.log(`📤 Fazendo upload para Chatwoot (${Math.round(mediaBuffer.length / 1024)}KB)`);
                        
                        // Faz upload no Chatwoot
                        await chatwoot.uploadAttachment(
                            conversation.id,
                            mediaBuffer,
                            mediaFileName,
                            mediaMimeType
                        );
                        
                        console.log('✅ Mídia enviada para Chatwoot');
                        
                        // Se tem legenda, envia como mensagem separada
                        if (mediaCaption) {
                            await chatwoot.sendMessage(conversation.id, {
                                content: mediaCaption,
                                text: mediaCaption
                            }, messageType);
                        }
                        
                        return res.status(200).json({ 
                            success: true,
                            conversation_id: conversation.id,
                            contact_id: contact.id
                        });
                        
                    } catch (mediaError) {
                        console.error('⚠️ Erro ao processar mídia:', mediaError.message);
                        // Continua e envia mensagem de texto como fallback
                    }
                }

                // Envia mensagem de texto (se não tiver mídia ou se mídia falhou)
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
