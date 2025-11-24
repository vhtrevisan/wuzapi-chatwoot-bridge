FROM node:18-alpine

WORKDIR /app

# Cria diretório para banco de dados
RUN mkdir -p /app/data

# Copia package.json e instala dependências
COPY package*.json ./
RUN npm install --production

# Copia todo o código
COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
