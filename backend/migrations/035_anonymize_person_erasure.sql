-- 035_anonymize_person_erasure.sql
-- GDPR right-to-erasure helper. Anonymises a data subject's PII across the app
-- by EMAIL, keeping the de-identified skeleton (attendance counts, financial
-- aggregates) so analytics stay intact — "delete the identity, keep the shape".
-- We anonymise rather than hard-delete because people rows cascade to rsvps /
-- campaign_sends / person_notes, which would destroy the host's analytics.
-- Payment/accounting figures (total_spend, stripe_customer_id) are retained as
-- required by Swedish accounting law (7 years).
--
-- Fulfilment path: POST /admin/erase-person { email } -> anonymizePersonByEmail
-- -> this function. Account-holder offboarding (auth login + hosted events/
-- payouts) is handled separately and deliberately.

alter table public.people add column if not exists anonymized_at timestamptz;

create or replace function public.anonymize_person(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(trim(p_email));
  v_ids     uuid[];
  v_outbox  uuid[];
  v_count   int := 0;
begin
  if v_email is null or v_email = '' then
    return jsonb_build_object('ok', false, 'error', 'email required');
  end if;

  select array_agg(id) into v_ids    from people        where lower(email) = v_email;
  select array_agg(id) into v_outbox  from email_outbox  where lower(to_email) = v_email;

  -- Email engagement tied to this person's sent emails: drop IP + UA, then
  -- redact bodies/recipient (capture ids first — the to_email match is lost
  -- once redacted). person_vector_input is a VIEW derived from people, so it
  -- reflects the scrubbed base row automatically (do not update it directly).
  if v_outbox is not null then
    update email_opens  set ip_address = null, user_agent = null where outbox_id = any(v_outbox);
    update email_clicks set ip_address = null, user_agent = null where outbox_id = any(v_outbox);
    update email_outbox set to_email = 'redacted@anonymized.invalid', html_body = null, text_body = null
      where id = any(v_outbox);
  end if;

  delete from newsletter_subscriptions where lower(email) = v_email;
  delete from email_suppressions        where lower(email) = v_email;

  update vip_invites             set email = 'redacted@anonymized.invalid', token = null where lower(email) = v_email;
  update event_host_invitations  set email = 'redacted@anonymized.invalid'                where lower(email) = v_email;
  update ideas                   set user_email = null, user_name = null                 where lower(user_email) = v_email;

  if v_ids is not null then
    delete from person_notes where person_id = any(v_ids);
    update campaign_sends set email = 'redacted@anonymized.invalid'    where person_id = any(v_ids);
    update rsvps          set custom_answers = null, visitor_id = null where person_id = any(v_ids);

    update people set
      email                       = 'deleted+' || id::text || '@anonymized.invalid',
      name                        = 'Deleted user',
      phone = null, instagram = null, twitter = null, tiktok = null,
      linkedin = null, company = null, birthday = null,
      import_metadata = null,
      marketing_unsubscribe_token = null,
      auth_user_id = null,
      marketing_consent = false,
      do_not_contact = true,
      marketing_unsubscribed_at = coalesce(marketing_unsubscribed_at, now()),
      anonymized_at = now()
    where id = any(v_ids);

    v_count := array_length(v_ids, 1);
  end if;

  return jsonb_build_object(
    'ok', true,
    'people_anonymized', coalesce(v_count, 0),
    'outbox_redacted',   coalesce(array_length(v_outbox, 1), 0)
  );
end;
$$;
