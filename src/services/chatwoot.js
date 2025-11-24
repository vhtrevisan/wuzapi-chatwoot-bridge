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

    async sendWelcomeMessage(inboxId, instanceName, webhookUrl) {
        try {
            // Busca o inbox para pegar informações
            const inboxResponse = await this.client.get(`/accounts/${this.accountId}/inboxes/${inboxId}`);
            const inbox = inboxResponse.data;

            // Cria um contato especial para a mensagem de boas-vindas (sem telefone)
            const welcomeContact = await this.client.post(`/accounts/${this.accountId}/contacts`, {
                name: '🤖 Sistema - Integração WuzAPI'
            });

            // Cria uma conversa
            const conversation = await this.client.post(`/accounts/${this.accountId}/conversations`, {
                source_id: `welcome_${instanceName}_${Date.now()}`,
                inbox_id: inboxId,
                contact_id: welcomeContact.data.payload.contact.id,
                status: 'open'
            });

            // Envia mensagem de boas-vindas
            const welcomeText = `🎉 **Integração WuzAPI × Chatwoot Configurada!**

✅ **Status:** Ativa e funcionando
📱 **Instância:** ${instanceName}
📥 **Inbox:** ${inbox.name}

---

**🔗 Webhook Configurado:**
\`${webhookUrl}\`

---

**📋 Como funciona:**

1️⃣ Mensagens recebidas no WhatsApp chegam automaticamente aqui
2️⃣ Você responde pelo Chatwoot
3️⃣ O cliente recebe a resposta no WhatsApp

---

**✨ Tudo pronto para atender seus clientes!**

*Mensagem automática gerada pelo sistema de integração*`;

            await this.client.post(
                `/accounts/${this.accountId}/conversations/${conversation.data.id}/messages`,
                {
                    content: welcomeText,
                    message_type: 'incoming',
                    private: false
                }
            );

            console.log('✅ Mensagem de boas-vindas enviada!');
        } catch (error) {
            console.error('⚠️ Erro ao enviar mensagem de boas-vindas:', error.response?.data || error.message);
            // Não falha a integração se a mensagem de boas-vindas falhar
        }
    }

    async getOrCreateContact(phoneNumber, name) {
        try {
            // Formata número para busca (remove caracteres especiais)
            const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
            
            // Busca contato existente por telefone
            const searchResponse = await this.client.get(`/accounts/${this.accountId}/contacts/search`, {
                params: { q: cleanPhone }
            });

            // Verifica se encontrou contato com o mesmo telefone
            const existingContact = searchResponse.data.payload.find(contact => {
                const contactPhone = (contact.phone_number || '').replace(/[^\d]/g, '');
                return contactPhone === cleanPhone;
            });

            if (existingContact) {
                console.log(`✅ Contato existente encontrado: ${existingContact.id}`);
                return existingContact;
            }

            // Cria novo contato com telefone em formato E.164
            const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
            
            const createResponse = await this.client.post(`/accounts/${this.accountId}/contacts`, {
                name: name || `WhatsApp ${phoneNumber}`,
                phone_number: formattedPhone
            });

            console.log(`✅ Novo contato criado: ${createResponse.data.payload.contact.id}`);
            return createResponse.data.payload.contact;
        } catch (error) {
            console.error('❌ Erro ao gerenciar contato:', error.response?.data || error.message);
            throw error;
        }
    }

    async getOrCreateConversation(inboxId, contactId) {
        try {
            // Busca conversas do contato
            const response = await this.client.get(`/accounts/${this.accountId}/contacts/${contactId}/conversations`);
            
            // Procura por conversa aberta na mesma inbox
            const activeConversation = response.data.payload.find(conv => 
                conv.inbox_id === inboxId && conv.status === 'open'
            );

            if (activeConversation) {
                console.log(`✅ Conversa aberta encontrada: ${activeConversation.id}`);
                return activeConversation;
            }

            // Cria nova conversa
            const createResponse = await this.client.post(`/accounts/${this.accountId}/conversations`, {
                source_id: `whatsapp_${contactId}_${Date.now()}`,
                inbox_id: inboxId,
                contact_id: contactId,
                status: 'open'
            });

            console.log(`✅ Nova conversa criada: ${createResponse.data.id}`);
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
