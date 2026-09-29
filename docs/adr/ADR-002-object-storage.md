# ADR-002 - Object Storage como persistência compartilhada

## Contexto

No ambiente publicado, a aplicação pode utilizar autoscale.

Isso significa que uma requisição pode ser processada por uma instância e a próxima por outra.

Arquivos salvos apenas no disco local de uma máquina não estariam necessariamente disponíveis para as demais.

## Decisão

Utilizar Object Storage para manter os dados e arquivos que precisam continuar disponíveis entre requisições e instâncias.

## Motivo

Ter uma fonte compartilhada e persistente para:

- estado da campanha;
- arquivos gerados;
- imagens;
- jobs de geração;
- histórico.

## Consequências

### Positivas

- suporte ao autoscale;
- menor risco de perda em reinicialização;
- arquivos disponíveis independentemente da instância.

### Limitações

- aumenta a complexidade da persistência;
- exige controle de concorrência e versionamento.
