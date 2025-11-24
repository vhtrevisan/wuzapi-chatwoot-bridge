const axios = require('axios');

class WuzAPIService {
    constructor(config) {
        this.baseUrl = config.wuzapi_url;
        this.token = config.wuzapi_token;
        
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async sendMessage(phoneNumber, message) {
        try {
            // Limpa o número de telefone (remove tudo exceto dígitos)
            let cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`📤 Enviando mensagem via WuzAPI para: ${cleanNumber}`);
            console.log(`💬 Texto: ${message}`);

            const response = await this.client.post('/chat/send/text', {
                Phone: cleanNumber,
                Body: message
            }, {
                params: {
                    token: this.token
                }
            });

            console.log('✅ Resposta do WuzAPI:', response.data);
            return response.data;
        } catch (error) {
            console.error('❌ Erro ao enviar mensagem via WuzAPI:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = WuzAPIService;
