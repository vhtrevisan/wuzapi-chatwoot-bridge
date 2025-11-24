const axios = require('axios');

class WuzAPIService {
    constructor(config) {
        this.baseUrl = config.wuzapi_url;
        this.token = config.wuzapi_token;
        
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            }
        });
    }

    async sendMessage(phoneNumber, message) {
        try {
            const response = await this.client.post('/send-message', {
                phone: phoneNumber,
                message: message
            });
            return response.data;
        } catch (error) {
            console.error('❌ Erro ao enviar mensagem pelo WuzAPI:', error.response?.data || error.message);
            throw error;
        }
    }

    async getSessionStatus() {
        try {
            const response = await this.client.get('/status');
            return response.data;
        } catch (error) {
            console.error('❌ Erro ao verificar status da sessão:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = WuzAPIService;
