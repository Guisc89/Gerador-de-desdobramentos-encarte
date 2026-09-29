# Documentação do Sistema - Gerador de Desdobramentos do Encarte

## 1. Visão geral

O Gerador de Desdobramentos do Encarte foi criado para automatizar parte do processo de produção dos materiais derivados do encarte.

Antes do sistema, os desdobramentos eram produzidos manualmente em arquivos separados. A equipe precisava pegar as informações da planilha comercial e repetir o processo de copiar, colar, ajustar e organizar os produtos em diferentes formatos.

Eu tive contato direto com esse processo durante alguns meses e foi justamente aí que percebi que existia uma oportunidade clara de automação.

A lógica que meu guiou no projeto foi:

> Se os dados dos produtos já chegam organizados em uma planilha, não faz sentido uma pessoa precisar transcrever as mesmas informações várias vezes para formatos diferentes.

O objetivo do sistema é automatizar essa repetição sem retirar da equipe a etapa de revisão, ajuste e aprovação.

---

## 2. Conteto do processo

O processo começa no Comercial, que prepara a planilha com informações como produtos, preços, apresentações e demais dados utilizados na campanha.

O encarte principal continua sendo desenvolvido no Adobe InDesign.

Depois dele, são produzidos os desdobramentos:

- Preçários;
- Telas;
- Cards;
- Stories.

Antes da automação, esses materiais eram montados manualmente, principalmente em arquivos do Adobe Illustrator.

As planilhas normalmente possuem dezenas de produtos, muitas vezes mais de 50 itens. Como as mesmas informações precisam aparecer em vários formatos, o volume de trabalho aumentava rapidamente.

---

## 3. Processo anterior - AS iS

### Entrada

O Comercial envia a planilha com os produtos e preços da campanha.

### Produção manual

A equipe de Marketing utilizava essa planilha como referência e fazia a transcrição manual das informações para os arquivos dos desdobramentos.

O processo envolvia:

1. localizar o produto na planilha;
2. copiar nome, apresentação e preço;
3. colar ou digitar no arquivo gráfico;
4. ajustar formatação;
5. localizar ou copiar a imagem do produto;
6. posicionar o item;
7. repetir o processo para os demais produtos;
8. repetir novamente para outros formatos.

Em alguns casos, a imagem podia ser aproveitada do próprio encarte. Quando o produto estava em uma composição ou agrupado com outros itens, era necessário procurar a imagem individualmente.

### Problemas percebidos

Os principais problemas eram:

- excesso de trabalho repetitivo;
- tempo elevado de produção;
- possibilidade de erro ao copiar ou digitar informações;
- retrabalho;
- dependência de atenção constante durante tarefas mecânicas;
- repetição dos mesmos dados em arquivos diferentes.

O processo manual dos desdobramentos chegava a ocupar aproximadamente uma semana de trabalho de duas pessoas.

---

## 4. Processo atual - TO BE

Com o sistema, a planilha comercial continua sendo a entrada do processo.

A diferença é que ela passa a ser interpretada pela aplicação.

Fluxo atual:

```text
Comercial prepara a planilha
        ↓
Marketing importa a planilha
        ↓
Sistema interpreta os produtos
        ↓
Sistema organiza nome, apresentação e preço
        ↓
Sistema monta os materiais
        ↓
Marketing adiciona/revisa imagens
        ↓
Marketing e Comercial conferem
        ↓
Arquivos finais são gerados
        ↓
PDF / PNG / ZIP
```

A automação ficou concentrada principalmente na parte repetitiva.

A revisão continua sendo humana.

Isso é importante porque o sistema não decide se um preço comercial está certo ou errado. Se a informação de origem estiver errada, o sistema tende a reproduzi-la. A validação comercial continua fazendo parte do processo.

---

## 5. Atores envolvidos

### Marketing

Responsável por:

- selecionar a campanha;
- importar a planilha;
- conferir produtos;
- inserir imagens;
- ajustar materiais;
- revisar os formatos;
- gerar os arquivos finais.

### Comercial

Responsável por:

- preparar a planilha;
- fornecer produtos e preços;
- revisar as informações;
- realizar determinados ajustes quando necessário;
- validar o conteúdo comercial.

### Sistema

Responsável por:

- interpretar a planilha;
- estruturar os produtos;
- aplicar regras de organização;
- reaproveitar informações entre formatos;
- gerar prévias;
- gerar arquivos finais;
- manter o estado do trabalho salvo.

---

## 6. Requisitos funcionais

### RF01 - Importar planilha

O sistema deve permitir a importação da planilha Excel utilizada pelo Comercial.

### RF02 - Interpretar produtos

O sistema deve identificar os produtos e suas principais informações, mesmo quando houver pequenas variações na estrutura da planilha.

### RF03 - Organizar os produtos

O sistema deve transformar os dados da planilha em uma estrutura interna padronizada.

### RF04 - Gerar Preçários

O sistema deve gerar os Preçários a partir dos produtos importados.

### RF05 - Montar Telas

O sistema deve utilizar o catálogo de produtos para montar as Telas.

### RF06 - Gerar Cards

O sistema deve gerar Cards utilizando a composição dos produtos definida nas Telas.

### RF07 - Gerar Stories

O sistema deve gerar Stories utilizando a mesma base de produtos utilizada nas Telas.

### RF08 - Permitir associação de imagens

O usuário deve conseguir inserir imagens nos produtos.

### RF09 - Permitir pré-visualização

O usuário deve conseguir visualizar o resultado antes da geração final.

### RF10 - Permitir ajustes

O usuário deve conseguir realizar ajustes necessários antes de finalizar os materiais.

### RF11 - Gerar arquivos finais

O sistema deve gerar os materiais nos formatos necessários para distribuição, incluindo PDF, PNG e ZIP conforme o tipo de material.

### RF12 - Manter o trabalho salvo

O sistema deve permitir que o trabalho seja retomado sem precisar reconstruir toda a campanha.

---

## 7. Requisitos não funcionais

### RNF01 - Usabilidade

A interface deve ser simples o suficiente para que a equipe consiga operar o sistema sem depender de conhecimento técnico.

### RNF02 - Desempenho

As operações de prévia e geração devem ter desempenho compatível com o volume de produtos e páginas utilizado no processo real.

### RNF03 - Consistência

Os diferentes formatos devem reaproveitar a mesma base de dados sempre que representarem o mesmo produto.

### RNF04 - Confiabilidade

O sistema deve evitar perda de trabalho em reinicializações, atualizações ou acessos simultâneos.

### RNF05 - Qualidade de saída

Os materiais finais devem manter resolução e proporções compatíveis com o uso previsto.

### RNF06 - Manutenibilidade

As regras e templates devem ser organizados de forma que ajustes futuros possam ser realizados sem reconstruir o sistema inteiro.

---

## 8. Regras de negócio principais

### RN01 - A planilha é a fonte dos dados comerciais

O sistema utiliza as informações presentes na planilha como entrada.

Ele não determina se um preço comercial está correto.

### RN02 - RS e MS são contextos separados

As campanhas de RS e MS devem possuir estados independentes porque podem ter produtos, preços e planilhas diferentes.

### RN03 - Telas são a composição principal dos formatos digitais

Cards e Stories reaproveitam a estrutura organizada nas Telas para reduzir divergências entre materiais.

### RN04 - Produtos com apresentações diferentes podem possuir imagens diferentes

A identidade utilizada para associar imagens considera o produto e sua apresentação.

### RN05 - Capa de Cards e Stories

A capa deve trabalhar com 2 produtos.

### RN06 - Páginas internas de Cards e Stories

As páginas internas podem trabalhar com 2 a 4 produtos.

### RN07 - Revisão humana permanece obrigatória

O sistema automatiza a montagem, mas a conferência e aprovação continuam sendo responsabilidade das pessoas envolvidas no processo.

---

## 9. Casos de uso principais

### UC01 - Importar planilha

**Ator:** Marketing

**Fluxo:**

1. usuário seleciona a campanha;
2. escolhe RS ou MS;
3. envia a planilha;
4. sistema interpreta o arquivo;
5. produtos são exibidos para conferência.

**Resultado esperado:** catálogo de produtos disponível no sistema.

### UC02 - Inserir imagens

**Ator:** Marketing

**Fluxo:**

1. usuário localiza o produto;
2. copia uma imagem adequada;
3. cola no sistema;
4. aplicação associa a imagem ao produto;
5. imagem é reaproveitada nos formatos relacionados.

### UC03 - Revisar materiais

**Atores:** Marketing e Comercial

**Fluxo:**

1. materiais são montados;
2. equipe confere produtos, preços, imagens e composição;
3. ajustes necessários são realizados;
4. material é validado.

### UC04 - Gerar arquivos finais

**Ator:** Marketing

**Fluxo:**

1. usuário solicita geração;
2. sistema renderiza os materiais;
3. arquivos são processados;
4. sistema disponibiliza PDF, PNG ou ZIP.

### UC05 - Finalizar campanha

**Ator:** Marketing

**Fluxo:**

1. campanha é concluída;
2. usuário solicita finalização;
3. sistema arquiva o estado anterior;
4. ambiente fica disponível para o próximo ciclo.

---

## 10. Arquitetura em alto nível

A aplicação funciona no modelo cliente-servidor.

```text
Usuário
  ↓
Frontend Web
  ↓
API Express / Node.js / TypeScript
  ↓
Serviços da aplicação
  ├─ leitura de Excel
  ├─ regras de produtos
  ├─ templates
  ├─ geração de imagens/PDF
  └─ persistência
  ↓
Object Storage / PostgreSQL
```

### Frontend

Responsável pela interface, organização visual, inserção de imagens e prévias.

### Backend

Responsável pelas regras, importação, geração dos materiais, autenticação e persistência.

### Persistência

O PostgreSQL é utilizado para sessões.

O Object Storage é utilizado para manter estado, arquivos, jobs e histórico compartilhados entre as instâncias da aplicação.

---

## 11. Fluxo dos dados

A primeira transformação importante acontece quando a planilha deixa de ser tratada apenas como arquivo Excel.

Depois da importação, os produtos são convertidos para uma estrutura interna.

Exemplo conceitual:

```json
{
  "nome": "Produto X",
  "descricao": "30 comprimidos",
  "precoInteiro": "19",
  "precoCentavos": "99"
}
```

A partir disso, as demais partes do sistema trabalham com produtos estruturados e não diretamente com posições de células da planilha.

Esse ponto foi importante porque reduziu a dependência do layout original do Excel.

---

## 12. Principais decisões técnicas

Algumas decisões apareceram somente depois que o sistema começou a ser usado de verdade.

### Reaproveitar a mesma informação entre formatos

Eu não queria que Telas, Cards e Stories se transformassem em três versões independentes da mesma campanha.

Por isso, Telas passaram a servir como composição principal e os outros formatos reutilizam essa informação.

### Comprimir imagens antes de enviar

No começo, imagens em alta resolução faziam o estado da aplicação crescer muito.

Isso começou a causar problemas de tamanho de requisição.

A solução foi tratar as imagens no navegador antes de enviá-las.

### Separar renderização e montagem do PDF

Quando a quantidade de telas aumentou, gerar um PDF inteiro dentro do Chromium começou a consumir muita memória.

A solução foi deixar o navegador responsável pela renderização das páginas e utilizar `pdf-lib` para montar o PDF final.

### Gerar em lotes

Outra limitação apareceu quando muitas telas eram geradas em uma única requisição.

O processo podia ultrapassar o tempo permitido pelo ambiente publicado.

A geração então foi dividida em partes menores.

### Utilizar armazenamento compartilhado

Com autoscale, duas requisições podem ser atendidas por máquinas diferentes.

Por isso, o disco local não poderia ser a única fonte dos arquivos e estados importantes.

O Object Storage passou a ser utilizado como persistência compartilhada.

---

## 13. Testes e validação

A validação do projeto aconteceu de duas formas.

### Validação funcional

Foi feita com o próprio processo real:

- importação de planilhas utilizadas no trabalho;
- conferência dos produtos;
- geração dos materiais;
- comparação visual;
- ajustes a partir de situações reais.

### Testes automatizados

O projeto também possui testes para pontos específicos, como:

- autenticação;
- parser de Excel;
- histórico;
- geração de arquivos;
- layout;
- filas/lotes;
- colaboração e persistência.

Não trato isso como cobertura total do sistema, mas como uma camada adicional para evitar regressões em partes mais sensíveis.

---

## 14. Segurança e confiabilidade

Algumas medidas existentes no projeto:

- sessões persistidas em PostgreSQL;
- cookie de sessão protegido;
- regeneração da sessão no login;
- validação de dados utilizados nos templates;
- bloqueio de requisições externas durante determinadas renderizações;
- controle de versão do estado para evitar sobrescrita silenciosa;
- locks em operações críticas;
- snapshots durante a finalização da campanha.

### Pontos de melhoria

O sistema ainda possui dívida técnica de autenticação.

Hoje existe uma credencial compartilhada de operador no projeto. O ideal para evolução é substituir isso por autenticação individual, segredo fora do código e controle de permissões mais estruturado.

Também é recomendável tornar obrigatório o segredo de sessão em produção e restringir políticas de acesso conforme o ambiente.

---

## 15. Resultados percebidos

O principal resultado não foi simplesmente "gerar peças mais rápido".

A mudança mais importante foi retirar da equipe boa parte da transcrição e montagem repetitiva.

Antes:

```text
Pessoa interpreta
→ copia
→ cola
→ ajusta
→ posiciona
→ repete
```

Depois:

```text
Sistema interpreta
→ organiza
→ distribui
→ monta
→ pessoa revisa
```

O processo manual dos desdobramentos chegava a ocupar aproximadamente uma semana de duas pessoas.

Hoje, o ciclo completo entre recebimento da planilha, revisão, imagens, ajustes e finalização dos quatro formatos continua dependendo de etapas humanas e pode ficar em torno de 1 a 2 dias.

Por isso, não considero correto afirmar que todo o processo caiu para poucos minutos.

O ganho está principalmente na redução do trabalho operacional de montagem e repetição.

---

## 16. Evolução do projeto

O sistema não nasceu com toda a arquitetura atual pronta.

A primeira necessidade era muito mais simples: eliminar a repetição que eu via no dia a dia.

Depois que a primeira versão começou a funcionar, surgiram problemas reais:

- imagens grandes demais;
- requisições pesadas;
- timeout na geração;
- consumo de memória;
- necessidade de manter progresso;
- diferentes campanhas de RS e MS;
- mais de uma pessoa acessando o sistema;
- risco de perder alterações.

Cada problema fez a aplicação evoluir um pouco mais.

Para mim, essa parte é importante porque representa melhor como o projeto aconteceu: eu não comecei sabendo exatamente qual arquitetura usar. Eu comecei sabendo qual problema precisava resolver.

A parte técnica foi amadurecendo conforme o sistema foi sendo testado e utilizado.

---

## 17. Desenvolvimento assistido por IA

Utilizei ferramentas de Inteligência Artificial durante o desenvolvimento.

Elas foram importantes principalmente para:

- gerar implementações;
- investigar erros;
- sugerir soluções técnicas;
- refatorar código;
- criar e ajustar testes.

Mas a origem do projeto não veio da IA.

O problema foi identificado a partir da experiência direta com o processo.

Eu sabia:

- qual era a entrada;
- quais eram os materiais gerados;
- quais informações precisavam aparecer;
- como a equipe trabalhava;
- o que estava tomando tempo;
- qual resultado eu esperava do sistema.

Meu fluxo de desenvolvimento ficou muito próximo de:

```text
Problema real
   ↓
Definição do comportamento esperado
   ↓
Implementação assistida por IA
   ↓
Teste
   ↓
Problema encontrado
   ↓
Ajuste / refatoração
   ↓
Novo teste
```

A forma que considero mais correta de apresentar o projeto é como desenvolvimento de software assistido por IA, com requisitos, regras de negócio e validação definidos a partir do processo real.

---

## 18. Resumo do projeto

O Gerador de Desdobramentos transforma uma fonte de dados que já existia em uma base reutilizável para vários materiais.

A essência da solução é:

> automatizar o que é repetitivo e manter com as pessoas aquilo que exige análise, conferência e decisão.

Foi um projeto que começou a partir de uma dor operacional do Marketing e acabou evoluindo para uma aplicação com importação de dados, regras de negócio, geração de documentos, persistência, controle de concorrência e processamento de mídia.
