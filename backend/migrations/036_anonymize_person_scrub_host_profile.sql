-- 036_anonymize_person_scrub_host_profile.sql
-- Extend anonymize_person() (035) to also scrub the account-holder's profile
-- PII. Hosts live in `profiles`, not `people`, so without this an erasure
-- request from a host would leave their name/phone/bio/socials/contact email
-- intact. Linked via email -> auth.users.id -> profiles.id. Keeps
-- stripe_connected_account_id (payouts/accounting), is_admin, and login stats.
-- Does NOT remove the auth login or a host's events/payouts — that account
-- offboarding is a separate, deliberate step.

create or replace function public.anonymize_person(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := lower(trim(p_email));
  v_ids      uuid[];
  v_outbox   uuid[];
  v_count    int := 0;
  v_profiles int := 0;
begin
  if v_email is null or v_email = '' then
    return jsonb_build_object('ok', false, 'error', 'email required');
  end if;

  select array_agg(id) into v_ids    from people        where lower(email) = v_email;
  select array_agg(id) into v_outbox  from email_outbox  where lower(to_email) = v_email;

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

  -- Account-holder (host) profile PII.
  update profiles set
    name = null, bio = null, profile_picture_url = null, mobile_number = null,
    branding_links = null, additional_emails = null, third_party_accounts = null,
    contact_email = null, brand = null, brand_website = null, brand_logo_url = null,
    host_brief = null, city = null, visitor_id = null
  where id in (select id from auth.users where lower(email) = v_email);
  get diagnostics v_profiles = row_count;

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
    'outbox_redacted',   coalesce(array_length(v_outbox, 1), 0),
    'profiles_scrubbed', coalesce(v_profiles, 0)
  );
end;
$$;
