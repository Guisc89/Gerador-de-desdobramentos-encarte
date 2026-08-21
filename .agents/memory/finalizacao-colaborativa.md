---
name: Finalização colaborativa
description: Regra de segurança para preservar o histórico mensal quando várias instâncias gravam o mesmo encarte.
---

A finalização mensal deve arquivar os dados de forma imutável antes de remover o estado atual, registrar a intenção em um marcador durável e publicar o histórico por um ponteiro protegido por fencing. Toda nova mutação deve concluir ou descartar com segurança uma rotação pendente antes de começar.

**Why:** Um lock com prazo de expiração não basta: uma instância pausada pode voltar depois que outra assumiu o lock, e uma falha de armazenamento pode acontecer depois da exclusão do estado mas antes da publicação do histórico. Sem recuperação e fencing, o mês pode sumir ou um histórico antigo pode vencer um novo.

**How to apply:** Ao alterar persistência, finalização ou histórico, mantenha arquivos de rotação imutáveis, recuperação anterior a qualquer nova mutação e publicação CAS que rejeite fences antigos. Teste concorrência entre processos e retomada no ponto após a exclusão do estado.