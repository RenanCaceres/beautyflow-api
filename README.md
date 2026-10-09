<div align="center">

<a href="https://github.com/RenanCaceres/beautyflow-api">
  <img
    src="https://capsule-render.vercel.app/api?type=waving&height=220&section=header&text=BeautyFlow%20API&fontSize=46&fontColor=ffffff&fontAlignY=38&desc=REST%20API%20%7C%20Gest%C3%A3o%20para%20Sal%C3%B5es%20%7C%20Node.js%20%7C%20PostgreSQL%20%7C%20Gemini%20AI&descAlignY=58&descSize=16&animation=fadeIn&color=0:0d0b1f,50:21134f,100:4c1d95"
    width="100%"
    alt="BeautyFlow API Header"
  />
</a>

<img
  src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=19&duration=3000&pause=1000&color=A78BFA&center=true&vCenter=true&width=800&lines=API+REST+para+Gest%C3%A3o+de+Sal%C3%B5es+de+Beleza+%26+Est%C3%A9tica;Node.js+%E2%80%A2+Express+%E2%80%A2+PostgreSQL+%E2%80%A2+Google+Gemini+AI;Agendamentos%2C+M%C3%BAltiplos+Servi%C3%A7os%2C+Caixa+%26+Consumo;Marketing+Inteligente+com+IA+para+Retorno+de+Clientes"
  alt="Typing SVG"
/>

<br>

<img src="https://img.shields.io/badge/Node.js-v22+-312E81?style=for-the-badge&logo=nodedotjs&logoColor=white" />
<img src="https://img.shields.io/badge/Express.js-4.x-5B21B6?style=for-the-badge&logo=express&logoColor=white" />
<img src="https://img.shields.io/badge/PostgreSQL-Database-4C1D95?style=for-the-badge&logo=postgresql&logoColor=white" />
<img src="https://img.shields.io/badge/Google_Gemini-Gen_AI-6D28D9?style=for-the-badge&logo=google&logoColor=white" />
<img src="https://img.shields.io/badge/Status-Ativo-10B981?style=for-the-badge" />

<br><br>

<a href="https://github.com/RenanCaceres">
  <img src="https://img.shields.io/badge/GitHub-RenanCaceres-181717?style=for-the-badge&logo=github" />
</a>
<a href="https://www.linkedin.com/in/renan-caceres/">
  <img src="https://img.shields.io/badge/LinkedIn-Renan%20Cáceres-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" />
</a>
<a href="mailto:renancanselmo@gmail.com">
  <img src="https://img.shields.io/badge/Email-renancanselmo%40gmail.com-6D28D9?style=for-the-badge&logo=gmail&logoColor=white" />
</a>

</div>

---

# 📖 Sobre o Projeto

O **BeautyFlow API** é o núcleo de backend do ecossistema **BeautyFlow**, uma plataforma completa desenhada para a gestão ágil e moderna de salões de beleza, barbearias, manicures e clínicas de estética.

A aplicação fornece uma **API RESTful** robusta, eficiente e segura, conectada a um banco relacional **PostgreSQL**, além de contar com um diferencial inovador: **módulos de inteligência artificial generativa integrados ao Google Gemini**. O sistema resolve problemas reais de micro e pequenas empresas do setor de beleza, facilitando o agendamento de atendimentos, controle financeiro em tempo real e automação humanizada de pós-atendimento para retenção e fidelização de clientes.

---

# 🌟 Funcionalidades Principais

### 👥 Gestão de Clientes
- Cadastro completo, listagem alfabética, edição e remoção de clientes.
- Busca preditiva e filtragem rápida por nome ou número de telefone.
- Histórico dinâmico com identificação do último serviço e data do último atendimento realizado.

### 💇 Catálogo de Serviços
- Registro de procedimentos com valores tabelados e estimativas de tempo.
- Parametrização individual de **intervalo ideal de retorno** (em dias), permitindo monitorar o ciclo de vida e a recorrência de cada serviço (ex: limpeza de pele a cada 30 dias, design de sobrancelha a cada 21 dias).

### 📅 Agendamentos & Múltiplos Procedimentos
- Criação e acompanhamento de agendamentos com data e hora.
- Suporte a **múltiplos serviços por agendamento** (relação N:N via tabela associativa `agendamento_servicos`).
- Controle de ciclo de atendimento com status: `agendado`, `realizado` e `cancelado`.
- Fluxo de **baixa de atendimento** com flexibilidade para ajustes de valor final negociado e inclusão de observações técnicas.

### 💰 Fluxo de Caixa & Gestão Financeira
- **Entradas**: Totalização das receitas baseadas nos atendimentos com status `realizado`.
- **Saídas**: Registro de despesas com produtos, materiais de consumo e insumos de trabalho.
- **Relatórios Consolidados**: Consulta em tempo real de entradas, saídas e lucro líquido com agrupamento flexível por **dia**, **mês** ou **ano**.

### 🔄 Inteligência de Retorno (Customer Retention)
- Cruzamento automatizado do histórico de atendimento com o ciclo ideal cadastrado em cada procedimento.
- Classificação imediata de clientes por status de retorno:
  - 📌 **Hoje**: clientes cuja data de retorno ideal é a data atual.
  - ⏳ **Próximos 3 dias**: clientes prestes a necessitar de novo atendimento.
  - 📅 **Próximos 7 dias**: planejamento semanal de contato.
  - ⚠️ **Vencidas**: clientes com retorno atrasado para ações de resgate.

### 🤖 Marketing com Inteligência Artificial (Google Gemini)
- **Mensagens Humanizadas de Retorno**: Geração de copies personalizadas e gentis com **Google Gemini 3.1 Flash Lite**, formatadas especificamente para envio via WhatsApp sem parecer spam ou texto robótico.
- **Assistente Interativo de Campanhas**: Endpoint de chat conversacional para confecção iterativa de templates promocionais em massa utilizando o marcador `{{nome}}`.

---

# 🏗️ Arquitetura do Sistema

```mermaid
flowchart TD
    subgraph Clients["📱 Clientes / Frontends"]
        direction LR
        Mobile["BeautyFlow Mobile\n(React Native / Expo)"]
        Web["BeautyFlow Web\n(React / Vite)"]
    end

    subgraph API["✿ BeautyFlow API (Express & Node.js)"]
        direction TB
        Middlewares["CORS & Body Parsers\nError Handler Central"]
        Routes["Rotas REST\n(/clientes, /servicos, /agendamentos,\n/caixa, /consumo, /retorno, /marketing)"]
        Models["Modelos de Domínio & Queries SQL\n(pg Pool Connection)"]
    end

    subgraph External["☁️ Dados & IA"]
        direction TB
        Postgres[("PostgreSQL\nBanco Relacional")]
        Gemini["Google Gemini AI\n(@google/genai)"]
    end

    Mobile -->|HTTP / JSON| Middlewares
    Web -->|HTTP / JSON| Middlewares
    Middlewares --> Routes
    Routes --> Models
    Models -->|Queries Parametrizadas| Postgres
    Routes -->|Prompts Especializados| Gemini
```

---

# 🛠️ Tech Stack

### 💻 Backend & Runtime
<p align="left">
  <img src="https://skillicons.dev/icons?i=nodejs,express,javascript" />
</p>

- **Node.js** (v22+) — Ambiente de execução JavaScript rápido e escalável.
- **Express.js** (4.x) — Framework web minimalista para construção da API REST.
- **pg (node-postgres)** — Driver nativo de alta performance para PostgreSQL com pool de conexões.
- **dotenv** — Gerenciamento seguro de variáveis de ambiente.
- **cors** — Controle seguro de políticas de acesso entre origens.

### 🗄️ Banco de Dados
<p align="left">
  <img src="https://skillicons.dev/icons?i=postgres" />
</p>

- **PostgreSQL** — Banco relacional com integridade referencial, foreign keys em cascata, agregações JSON (`JSON_AGG`) e subqueries laterais (`LATERAL JOIN`).

### 🤖 Inteligência Artificial
<p align="left">
  <img src="https://img.shields.io/badge/Google_Gen_AI-Gemini_3.1_Flash_Lite-8B5CF6?style=for-the-badge&logo=google&logoColor=white" />
</p>

- **@google/genai** — SDK oficial do Google para integração com o modelo Gemini 3.1 Flash Lite, garantindo baixa latência e respostas assertivas.

---

# 🔌 Endpoints da API

A API segue os padrões RESTful com respostas em formato JSON.

### 🩺 Health Check
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Verifica a integridade e disponibilidade da API |

### 👥 Clientes (`/api/clientes`)
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/clientes` | Lista todos os clientes ordenados por nome com histórico recente |
| `GET` | `/api/clientes/search?q=:termo` | Busca clientes por nome ou telefone |
| `GET` | `/api/clientes/:id` | Retorna os detalhes de um cliente específico |
| `POST` | `/api/clientes` | Cadastra um novo cliente |
| `PUT` | `/api/clientes/:id` | Atualiza os dados de um cliente existente |
| `DELETE` | `/api/clientes/:id` | Remove um cliente e seus dados vinculados |

### 💇 Serviços (`/api/servicos`)
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/servicos` | Lista todos os serviços oferecidos |
| `GET` | `/api/servicos/:id` | Detalhes de um serviço específico |
| `POST` | `/api/servicos` | Cadastra um novo serviço |
| `PUT` | `/api/servicos/:id` | Atualiza informações de um serviço |
| `DELETE` | `/api/servicos/:id` | Remove um serviço do catálogo |

### 📅 Agendamentos (`/api/agendamentos`)
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/agendamentos?data=YYYY-MM-DD` | Lista agendamentos filtrados por data |
| `GET` | `/api/agendamentos/:id` | Retorna detalhes do agendamento com lista de serviços |
| `POST` | `/api/agendamentos` | Cria um agendamento (suporta múltiplos `servico_ids`) |
| `PUT` | `/api/agendamentos/:id` | Edita os dados e serviços de um agendamento |
| `PATCH` | `/api/agendamentos/:id/baixa` | Registra a conclusão/baixa do agendamento e valor final |
| `DELETE` | `/api/agendamentos/:id` | Exclui um agendamento |

### 💰 Fluxo de Caixa & Consumo
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/caixa?periodo=mes&mes=10&ano=2026` | Relatório consolidado (entradas, saídas e lucros) |
| `GET` | `/api/consumo?mes=10&ano=2026` | Lista despesas e materiais de consumo registrados |
| `POST` | `/api/consumo` | Registra uma nova despesa ou consumo de produto |
| `DELETE` | `/api/consumo/:id` | Remove um registro de consumo |

### 🔄 Retorno de Clientes (`/api/retorno`)
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/retorno?filtro=todas` | Retorna todos os clientes com análise de retorno |
| `GET` | `/api/retorno?filtro=hoje` | Clientes que devem retornar hoje |
| `GET` | `/api/retorno?filtro=3dias` | Clientes com retorno ideal nos próximos 3 dias |
| `GET` | `/api/retorno?filtro=7dias` | Clientes com retorno ideal nos próximos 7 dias |
| `GET` | `/api/retorno?filtro=vencidas` | Clientes com prazo de retorno em atraso |

### 🤖 Marketing & Inteligência Artificial (`/api/marketing`)
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `POST` | `/api/marketing/mensagem-retorno` | Gera mensagem humanizada para WhatsApp com base no cliente e serviço |
| `POST` | `/api/marketing/chat` | Chat interativo com Gemini para criação de templates com `{{nome}}` |

---

# 🚀 Como Executar o Projeto

### 📋 Pré-requisitos
Certifique-se de ter instalado em seu ambiente:
- **Node.js** (versão 18.0.0 ou superior, recomendado v22+)
- **NPM** ou **Yarn**
- **PostgreSQL** instalado localmente ou rodando via container Docker
- Chave de API do **Google Gemini** ([Google AI Studio](https://aistudio.google.com/))

---

### 1. Clonar o Repositório
```bash
git clone https://github.com/RenanCaceres/beautyflow-api.git
cd beautyflow-api
```

### 2. Instalar as Dependências
```bash
npm install
```

### 3. Configurar as Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto com base no arquivo `.env.example`:
```bash
cp .env.example .env
```

Edite o arquivo `.env` com as configurações do seu ambiente:
```env
# Conexão com o banco PostgreSQL
DATABASE_URL=postgresql://usuario:senha@localhost:5432/beautyflow

# Configuração da aplicação
NODE_ENV=development
PORT=3000

# Origens permitidas para requisições CORS (separadas por vírgula)
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Chave de API para as funcionalidades com IA do Google Gemini
GEMINI_API_KEY=sua_chave_do_google_gemini_aqui
```

### 4. Configurar o Banco de Dados
Crie o banco de dados `beautyflow` no PostgreSQL e execute o script de inicialização:
```bash
# Exemplo via CLI psql
psql -U postgres -d beautyflow -f database/setup.sql
```
> O script `database/setup.sql` cria automaticamente todas as tabelas, relacionamentos, constraints de integridade e insere dados iniciais de demonstração (seed).

### 5. Iniciar o Servidor

Modo de desenvolvimento (com recarregamento automático via Nodemon):
```bash
npm run dev
```

Modo de produção:
```bash
npm start
```

A API estará disponível em: **`http://localhost:3000`** (ou na porta configurada).  
Teste a disponibilidade acessando: **`http://localhost:3000/api/health`**

---

# 🔒 Segurança e Boas Práticas

- **Prevenção contra SQL Injection**: Todas as consultas ao banco de dados utilizam consultas parametrizadas (*Prepared Statements* do driver `pg`).
- **Isolamento de Credenciais**: Nenhuma chave de API ou credencial sensível é versionada no repositório. O arquivo `.env` está devidamente listado no `.gitignore`.
- **Política de CORS Configurável**: O middleware de CORS restringe o acesso aos domínios definidos na variável `CORS_ORIGINS`, permitindo também requisições diretas de apps mobile e ferramentas de homologação.
- **Tratamento Centralizado de Erros**: Middleware de erro Express para captura de falhas inesperadas sem vazamento de detalhes internos do sistema.

---

# 👨‍💻 Autor

<div align="center">

<a href="https://github.com/RenanCaceres">
  <img src="https://img.shields.io/badge/Renan%20Cáceres-GitHub-181717?style=for-the-badge&logo=github&logoColor=white" />
</a>
<a href="https://www.linkedin.com/in/renan-caceres/">
  <img src="https://img.shields.io/badge/Renan%20Cáceres-LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" />
</a>
<a href="mailto:renancanselmo@gmail.com">
  <img src="https://img.shields.io/badge/Contato-renancanselmo%40gmail.com-6D28D9?style=for-the-badge&logo=gmail&logoColor=white" />
</a>

<br><br>

💜 *Desenvolvido com dedicação para simplificar a gestão de beleza com tecnologia e inteligência artificial.*

<br>

<img
  src="https://capsule-render.vercel.app/api?type=waving&height=120&section=footer&color=0:4c1d95,50:21134f,100:0d0b1f"
  width="100%"
  alt="BeautyFlow API Footer"
/>

</div>
