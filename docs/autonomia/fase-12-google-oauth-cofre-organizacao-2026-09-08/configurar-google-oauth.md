# Conectar Google Calendar sem suporte técnico por cliente

> **Registro de produção — 2026-09-09.** O cliente OAuth web foi criado no
> projeto Google Cloud `raro-ia-508018`, as variáveis server-only foram
> gravadas no cofre de Production da Vercel e o deploy público ficou `Ready`.
> Esta configuração usa exclusivamente a URL pública canônica abaixo. Nenhum
> segredo aparece neste documento, no Git ou em arquivos locais.

> **Validação ainda necessária.** Um gestor real deve concluir o consentimento
> na tela oficial do Google. As contas sintéticas `audit.invalid` são bloqueadas
> intencionalmente e não servem para conectar uma agenda real.

## Resultado esperado

O administrador do MentorOS configura **uma única aplicação OAuth** no Google
Cloud. Depois disso, cada gestor de uma organização entra no MentorOS, abre a
integração de agenda, clica em **Conectar com o Google** e conclui o login na
tela oficial do Google. Não há campo para Client Secret, refresh token ou chave
de cifra no produto.

## Antes de começar

Esta fase está pronta no código, mas ainda depende de três ações externas do
administrador técnico:

1. aplicar as migrations locais `0044_google_calendar_conexao.sql` e
   `0045_google_oauth_estado.sql` no projeto MentorOS;
2. criar/configurar a aplicação OAuth no Google Cloud;
3. registrar as variáveis de ambiente seguras no ambiente do servidor.

Não envie valores dessas variáveis por chat, e-mail, print ou Git.

## Configuração única do administrador

1. Entre no [Google Cloud Console](https://console.cloud.google.com/) com a
   conta proprietária do produto e crie ou selecione o projeto do MentorOS.
2. Em **APIs e serviços**, habilite a **Google Calendar API**.
3. Configure a tela de consentimento OAuth com o nome do produto, contato de
   suporte, política de privacidade e os domínios reais do MentorOS. Use o tipo
   adequado à conta: externo para clientes de organizações diferentes; interno
   somente para um único Google Workspace controlado.
4. Em **Credenciais**, crie um **ID do cliente OAuth para Aplicativo da Web**.
5. Registre a URI de redirecionamento sem barra final extra. Para o cliente
   de produção atual, a única URI autorizada é:

   - `https://raro-ia.vercel.app/api/agenda/google/retorno`

   Um futuro cliente OAuth exclusivamente local pode usar
   `http://localhost:3000/api/agenda/google/retorno`, mas essa URI não pertence
   ao cliente de produção e não deve substituir a URI pública.

6. No gerenciador seguro de variáveis do servidor, cadastre sem aspas:

   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_TOKEN_ENCRYPTION_KEY`

   A última deve ser uma chave Base64 de **32 bytes**. Gere e guarde-a em um
   gerenciador de senhas ou cofre de segredos; não a troque sem plano de rotação,
   porque ela protege os vínculos já gravados.

   No Windows PowerShell, este comando gera a chave **somente na sua tela**:

   ```powershell
   $bytes = New-Object byte[] 32
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $rng.GetBytes($bytes)
   [Convert]::ToBase64String($bytes)
   ```

   Copie a saída diretamente para o cofre de variáveis e apague-a da área de
   transferência quando terminar. Não cole a saída no chat.

7. Cadastre no mesmo ambiente `NEXT_PUBLIC_SITE_URL` com a URL pública canônica
   quando houver uma. Ela evita que a URI de retorno dependa de domínio de
   preview.

## O que cada cliente faz

1. Acessa o MentorOS com uma conta de **gestor** ou **dono** da organização.
2. Abre **Integrações → Agenda** e seleciona **Conectar com o Google**.
3. Escolhe a conta Google que contém a agenda a ser usada.
4. Lê e aceita as permissões apresentadas diretamente pelo Google.
5. Volta ao MentorOS e confirma que a agenda aparece como conectada.

O produto pede somente os escopos `calendar.readonly` e `calendar.events`.
Esses escopos permitem ler a agenda e criar/atualizar/cancelar eventos de sessão
criados pelo próprio MentorOS. O aplicativo não deve editar eventos alheios.

## Segurança e operação

- O refresh token não fica em cookie, URL, HTML, log ou `.env`: ele é cifrado
  por organização no servidor.
- O state OAuth é nonce de uso único, associado ao usuário e workspace, expira
  em dez minutos e é consumido antes da troca do código.
- Desconectar no MentorOS revoga o vínculo local imediatamente. A pessoa também
  pode remover o acesso no painel de permissões da própria conta Google.
- Uma pessoa sem papel de gestão não pode criar, ler, usar ou revogar o vínculo.
- Falha de configuração deve exibir mensagem genérica ao cliente; detalhes e
  segredos pertencem apenas ao administrador técnico.

## Checklist de homologação segura

1. Em um ambiente não produtivo, aplique as migrations e cadastre as três
   variáveis no cofre do servidor.
2. Faça login com uma conta sintética de gestor e conecte uma agenda de teste.
3. Confirme que a leitura da agenda funciona e que a criação de uma sessão cria
   somente o evento marcado como originado pelo MentorOS.
4. Desconecte e confirme que novas leituras/escritas não usam mais a conta.
5. Só depois repita em produção, com autorização explícita para migrations,
   variáveis e integração real.
