# ADR-003 - Geração de arquivos em lotes

## Contexto

Quando a campanha possui muitas telas, gerar tudo dentro de uma única requisição pode exigir muito tempo e memória.

Durante o uso, esse cenário começou a gerar falhas e risco de timeout no ambiente publicado.

## Decisão

Dividir a geração em pequenas partes e finalizar o resultado somente depois que todas forem processadas.

## Motivo

Evitar que uma única requisição fique responsável por dezenas de renderizações pesadas.

## Fluxo

```text
Iniciar job
   ↓
Gerar parte 1
   ↓
Gerar parte 2
   ↓
...
   ↓
Finalizar job
   ↓
Montar resultado
```

## Consequências

### Positivas

- menor risco de timeout;
- melhor controle do progresso;
- possibilidade de retentativa;
- processamento mais previsível.

### Limitações

- fluxo de geração fica mais complexo;
- é necessário armazenar temporariamente as partes do job.
