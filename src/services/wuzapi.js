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

    async sendTextMessage(phoneNumber, message) {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`📤 Enviando TEXTO via WuzAPI para: ${cleanNumber}`);
            console.log(`💬 Conteúdo: ${message}`);

            const response = await this.client.post('/chat/send/text', {
                Phone: cleanNumber,
                Body: message
            }, {
                params: { token: this.token }
            });

            console.log('✅ Texto enviado com sucesso!');
            return response.data;
        } catch (error) {
            console.error('❌ Erro ao enviar texto:', error.response?.data || error.message);
            throw error;
        }
    }

    async sendImageMessage(phoneNumber, imageUrl, caption = '') {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`📸 Enviando IMAGEM via WuzAPI para: ${cleanNumber}`);
            console.log(`🔗 URL: ${imageUrl}`);
            console.log(`📝 Legenda: ${caption || '(sem legenda)'}`);

            const response = await this.client.post('/chat/send/image', {
                Phone: cleanNumber,
                Image: imageUrl,
                Caption: caption
            }, {
                params: { token: this.token }
            });

            console.log('✅ Imagem enviada com sucesso!');
            return response.data;
        } catch (error) {
            console.error('❌ Erro ao enviar imagem:', error.response?.data || error.message);
            throw error;
        }
    }

    async sendVideoMessage(phoneNumber, videoUrl, caption = '') {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`🎥 Enviando VÍDEO via WuzAPI para: ${cleanNumber}`);
            console.log(`🔗 URL: ${videoUrl}`);
            console.log(`📝 Legenda: ${caption || '(sem legenda)'}`);

            const response = await this.client.post('/chat/send/video', {
                Phone: cleanNumber,
                Video: videoUrl,
                Caption: caption
            }, {
                params: { token: this.token }
            });

            console.log('✅ Vídeo enviado com sucesso!');
            return response.data;
        } catch (error) {
            console.error('❌ Erro ao enviar vídeo:', error.response?.data || error.message);
            throw error;
        }
    }

    async sendAudioMessage(phoneNumber, audioUrl) {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`🎵 Enviando ÁUDIO via WuzAPI para: ${cleanNumber}`);
            console.log(`🔗 URL: ${audioUrl}`);

            const response = await this.client.post('/chat/send/audio', {
                Phone: cleanNumber,
                Audio: audioUrl
            }, {
                params: { token: this.token }
            });

            console.log('✅ Áudio enviado com sucesso!');
            return response.data;
        } catch (error) {
            console.error('❌ Erro ao enviar áudio:', error.response?.data || error.message);
            throw error;
        }
    }

    async sendDocumentMessage(phoneNumber, documentUrl, fileName = 'document') {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`📄 Enviando DOCUMENTO via WuzAPI para: ${cleanNumber}`);
            console.log(`🔗 URL: ${documentUrl}`);
            console.log(`📝 Nome: ${fileName}`);

            const response = await this.client.post('/chat/send/document', {
                Phone: cleanNumber,
                Document: documentUrl,
                FileName: fileName
            }, {
                params: { token: this.token }
            });

            console.log('✅ Documento enviado com sucesso!');
            return response.data;
        } catch (error) {
            console.error('❌ Erro ao enviar documento:', error.response?.data || error.message);
            throw error;
        }
    }

    // Método genérico que detecta o tipo e chama o método apropriado
    async sendMessage(phoneNumber, content, attachments = []) {
        try {
            // Se tem anexos, processa cada um
            if (attachments && attachments.length > 0) {
                for (const attachment of attachments) {
                    const fileUrl = attachment.data_url;
                    const fileType = attachment.file_type || '';
                    const fileName = attachment.file_name || 'file';

                    if (fileType.startsWith('image/')) {
                        await this.sendImageMessage(phoneNumber, fileUrl, content);
                    } else if (fileType.startsWith('video/')) {
                        await this.sendVideoMessage(phoneNumber, fileUrl, content);
                    } else if (fileType.startsWith('audio/')) {
                        await this.sendAudioMessage(phoneNumber, fileUrl);
                    } else {
                        await this.sendDocumentMessage(phoneNumber, fileUrl, fileName);
                    }
                }
            } else if (content) {
                // Sem anexos, envia texto
                await this.sendTextMessage(phoneNumber, content);
            }
        } catch (error) {
            console.error('❌ Erro ao enviar mensagem:', error.message);
            throw error;
        }
    }
}

module.exports = WuzAPIService;
