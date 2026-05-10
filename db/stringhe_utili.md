# Stringhe utili

## Cancellazione account

Sostituire solo `utente@example.com` con l'email dell'account da eliminare.

> Nota: la query è dentro un blocco di codice per preservare correttamente `count(*)` quando viene copiata da Markdown.

```sql
with input_email as (
  select lower(trim('utente@example.com')) as email
),
target_user as (
  select au.id, au.email
  from auth.users au
  join input_email i on lower(trim(au.email)) = i.email
),
deleted_invitations as (
  delete from app.organization_invitations oi
  using input_email i
  where lower(trim(oi.email)) = i.email
     or oi.owner_user_id in (select id from target_user)
     or oi.invited_by_user_id in (select id from target_user)
     or oi.accepted_by_user_id in (select id from target_user)
  returning oi.id
),
deleted_auth_user as (
  delete from auth.users au
  using target_user tu
  where au.id = tu.id
  returning au.id, au.email
)
select
  (select count(*) from deleted_auth_user) as utenti_registrati_eliminati,
  (select count(*) from deleted_invitations) as inviti_eliminati;
```
