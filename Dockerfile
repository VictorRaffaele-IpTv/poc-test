# Dockerfile para a API AVI
FROM node:18-alpine

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar git e ferramentas necessárias
RUN apk add --no-cache git curl wget netcat-openbsd

# Instalar dependências
RUN npm ci --omit=dev

# Copiar código da aplicação
COPY . .

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Dar permissões corretas
RUN chown -R nodejs:nodejs /app

# Expor porta da API
EXPOSE 3000

# Health check para o container
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/activity?limit=1 || exit 1

# Usar usuário não-root
USER nodejs

# Comando para iniciar a aplicação
CMD ["sh", "-c", "npm run migrate && npm start"]