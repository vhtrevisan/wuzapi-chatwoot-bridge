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
        // PROCESSA MENSAGENS (TEXTO E MÍDIA)
        // ========================================
        if (parsedData.type === 'Message') {
            const info = parsedData.event?.Info;
            const message = parsedData.event?.Message;
            const s3Data = parsedData.s3;
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

            // Verifica duplicação
            if (chatwootMessageCache.has(messageId)) {
                console.log('⏭️ Mensagem já processada (duplicada)');
                return res.status(200).json({ success: true, message: 'Duplicate message ignored' });
            }

            chatwootMessageCache.set(messageId, Date.now());

            // Extrai número de telefone
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

            console.log('📞 Telefone:', phoneNumber);
            console.log('👤 Nome:', senderName);

            // Extrai texto da mensagem
            let messageText = message.conversation || 
                             message.extendedTextMessage?.text ||
                             '';

            // Detecta legenda de mídia
            let caption = '';
            if (message.imageMessage?.caption) {
                caption = message.imageMessage.caption;
            } else if (message.videoMessage?.caption) {
                caption = message.videoMessage.caption;
            } else if (message.documentMessage?.caption) {
                caption = message.documentMessage.caption;
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

                const messageType = isFromMe === true ? 'outgoing' : 'incoming';
                console.log(`📝 Tipo de mensagem: ${messageType}`);

                // ========================================
                // SE TEM MÍDIA DO MINIO (s3 presente)
                // ========================================
                if (s3Data && s3Data.url) {
                    console.log('📸 Mídia detectada do MinIO!');
                    console.log('🔗 URL:', s3Data.url);
                    console.log('📋 Tipo:', s3Data.mimeType);
                    console.log('📦 Tamanho:', Math.round(s3Data.size / 1024), 'KB');

                    try {
                        // Baixa mídia do MinIO (bucket público)
                        console.log('⬇️ Baixando mídia do MinIO...');
                        const response = await axios.get(s3Data.url, {
                            responseType: 'arraybuffer',
                            timeout: 30000
                        });

                        const mediaBuffer = Buffer.from(response.data);
                        console.log(`✅ Mídia baixada (${Math.round(mediaBuffer.length / 1024)}KB)`);

                        // Gera nome amigável baseado no tipo MIME
                        let mediaMimeType = s3Data.mimeType || 'application/octet-stream';
                        let mediaFileName = 'arquivo';

                        if (mediaMimeType.startsWith('image/')) {
                            const ext = mediaMimeType.split('/')[1].replace('jpeg', 'jpg');
                            mediaFileName = `imagem.${ext}`;
                        } else if (mediaMimeType.startsWith('audio/')) {
                            mediaFileName = 'audio.ogg';
                        } else if (mediaMimeType.startsWith('video/')) {
                            mediaFileName = 'video.mp4';
                        } else if (mediaMimeType === 'application/pdf') {
                            mediaFileName = 'documento.pdf';
                        } else if (mediaMimeType.includes('document') || mediaMimeType.includes('word')) {
                            mediaFileName = 'documento.docx';
                        } else if (mediaMimeType.includes('sheet') || mediaMimeType.includes('excel')) {
                            mediaFileName = 'planilha.xlsx';
                        } else if (s3Data.fileName) {
                            // Mantém nome original para tipos desconhecidos
                            mediaFileName = s3Data.fileName;
                        }

                        console.log('📝 Nome do arquivo:', mediaFileName);

                        // Upload para Chatwoot
                        console.log(`📤 Fazendo upload para Chatwoot...`);
                        await chatwoot.uploadAttachment(
                            conversation.id,
                            mediaBuffer,
                            mediaFileName,
                            mediaMimeType,
                            caption || messageText || `📎 ${mediaFileName}`
                        );

                        console.log('✅ Mídia enviada para Chatwoot');

                        // Se tem legenda ou texto adicional, envia separado
                        if (caption && caption !== messageText) {
                            await chatwoot.sendMessage(conversation.id, {
                                content: caption,
                                text: caption
                            }, messageType);
                        }

                    } catch (mediaError) {
                        console.error('❌ Erro ao processar mídia:', mediaError.message);
                        console.error('❌ Status:', mediaError.response?.status);
                        console.error('❌ URL que falhou:', s3Data.url);
                        
                        // Se falhar, envia pelo menos o texto
                        const fallbackText = caption || messageText || '📎 [Falha ao carregar mídia]';
                        await chatwoot.sendMessage(conversation.id, {
                            content: fallbackText,
                            text: fallbackText
                        }, messageType);
                    }

                } 
                // ========================================
                // SE É APENAS TEXTO (sem mídia)
                // ========================================
                else {
                    // Detecta tipo de mídia mas sem S3 (fallback)
                    if (message.imageMessage) {
                        messageText = message.imageMessage.caption || '📷 Imagem';
                    } else if (message.videoMessage) {
                        messageText = message.videoMessage.caption || '🎥 Vídeo';
                    } else if (message.audioMessage) {
                        messageText = '🎵 Áudio';
                    } else if (message.documentMessage) {
                        messageText = `📄 Documento`;
                    } else if (message.stickerMessage) {
                        messageText = '🎨 Sticker';
                    } else if (!messageText) {
                        messageText = '[Mensagem sem conteúdo de texto]';
                    }

                    console.log('💬 Mensagem:', messageText);

                    // Envia texto
                    console.log('📤 Enviando mensagem para Chatwoot...');
                    await chatwoot.sendMessage(conversation.id, {
                        content: messageText,
                        text: messageText
                    }, messageType);

                    console.log(`✅ Mensagem enviada com sucesso!`);
                }

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
        // IGNORA EVENTOS PICTURE (FOTO DE PERFIL)
        // ========================================
        else if (parsedData.type === 'Picture') {
            console.log('⏭️ Evento Picture ignorado (mudança de foto de perfil)');
            return res.status(200).json({ success: true, message: 'Profile picture event ignored' });
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
