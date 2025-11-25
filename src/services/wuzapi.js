const axios = require('axios');

class WuzAPIService {
    constructor(config) {
        this.baseUrl = config.wuzapi_url;
        this.token = config.wuzapi_token;
        
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 45000 // TIMEOUT DE 45 SEGUNDOS (aumentado)
        });
    }

    /**
     * Adiciona ID de mensagem ao cache para evitar duplicação
     */
    addMessageToCache(messageId) {
        if (messageId) {
            try {
                const webhookRouter = require('../routes/webhook');
                if (webhookRouter.addToChatwootCache) {
                    webhookRouter.addToChatwootCache(messageId);
                }
            } catch (err) {
                console.log('⚠️ Não foi possível adicionar ao cache:', err.message);
            }
        }
    }

    /**
     * Aguarda um delay (para retry com backoff)
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Calcula delay para retry (backoff exponencial otimizado)
     * Tentativa 1: 2s, 2: 5s, 3: 10s, 4: 15s, 5: 20s
     */
    getRetryDelay(retryCount) {
        const delays = [2000, 5000, 10000, 15000, 20000];
        return delays[retryCount] || 20000;
    }

    /**
     * Baixa um arquivo de uma URL e converte para Base64
     */
    async downloadAndConvertToBase64(url, mimeType) {
        try {
            console.log(`⬇️ Baixando arquivo de: ${url.substring(0, 100)}...`);
            
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 45000, // 45 segundos para download
                maxContentLength: 100 * 1024 * 1024, // 100MB max
                maxBodyLength: 100 * 1024 * 1024
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

    /**
     * Envia mensagem de texto com RETRY OTIMIZADO
     */
    async sendTextMessage(phoneNumber, message, retryCount = 0) {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`📤 Enviando TEXTO via WuzAPI para: ${cleanNumber}`);
            console.log(`💬 Conteúdo: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);

            const response = await this.client.post('/chat/send/text', {
                Phone: cleanNumber,
                Body: message
            }, {
                params: { token: this.token }
            });

            console.log('✅ Texto enviado com sucesso!');
            
            const messageId = response.data?.data?.Id;
            this.addMessageToCache(messageId);
            
            return response.data;
            
        } catch (error) {
            // RETRY COM DELAYS MAIORES: 2s, 5s, 10s, 15s, 20s
            if (error.response?.status === 500 && retryCount < 5) {
                const delay = this.getRetryDelay(retryCount);
                console.log(`⚠️ Erro 500 detectado - Aguardando ${delay}ms antes de tentar novamente (tentativa ${retryCount + 1}/5)`);
                await this.sleep(delay);
                return this.sendTextMessage(phoneNumber, message, retryCount + 1);
            }
            
            console.error('❌ Erro ao enviar texto:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Envia imagem com RETRY OTIMIZADO
     */
    async sendImageMessage(phoneNumber, imageData, caption = '', retryCount = 0) {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`📸 Enviando IMAGEM via WuzAPI para: ${cleanNumber}`);
            console.log(`📝 Legenda: ${caption || '(sem legenda)'}`);

            const response = await this.client.post('/chat/send/image', {
                Phone: cleanNumber,
                Image: imageData,
                Caption: caption
            }, {
                params: { token: this.token },
                timeout: 60000 // 60s para imagens grandes
            });

            console.log('✅ Imagem enviada com sucesso!');
            
            const messageId = response.data?.data?.Id;
            this.addMessageToCache(messageId);
            
            return response.data;
            
        } catch (error) {
            if (error.response?.status === 500 && retryCount < 5) {
                const delay = this.getRetryDelay(retryCount);
                console.log(`⚠️ Erro 500 detectado - Aguardando ${delay}ms antes de tentar novamente (tentativa ${retryCount + 1}/5)`);
                await this.sleep(delay);
                return this.sendImageMessage(phoneNumber, imageData, caption, retryCount + 1);
            }
            
            console.error('❌ Erro ao enviar imagem:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Envia vídeo com RETRY OTIMIZADO
     */
    async sendVideoMessage(phoneNumber, videoData, caption = '', retryCount = 0) {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`🎥 Enviando VÍDEO via WuzAPI para: ${cleanNumber}`);
            console.log(`📝 Legenda: ${caption || '(sem legenda)'}`);

            const response = await this.client.post('/chat/send/video', {
                Phone: cleanNumber,
                Video: videoData,
                Caption: caption
            }, {
                params: { token: this.token },
                timeout: 90000 // 90s para vídeos grandes
            });

            console.log('✅ Vídeo enviado com sucesso!');
            
            const messageId = response.data?.data?.Id;
            this.addMessageToCache(messageId);
            
            return response.data;
            
        } catch (error) {
            if (error.response?.status === 500 && retryCount < 5) {
                const delay = this.getRetryDelay(retryCount);
                console.log(`⚠️ Erro 500 detectado - Aguardando ${delay}ms antes de tentar novamente (tentativa ${retryCount + 1}/5)`);
                await this.sleep(delay);
                return this.sendVideoMessage(phoneNumber, videoData, caption, retryCount + 1);
            }
            
            console.error('❌ Erro ao enviar vídeo:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Envia áudio com RETRY OTIMIZADO E DELAYS MAIORES
     */
    async sendAudioMessage(phoneNumber, audioData, retryCount = 0) {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`🎵 Enviando ÁUDIO via WuzAPI para: ${cleanNumber}`);

            const response = await this.client.post('/chat/send/audio', {
                Phone: cleanNumber,
                Audio: audioData
            }, {
                params: { token: this.token },
                timeout: 60000 // 60s para áudios
            });

            console.log('✅ Áudio enviado com sucesso!');
            
            const messageId = response.data?.data?.Id;
            this.addMessageToCache(messageId);
            
            return response.data;
            
        } catch (error) {
            // RETRY COM DELAYS MAIORES: 2s, 5s, 10s, 15s, 20s (5 tentativas)
            if (error.response?.status === 500 && retryCount < 5) {
                const delay = this.getRetryDelay(retryCount);
                console.log(`⚠️ Erro 500 detectado - Aguardando ${delay}ms antes de tentar novamente (tentativa ${retryCount + 1}/5)`);
                await this.sleep(delay);
                return this.sendAudioMessage(phoneNumber, audioData, retryCount + 1);
            }
            
            console.error('❌ Erro ao enviar áudio:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Envia documento com RETRY OTIMIZADO
     */
    async sendDocumentMessage(phoneNumber, documentData, fileName = 'document', retryCount = 0) {
        try {
            const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
            
            console.log(`📄 Enviando DOCUMENTO via WuzAPI para: ${cleanNumber}`);
            console.log(`📝 Nome: ${fileName}`);

            const response = await this.client.post('/chat/send/document', {
                Phone: cleanNumber,
                Document: documentData,
                FileName: fileName
            }, {
                params: { token: this.token },
                timeout: 60000 // 60s para documentos
            });

            console.log('✅ Documento enviado com sucesso!');
            
            const messageId = response.data?.data?.Id;
            this.addMessageToCache(messageId);
            
            return response.data;
            
        } catch (error) {
            if (error.response?.status === 500 && retryCount < 5) {
                const delay = this.getRetryDelay(retryCount);
                console.log(`⚠️ Erro 500 detectado - Aguardando ${delay}ms antes de tentar novamente (tentativa ${retryCount + 1}/5)`);
                await this.sleep(delay);
                return this.sendDocumentMessage(phoneNumber, documentData, fileName, retryCount + 1);
            }
            
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
                        else if (fileName.match(/\.png$/i)) mimeType = 'image/png';
                        
                        base64Data = await this.downloadAndConvertToBase64(fileUrl, mimeType);
                        await this.sendImageMessage(phoneNumber, base64Data, content);
                        
                    } else if (fileType === 'video') {
                        let mimeType = 'video/mp4';
                        if (fileName.match(/\.mov$/i)) mimeType = 'video/quicktime';
                        else if (fileName.match(/\.avi$/i)) mimeType = 'video/x-msvideo';
                        else if (fileName.match(/\.mkv$/i)) mimeType = 'video/x-matroska';
                        
                        base64Data = await this.downloadAndConvertToBase64(fileUrl, mimeType);
                        await this.sendVideoMessage(phoneNumber, base64Data, content);
                        
                    } else if (fileType === 'audio') {
                        // WuzAPI aceita vários formatos, mas OGG é o mais confiável
                        let mimeType = 'audio/ogg';
                        if (fileName.match(/\.mp3$/i)) mimeType = 'audio/mpeg';
                        else if (fileName.match(/\.wav$/i)) mimeType = 'audio/wav';
                        else if (fileName.match(/\.m4a$/i)) mimeType = 'audio/mp4';
                        
                        console.log(`🎵 Tipo de áudio detectado: ${mimeType}`);
                        
                        base64Data = await this.downloadAndConvertToBase64(fileUrl, mimeType);
                        await this.sendAudioMessage(phoneNumber, base64Data);
                        
                        // Se tem texto junto com áudio, envia em mensagem separada
                        if (content && content.trim() !== '' && content !== 'empty') {
                            await this.sendTextMessage(phoneNumber, content);
                        }
                        
                    } else {
                        // CRÍTICO: WuzAPI SEMPRE EXIGE application/octet-stream para documentos
                        console.log(`📄 Documento detectado: ${fileName}`);
                        
                        // FORÇA application/octet-stream independente da extensão
                        const mimeType = 'application/octet-stream';
                        
                        console.log(`🔧 Usando MIME type obrigatório: ${mimeType}`);
                        
                        base64Data = await this.downloadAndConvertToBase64(fileUrl, mimeType);
                        await this.sendDocumentMessage(phoneNumber, base64Data, fileName);
                    }
                }
            } 
            
            // Se tem texto sem anexos (e não é "empty")
            if (content && content.trim() !== '' && content !== 'empty' && attachments.length === 0) {
                await this.sendTextMessage(phoneNumber, content);
            }

        } catch (error) {
            console.error('❌ Erro ao enviar mensagem:', error.message);
            throw error;
        }
    }
}

module.exports = WuzAPIService;
