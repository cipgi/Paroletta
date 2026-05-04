-- Enforce DB-level references from user subscriptions/profiles to app.subscription_plans(code)

alter table app.profiles
  drop constraint if exists profiles_piano_check;

alter table app.subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table app.profiles
  add constraint profiles_piano_fk
  foreign key (piano)
  references app.subscription_plans(code)
  on update cascade
  on delete restrict;

alter table app.subscriptions
  add constraint subscriptions_plan_fk
  foreign key (plan)
  references app.subscription_plans(code)
  on update cascade
  on delete restrict;
