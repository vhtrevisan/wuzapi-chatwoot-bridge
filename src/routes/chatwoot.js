const express = require('express');
const router = express.Router();
const { getAllIntegrations } = require('../database/sqlite');
const WuzAPIService = require('../services/wuzapi');

router.post('/events', async (req, res) => {
    try {
        const event = req.body;

        console.log('📨 Evento recebido do Chatwoot:', event.event);
        console.log('📋 Message Type:', event.message_type);
        console.log('📋 Source ID:', event.source_id || 'null');
        console.log('📋 Private:', event.private);
        console.log('📋 Content:', event.content?.substring(0, 50) || 'empty');

        // Processa apenas mensagens enviadas por agentes (outgoing)
        if (event.event !== 'message_created') {
            console.log('⏭️ Evento ignorado (não é message_created)');
            return res.status(200).json({ success: true });
        }

        // Ignora mensagens que vieram do WhatsApp Web (têm source_id)
        if (event.source_id && event.source_id.startsWith('wuzapi_')) {
            console.log('⏭️ Mensagem ignorada (veio do WhatsApp Web via middleware)');
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
        let phoneNumber = event.conversation?.meta?.sender?.phone_number;

        if (!phoneNumber) {
            console.log('⚠️ Número de telefone não encontrado no evento');
            console.log('📋 Event data:', JSON.stringify(event.conversation?.meta, null, 2));
            return res.status(400).json({ error: 'Número de telefone não encontrado' });
        }

        // REMOVE + DO INÍCIO SE EXISTIR (Chatwoot envia com +)
        phoneNumber = phoneNumber.replace(/^\+/, '');

        // VALIDAÇÃO ROBUSTA DE TELEFONE
        const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
        
        if (cleanPhone.length < 10) {
            console.log(`⚠️ Telefone inválido (muito curto): ${phoneNumber} (${cleanPhone.length} dígitos)`);
            return res.status(400).json({ 
                error: 'Número de telefone inválido',
                details: `Telefone muito curto: ${cleanPhone.length} dígitos`
            });
        }
        
        if (cleanPhone.length > 15) {
            console.log(`⚠️ Telefone suspeito (muito longo): ${phoneNumber} (${cleanPhone.length} dígitos)`);
            // Não bloqueia, mas registra aviso
        }

        const messageContent = event.content || '';
        let attachments = event.attachments || [];

        // VALIDA CONTEÚDO - Ignora mensagens vazias ou "nil"
        if (!messageContent || messageContent === 'nil' || messageContent.trim() === '') {
            if (!attachments || attachments.length === 0) {
                console.log('⏭️ Mensagem vazia ignorada');
                return res.status(200).json({ success: true, message: 'Empty message ignored' });
            }
        }

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

        console.log('📤 Enviando para WhatsApp:', phoneNumber);
        console.log('📝 Texto:', messageContent || '(sem texto)');
        console.log('📎 Anexos:', attachments.length);
        
        if (attachments.length > 0) {
            console.log('📋 Detalhes dos anexos:', attachments.map(a => ({
                name: a.file_name,
                type: a.file_type,
                url: a.data_url?.substring(0, 100) + '...' // Trunca URL longa
            })));
        }

        // Envia mensagem via WuzAPI
        const wuzapi = new WuzAPIService(integration);
        
        try {
            await wuzapi.sendMessage(phoneNumber, messageContent, attachments);
            console.log('✅ Mensagem enviada com sucesso para WhatsApp!');
        } catch (wuzapiError) {
            console.error('❌ Erro do WuzAPI:', wuzapiError.message);
            console.error('❌ Status:', wuzapiError.response?.status);
            console.error('❌ Response:', wuzapiError.response?.data);
            
            // Retorna erro específico para o Chatwoot
            return res.status(500).json({ 
                error: 'Falha ao enviar mensagem via WuzAPI',
                details: wuzapiError.response?.data || wuzapiError.message,
                phone: phoneNumber
            });
        }

        return res.status(200).json({ 
            success: true,
            phone: phoneNumber,
            attachments_count: attachments.length
        });

    } catch (error) {
        console.error('❌ Erro ao processar evento do Chatwoot:', error.message);
        console.error('Stack:', error.stack);
        
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'Sem detalhes adicionais',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
