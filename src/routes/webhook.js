const express = require('express');
const router = express.Router();
const { getIntegrationByInstance } = require('../database/sqlite');
const ChatwootService = require('../services/chatwoot');

router.post('/:instanceName', async (req, res) => {
    try {
        const { instanceName } = req.params;
        const webhookData = req.body;

        console.log(`📨 Webhook recebido para instância: ${instanceName}`);
        console.log('Dados completos:', JSON.stringify(webhookData, null, 2));

        // Busca configuração da instância
        const integration = await getIntegrationByInstance(instanceName);
        
        if (!integration || !integration.enabled) {
            console.log('⚠️ Instância não encontrada ou desabilitada');
            return res.status(404).json({ error: 'Instância não configurada' });
        }

        // Log do tipo de evento recebido
        console.log('Tipo de evento:', webhookData.event || 'não especificado');
        console.log('fromMe:', webhookData.fromMe);

        // Processa apenas mensagens recebidas (não enviadas por você)
        if (webhookData.fromMe === false || webhookData.fromMe === 'false') {
            const chatwoot = new ChatwootService(integration);

            // Extrai dados da mensagem com múltiplas fontes possíveis
            let phoneNumber = webhookData.from || webhookData.author || webhookData.chatId || '';
            phoneNumber = phoneNumber.replace('@c.us', '').replace('@s.whatsapp.net', '');
            
            const senderName = webhookData.pushName || 
                             webhookData.notifyName || 
                             webhookData.senderName ||
                             webhookData._data?.notifyName ||
                             phoneNumber;

            // Extrai o texto da mensagem de múltiplas possíveis estruturas
            let messageText = webhookData.body || 
                            webhookData.message?.conversation || 
                            webhookData.message?.extendedTextMessage?.text ||
                            webhookData.text ||
                            webhookData.content ||
                            '';

            // Se ainda não tem texto, tenta outros campos
            if (!messageText && webhookData.message) {
                if (webhookData.message.imageMessage) {
                    messageText = webhookData.message.imageMessage.caption || '📷 Imagem';
                } else if (webhookData.message.videoMessage) {
                    messageText = webhookData.message.videoMessage.caption || '🎥 Vídeo';
                } else if (webhookData.message.audioMessage) {
                    messageText = '🎵 Áudio';
                } else if (webhookData.message.documentMessage) {
                    messageText = `📄 ${webhookData.message.documentMessage.fileName || 'Documento'}`;
                }
            }

            console.log('📞 Telefone extraído:', phoneNumber);
            console.log('👤 Nome do remetente:', senderName);
            console.log('💬 Mensagem:', messageText);

            if (!phoneNumber) {
                console.log('⚠️ Número de telefone não encontrado no webhook');
                return res.status(400).json({ error: 'Número de telefone não encontrado' });
            }

            if (!messageText) {
                console.log('⚠️ Mensagem vazia recebida');
                messageText = '[Mensagem sem texto]';
            }

            try {
                // Cria/busca contato no Chatwoot
                console.log('🔍 Buscando/criando contato...');
                const contact = await chatwoot.getOrCreateContact(phoneNumber, senderName);
                console.log('✅ Contato:', contact.id);

                // Cria/busca conversa no Chatwoot
                console.log('🔍 Buscando/criando conversa...');
                const conversation = await chatwoot.getOrCreateConversation(
                    integration.chatwoot_inbox_id,
                    contact.id
                );
                console.log('✅ Conversa:', conversation.id);

                // Envia mensagem para o Chatwoot
                console.log('📤 Enviando mensagem para Chatwoot...');
                const chatwootMessage = await chatwoot.sendMessage(conversation.id, {
                    content: messageText,
                    text: messageText
                }, 'incoming');

                console.log(`✅ Mensagem enviada com sucesso! Conversa ID: ${conversation.id}`);
                
                return res.status(200).json({ 
                    success: true,
                    conversation_id: conversation.id,
                    contact_id: contact.id
                });

            } catch (chatwootError) {
                console.error('❌ Erro ao comunicar com Chatwoot:', chatwootError.response?.data || chatwootError.message);
                throw chatwootError;
            }
        } else {
            console.log('⏭️ Mensagem ignorada (fromMe=true ou evento não suportado)');
            return res.status(200).json({ success: true, message: 'Ignored' });
        }

    } catch (error) {
        console.error('❌ Erro ao processar webhook:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'Sem detalhes adicionais'
        });
    }
});

module.exports = router;
