const axios = require('axios');

class ChatwootService {
    constructor(config) {
        this.baseUrl = config.chatwoot_url;
        this.accountId = config.chatwoot_account_id;
        this.apiToken = config.chatwoot_api_token;
        
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'api_access_token': this.apiToken,
                'Content-Type': 'application/json'
            }
        });
    }

    async getOrCreateContact(phoneNumber, name = '') {
        try {
            // Remove caracteres especiais do telefone
            const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
            const formattedPhone = `+${cleanPhone}`;

            // Busca contato existente
            const searchResponse = await this.client.get(`/api/v1/accounts/${this.accountId}/contacts/search`, {
                params: {
                    q: formattedPhone
                }
            });

            if (searchResponse.data.payload && searchResponse.data.payload.length > 0) {
                console.log('✅ Contato existente encontrado:', searchResponse.data.payload[0].id);
                return searchResponse.data.payload[0];
            }

            // Cria novo contato
            console.log('📝 Criando novo contato...');
            const createResponse = await this.client.post(`/api/v1/accounts/${this.accountId}/contacts`, {
                name: name || formattedPhone,
                phone_number: formattedPhone,
                identifier: `${cleanPhone}@s.whatsapp.net`
            });

            console.log('✅ Novo contato criado:', createResponse.data.payload.contact.id);
            return createResponse.data.payload.contact;

        } catch (error) {
            console.error('❌ Erro ao buscar/criar contato:', error.response?.data || error.message);
            throw error;
        }
    }

    async getOrCreateConversation(inboxId, contactId) {
        try {
            // Busca conversas abertas do contato
            const response = await this.client.get(`/api/v1/accounts/${this.accountId}/contacts/${contactId}/conversations`);

            if (response.data.payload && response.data.payload.length > 0) {
                // Procura conversa aberta no inbox específico
                const openConversation = response.data.payload.find(
                    conv => conv.status === 'open' && conv.inbox_id === inboxId
                );

                if (openConversation) {
                    console.log('✅ Conversa aberta encontrada:', openConversation.id);
                    return openConversation;
                }
            }

            // Cria nova conversa
            console.log('📝 Criando nova conversa...');
            const createResponse = await this.client.post(`/api/v1/accounts/${this.accountId}/conversations`, {
                inbox_id: inboxId,
                contact_id: contactId,
                status: 'open'
            });

            console.log('✅ Nova conversa criada:', createResponse.data.id);
            return createResponse.data;

        } catch (error) {
            console.error('❌ Erro ao buscar/criar conversa:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Faz upload de attachment no Chatwoot
     */
    async uploadAttachment(conversationId, fileBuffer, fileName, mimeType, caption = '') {
        try {
            const FormData = require('form-data');
            const form = new FormData();
            
            console.log(`📤 Preparando upload:`);
            console.log(`   - Arquivo: ${fileName}`);
            console.log(`   - Tipo: ${mimeType}`);
            console.log(`   - Tamanho: ${Math.round(fileBuffer.length / 1024)}KB`);
            console.log(`   - Conversa ID: ${conversationId}`);
            console.log(`   - Legenda: ${caption || 'Sem legenda'}`);
            
            form.append('attachments[]', fileBuffer, {
                filename: fileName,
                contentType: mimeType
            });

            // CRÍTICO: Adiciona source_id para evitar loop
            const sourceId = `wuzapi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            form.append('content', caption || fileName);
            form.append('message_type', 'incoming');
            form.append('private', 'false');
            form.append('source_id', sourceId);

            const response = await this.client.post(
                `/api/v1/accounts/${this.accountId}/conversations/${conversationId}/messages`,
                form,
                {
                    headers: {
                        ...form.getHeaders(),
                        'api_access_token': this.apiToken
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                }
            );

            console.log(`✅ Upload concluído!`);
            console.log(`✅ Message ID: ${response.data.id}`);
            console.log(`✅ Source ID: ${sourceId}`);
            
            return response.data;
            
        } catch (error) {
            console.error('❌ ERRO NO UPLOAD:');
            console.error('❌ Status:', error.response?.status);
            console.error('❌ Data:', JSON.stringify(error.response?.data, null, 2));
            console.error('❌ Message:', error.message);
            throw error;
        }
    }

    async sendMessage(conversationId, content, messageType = 'incoming') {
        try {
            const sourceId = `wuzapi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            await this.client.post(`/api/v1/accounts/${this.accountId}/conversations/${conversationId}/messages`, {
                content: content.content || content.text || content,
                message_type: messageType,
                source_id: sourceId
            });

            console.log(`✅ Mensagem enviada com source_id: ${sourceId}`);

            return { success: true };

        } catch (error) {
            console.error('❌ Erro ao enviar mensagem:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = ChatwootService;
