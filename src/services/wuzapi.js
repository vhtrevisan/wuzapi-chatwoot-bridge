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
                    const fileName = attachment.fallback_title || attachment.file_name || 'file';

                    console.log(`📎 Processando anexo: ${fileName}`);
                    console.log(`📋 Tipo original: "${fileType}"`);

                    // Normaliza o tipo de arquivo (Chatwoot às vezes envia "image" ao invés de "image/png")
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
                        // Detecta MIME type da imagem pela extensão ou URL
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
                        let mimeType = 'audio/mpeg';
                        if (fileName.match(/\.ogg$/i)) mimeType = 'audio/ogg';
                        else if (fileName.match(/\.wav$/i)) mimeType = 'audio/wav';
                        
                        base64Data = await this.downloadAndConvertToBase64(fileUrl, mimeType);
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
            
            // Se tem texto sem anexos, ou texto adicional após anexos de imagem/vídeo
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
