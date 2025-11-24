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

    /**
     * Baixa um arquivo de uma URL e converte para Base64
     */
    async downloadAndConvertToBase64(url, mimeType) {
        try {
            console.log(`⬇️ Baixando arquivo de: ${url}`);
            
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000
            });

            const base64 = Buffer.from(response.data, 'binary').toString('base64');
            const dataUri = `data:${mimeType};base64,${base64}`;
            
            console.log(`✅ Arquivo convertido para Base64 (${Math.round(base64.length / 1024)}KB)`);
            
            return dataUri;
        } catch (error) {
            console.error('❌ Erro ao baixar/converter arquivo:', error.message);
            throw new Error(`Falha ao processar arquivo: ${error.message}`);
        }
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

    async sendImageMessage(phoneNumber, imageData, caption = '') {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`📸 Enviando IMAGEM via WuzAPI para: ${cleanNumber}`);
            console.log(`📝 Legenda: ${caption || '(sem legenda)'}`);

            const response = await this.client.post('/chat/send/image', {
                Phone: cleanNumber,
                Image: imageData,
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

    async sendVideoMessage(phoneNumber, videoData, caption = '') {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`🎥 Enviando VÍDEO via WuzAPI para: ${cleanNumber}`);
            console.log(`📝 Legenda: ${caption || '(sem legenda)'}`);

            const response = await this.client.post('/chat/send/video', {
                Phone: cleanNumber,
                Video: videoData,
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

    async sendAudioMessage(phoneNumber, audioData) {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`🎵 Enviando ÁUDIO via WuzAPI para: ${cleanNumber}`);

            const response = await this.client.post('/chat/send/audio', {
                Phone: cleanNumber,
                Audio: audioData
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

    async sendDocumentMessage(phoneNumber, documentData, fileName = 'document') {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`📄 Enviando DOCUMENTO via WuzAPI para: ${cleanNumber}`);
            console.log(`📝 Nome: ${fileName}`);

            const response = await this.client.post('/chat/send/document', {
                Phone: cleanNumber,
                Document: documentData,
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

    /**
     * Método genérico que detecta o tipo e chama o método apropriado
     */
    async sendMessage(phoneNumber, content, attachments = []) {
        try {
            // Se tem anexos, processa cada um
            if (attachments && attachments.length > 0) {
                for (const attachment of attachments) {
                    const fileUrl = attachment.data_url;
                    let fileType = attachment.file_type || '';
                    const fileName = attachment.file_name || 'file';

                    console.log(`📎 Processando anexo: ${fileName}`);
                    console.log(`📋 Tipo original: "${fileType}"`);

                    // Normaliza o tipo de arquivo
                    if (fileType === 'image' || fileType.startsWith('image/')) {
                        fileType = 'image';
                    } else if (fileType === 'video' || fileType.startsWith('video/')) {
                        fileType = 'video';
                    } else if (fileType === 'audio' || fileType.startsWith('audio/')) {
                        fileType = 'audio';
                    } else {
                        fileType = 'document';
                    }

                    console.log(`✅ Tipo detectado: ${fileType}`);

                    // Baixa e converte para Base64
                    let base64Data;
                    
                    if (fileType === 'image') {
                        let mimeType = 'image/png';
                        if (fileName.match(/\.jpe?g$/i)) mimeType = 'image/jpeg';
                        else if (fileName.match(/\.gif$/i)) mimeType = 'image/gif';
                        else if (fileName.match(/\.webp$/i)) mimeType = 'image/webp';
                        
                        base64Data = await this.downloadAndConvertToBase64(fileUrl, mimeType);
                        await this.sendImageMessage(phoneNumber, base64Data, content);
                        
                    } else if (fileType === 'video') {
                        let mimeType = 'video/mp4';
                        if (fileName.match(/\.mov$/i)) mimeType = 'video/quicktime';
                        else if (fileName.match(/\.avi$/i)) mimeType = 'video/x-msvideo';
                        
                        base64Data = await this.downloadAndConvertToBase64(fileUrl, mimeType);
                        await this.sendVideoMessage(phoneNumber, base64Data, content);
                        
                    } else if (fileType === 'audio') {
                        // WuzAPI só aceita audio/ogg - força OGG sempre
                        base64Data = await this.downloadAndConvertToBase64(fileUrl, 'audio/ogg');
                        await this.sendAudioMessage(phoneNumber, base64Data);
                        
                        // Se tem texto junto com áudio, envia em mensagem separada
                        if (content) {
                            await this.sendTextMessage(phoneNumber, content);
                        }
                        
                    } else {
                        // Documento genérico
                        base64Data = await this.downloadAndConvertToBase64(fileUrl, 'application/octet-stream');
                        await this.sendDocumentMessage(phoneNumber, base64Data, fileName);
                    }
                }
            } 
            
            // Se tem texto sem anexos
            if (content && attachments.length === 0) {
                await this.sendTextMessage(phoneNumber, content);
            }

        } catch (error) {
            console.error('❌ Erro ao enviar mensagem:', error.message);
            throw error;
        }
    }
}

module.exports = WuzAPIService;
