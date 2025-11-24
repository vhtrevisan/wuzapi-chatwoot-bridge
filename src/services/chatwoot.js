const axios = require('axios');

class ChatwootService {
    constructor(config) {
        this.baseUrl = config.chatwoot_url;
        this.accountId = config.chatwoot_account_id;
        this.apiToken = config.chatwoot_api_token;
        
        this.client = axios.create({
            baseURL: `${this.baseUrl}/api/v1`,
            headers: {
                'api_access_token': this.apiToken,
                'Content-Type': 'application/json'
            }
        });
    }

    async createInbox(name, phoneNumber) {
        try {
            const response = await this.client.post(`/accounts/${this.accountId}/inboxes`, {
                name: name,
                channel: {
                    type: 'api',
                    webhook_url: ''
                }
            });
            return response.data;
        } catch (error) {
            console.error('❌ Erro ao criar inbox:', error.response?.data || error.message);
            throw error;
        }
    }

    async getOrCreateContact(phoneNumber, name) {
        try {
            // Busca contato existente
            const searchResponse = await this.client.get(`/accounts/${this.accountId}/contacts/search`, {
                params: { q: phoneNumber }
            });

            if (searchResponse.data.payload.length > 0) {
                return searchResponse.data.payload[0];
            }

            // Cria novo contato
            const createResponse = await this.client.post(`/accounts/${this.accountId}/contacts`, {
                name: name || phoneNumber,
                phone_number: phoneNumber
            });

            return createResponse.data.payload.contact;
        } catch (error) {
            console.error('❌ Erro ao gerenciar contato:', error.response?.data || error.message);
            throw error;
        }
    }

    async getOrCreateConversation(inboxId, contactId) {
        try {
            // Busca conversas ativas do contato
            const response = await this.client.get(`/accounts/${this.accountId}/contacts/${contactId}/conversations`);
            
            const activeConversation = response.data.payload.find(conv => 
                conv.inbox_id === inboxId && conv.status === 'open'
            );

            if (activeConversation) {
                return activeConversation;
            }

            // Cria nova conversa
            const createResponse = await this.client.post(`/accounts/${this.accountId}/conversations`, {
                source_id: `whatsapp_${contactId}_${Date.now()}`,
                inbox_id: inboxId,
                contact_id: contactId,
                status: 'open'
            });

            return createResponse.data;
        } catch (error) {
            console.error('❌ Erro ao gerenciar conversa:', error.response?.data || error.message);
            throw error;
        }
    }

    async sendMessage(conversationId, message, messageType = 'incoming') {
        try {
            const response = await this.client.post(
                `/accounts/${this.accountId}/conversations/${conversationId}/messages`,
                {
                    content: message.text || message.content,
                    message_type: messageType,
                    private: false
                }
            );

            return response.data;
        } catch (error) {
            console.error('❌ Erro ao enviar mensagem:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = ChatwootService;
