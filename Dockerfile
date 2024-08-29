# Etapa 1: Compilação do código TypeScript
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar arquivos de configuração do npm
COPY package*.json ./

# Instalar dependências do projeto
RUN npm install

# Copiar todo o código para o container
COPY . .

# Compilar o código TypeScript para JavaScript
RUN npm run build

# Etapa 2: Configuração do ambiente de produção
FROM node:18-alpine

WORKDIR /app

# Copiar apenas o código compilado da etapa anterior
COPY --from=builder /app/dist ./dist

# Copiar arquivos de configuração do npm
COPY package*.json ./

# Instalar apenas as dependências necessárias para produção
RUN npm install --only=production

# Definir a variável de ambiente NODE_ENV como produção
ENV NODE_ENV=production

# Expor a porta 3000 para acesso à aplicação
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["node", "dist/index.js"]
