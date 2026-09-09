# OTP de telefone no ambiente local

O Shifuh usa o mesmo fluxo de `signInWithOtp` e `verifyOtp` em desenvolvimento e producao. Em producao, a verificacao real de telefone depende de um provedor de SMS configurado no Supabase hospedado. Para desenvolvimento local, o Supabase Auth permite mapear numeros de teste para codigos OTP fixos sem enviar SMS.

## Configuracao local

1. Copie `supabase/config.example.toml` para `supabase/config.toml`.
2. No arquivo local, adicione a tabela `auth.sms.test_otp` e defina um numero de teste e um codigo de 6 digitos.
3. Nao remova `supabase/config.toml` do `.gitignore` e nunca versione o numero/codigo usado nos testes.
4. Inicie o Supabase local com a CLI e use `supabase status` para obter a URL local, a chave publica e a chave de servico.
5. Preencha `.env.local` com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` apontando para o ambiente local.
6. Inicie o Shifuh e abra `/auth/phone` autenticado por email.
7. Informe o mesmo telefone mapeado no `config.toml`, solicite o codigo e confirme usando o OTP local definido.

## O que deve ser validado

- o frontend continua chamando o Supabase Auth real, sem bypass no aplicativo;
- `verifyOtp` retorna uma sessao valida para o usuario verificador;
- `/api/customer/phone/link` valida o token no servidor;
- o telefone passa a ficar confirmado no Auth local;
- `customer_phone_accounts` e o perfil sao sincronizados;
- `returnUrl` e preservado;
- pontos, premios e eventual giro pendente sao recarregados ao retornar para a vitrine.

## Seguranca

O OTP fixo e exclusivo do Supabase local. Nao existe codigo mestre, fallback de desenvolvimento ou atalho equivalente no frontend/backend do Shifuh, e a producao continua exigindo uma verificacao de telefone emitida pelo Supabase Auth.
