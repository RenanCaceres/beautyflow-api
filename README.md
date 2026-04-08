# ✿ BeautyFlow API — Deploy Railway

## Como fazer o deploy

### 1. Criar conta no Railway
Acesse railway.app e crie conta (pode usar o GitHub).

### 2. Subir o código no GitHub
```bash
git init
git add .
git commit -m "primeiro commit"
# Crie um repositório no github.com e siga as instruções
git remote add origin https://github.com/SEU_USUARIO/beautyflow-api.git
git push -u origin main
```

### 3. Criar projeto no Railway
- Clique em "New Project"
- Escolha "Deploy from GitHub repo"
- Selecione o repositório beautyflow-api

### 4. Adicionar o banco PostgreSQL
- Dentro do projeto, clique em "+ New"
- Escolha "Database → PostgreSQL"
- O Railway cria e conecta automaticamente

### 5. Rodar o script do banco
- Clique no serviço PostgreSQL
- Vá em "Data" → "Query"
- Cole o conteúdo de database/setup.sql e execute

### 6. Configurar variáveis de ambiente
No serviço Node.js, vá em "Variables" e adicione:
```
NODE_ENV=production
CORS_ORIGINS=http://localhost:5173
```
O DATABASE_URL é adicionado automaticamente pelo Railway.

### 7. Obter a URL pública
Vá em "Settings" → "Networking" → "Generate Domain"
Sua API estará em: https://beautyflow-api-xxx.railway.app

### 8. Testar
Acesse: https://sua-url.railway.app/api/health
Deve retornar: {"ok":true}

## Atualizar o app mobile
Abra beautyflow-mobile/src/services/api.js e troque:
```js
const BASE_URL = 'https://sua-url.railway.app/api';
```
