# ADR-001 - Telas como fonte principal dos formatos digitais

## Contexto

Telas, Cards e Stories utilizam praticamente os mesmos produtos, preços, descrições e imagens.

Se cada formato mantivesse uma cópia totalmente independente dessas informações, uma correção poderia ser feita em um formato e esquecida nos demais.

## Decisão

Utilizar as Telas como composição principal dos formatos digitais.

Cards e Stories reutilizam essa estrutura sempre que possível.

## Motivo

Reduzir divergências entre materiais e evitar a manutenção da mesma informação em vários lugares.

## Consequências

### Positivas

- maior consistência;
- menos retrabalho;
- atualização mais simples;
- menor risco de diferenças entre formatos.

### Limitações

- Cards e Stories passam a depender da estrutura das Telas;
- mudanças nessa composição precisam considerar os formatos derivados.
