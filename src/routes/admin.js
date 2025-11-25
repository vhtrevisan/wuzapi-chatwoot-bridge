const express = require('express');
const router = express.Router();
const {
    getAllIntegrations,
    createIntegration,
    updateIntegration,
    deleteIntegration
} = require('../database/sqlite');
const ChatwootService = require('../services/chatwoot');

// Lista todas as integrações
router.get('/integrations', async (req, res) => {
    try {
        const integrations = await getAllIntegrations();
        console.log(`📋 Listando ${integrations.length} integrações`);
        res.json(integrations);
    } catch (error) {
        console.error('❌ Erro ao listar integrações:', error.message);
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Cria nova integração
router.post('/integrations', async (req, res) => {
    try {
        const data = req.body;
        
        // VALIDAÇÃO DE DADOS OBRIGATÓRIOS
        const requiredFields = [
            'instance_name',
            'wuzapi_url',
            'wuzapi_token',
            'chatwoot_url',
            'chatwoot_account_id',
            'chatwoot_api_token'
        ];
        
        const missingFields = requiredFields.filter(field => !data[field]);
        
        if (missingFields.length > 0) {
            console.log('⚠️ Campos obrigatórios ausentes:', missingFields);
            return res.status(400).json({ 
                error: 'Campos obrigatórios ausentes',
                missing_fields: missingFields
            });
        }

        // VALIDAÇÃO: Instance name não pode ter espaços ou caracteres especiais
        if (!/^[a-zA-Z0-9_-]+$/.test(data.instance_name)) {
            console.log('⚠️ Nome de instância inválido:', data.instance_name);
            return res.status(400).json({ 
                error: 'Nome de instância inválido',
                details: 'Use apenas letras, números, traço (-) e underscore (_)'
            });
        }

        // VALIDAÇÃO: Account ID deve ser número
        if (isNaN(data.chatwoot_account_id)) {
            console.log('⚠️ Account ID inválido:', data.chatwoot_account_id);
            return res.status(400).json({ 
                error: 'Account ID deve ser um número'
            });
        }
        
        console.log('📝 Criando nova integração:', data.instance_name);
        console.log('🔗 WuzAPI:', data.wuzapi_url);
        console.log('🔗 Chatwoot:', data.chatwoot_url);

        // Cria inbox no Chatwoot
        const chatwoot = new ChatwootService({
            chatwoot_url: data.chatwoot_url,
            chatwoot_account_id: data.chatwoot_account_id,
            chatwoot_api_token: data.chatwoot_api_token
        });

        console.log('📮 Criando inbox no Chatwoot...');
        
        let inbox;
        try {
            inbox = await chatwoot.createInbox(
                `WhatsApp - ${data.instance_name}`,
                data.instance_name
            );
            console.log(`✅ Inbox criado: ${inbox.id}`);
        } catch (chatwootError) {
            console.error('❌ Erro ao criar inbox no Chatwoot:', chatwootError.message);
            console.error('❌ Response:', chatwootError.response?.data);
            
            return res.status(500).json({ 
                error: 'Falha ao criar inbox no Chatwoot',
                details: chatwootError.response?.data || chatwootError.message,
                suggestion: 'Verifique se as credenciais do Chatwoot estão corretas'
            });
        }

        data.chatwoot_inbox_id = inbox.id;

        // Salva no banco
        let result;
        try {
            result = await createIntegration(data);
            console.log(`✅ Integração salva no banco: ID ${result.id}`);
        } catch (dbError) {
            console.error('❌ Erro ao salvar no banco:', dbError.message);
            
            // Se falhar ao salvar, tenta deletar o inbox criado (rollback manual)
            console.log('🔄 Tentando reverter criação do inbox...');
            // (Chatwoot API não tem método de delete de inbox via API facilmente, então apenas loga)
            
            return res.status(500).json({ 
                error: 'Falha ao salvar integração no banco de dados',
                details: dbError.message,
                inbox_id: inbox.id,
                warning: 'Inbox foi criado no Chatwoot mas não foi salvo no banco. Delete manualmente se necessário.'
            });
        }

        // Gera URL do webhook
        const webhookUrl = `${process.env.PUBLIC_URL || req.protocol + '://' + req.get('host')}/webhook/${data.instance_name}`;
        
        console.log('🔗 URL do webhook gerada:', webhookUrl);
        
        // Envia mensagem de boas-vindas
        console.log('💬 Enviando mensagem de boas-vindas...');
        try {
            await chatwoot.sendWelcomeMessage(inbox.id, data.instance_name, webhookUrl);
        } catch (welcomeError) {
            // Não falha a criação se a mensagem de boas-vindas falhar
            console.log('⚠️ Não foi possível enviar mensagem de boas-vindas:', welcomeError.message);
        }
        
        res.json({ 
            success: true, 
            id: result.id,
            inbox_id: inbox.id,
            webhook_url: webhookUrl,
            message: 'Integração criada com sucesso! Configure o webhook no WuzAPI.'
        });
        
    } catch (error) {
        console.error('❌ Erro ao criar integração:', error.message);
        console.error('Stack:', error.stack);
        
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Atualiza integração
router.put('/integrations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        console.log(`📝 Atualizando integração ID ${id}`);
        console.log('📋 Dados:', Object.keys(data));
        
        // Valida que pelo menos um campo foi enviado
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ 
                error: 'Nenhum campo para atualizar' 
            });
        }
        
        await updateIntegration(id, data);
        
        console.log(`✅ Integração ${id} atualizada com sucesso`);
        
        res.json({ 
            success: true,
            message: 'Integração atualizada com sucesso'
        });
        
    } catch (error) {
        console.error('❌ Erro ao atualizar integração:', error.message);
        
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Deleta integração
router.delete('/integrations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Deletando integração ID ${id}`);
        
        await deleteIntegration(id);
        
        console.log(`✅ Integração ${id} deletada com sucesso`);
        console.log('⚠️ AVISO: O inbox no Chatwoot NÃO foi deletado automaticamente. Delete manualmente se necessário.');
        
        res.json({ 
            success: true,
            message: 'Integração deletada com sucesso',
            warning: 'O inbox no Chatwoot permanece ativo. Delete manualmente se necessário.'
        });
        
    } catch (error) {
        console.error('❌ Erro ao deletar integração:', error.message);
        
        res.status(500).json({ 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
