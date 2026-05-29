-- 042_anonymize_person_whatsapp.sql
-- Extend anonymize_person() (035, 036) to also scrub the new WhatsApp +
-- phone-identity surface. Without this, a right-to-erasure request would
-- leave a person's phone_e164, opt-ins, magic-link history, and
-- whatsapp_outbox bodies fully intact — undoing the existing scrub.
--
-- Resolution path: the function is keyed by email (existing contract),
-- so we find matching people, collect their phone_e164 values, and
-- scrub the WhatsApp tables by phone.

create or replace function public.anonymize_person(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text := lower(trim(p_email));
  v_ids       uuid[];
  v_outbox    uuid[];
  v_phones    text[];
  v_wa_outbox uuid[];
  v_count     int := 0;
  v_profiles  int := 0;
  v_wa_count  int := 0;
begin
  if v_email is null or v_email = '' then
    return jsonb_build_object('ok', false, 'error', 'email required');
  end if;

  select array_agg(id)         into v_ids    from people       where lower(email) = v_email;
  select array_agg(id)         into v_outbox from email_outbox where lower(to_email) = v_email;

  -- Collect every phone we know about for this human, across both people
  -- (CRM contact) and profiles (host account-holder). E.164 column is the
  -- authoritative one; freeform `phone` may also exist on legacy rows.
  select array_agg(distinct ph) into v_phones
  from (
    select phone_e164 as ph from people   where id = any(coalesce(v_ids, '{}'::uuid[])) and phone_e164 is not null
    union
    select phone_e164 as ph from profiles where id in (select id from auth.users where lower(email) = v_email) and phone_e164 is not null
  ) s;

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

  -- Host profile PII (including new structured phone columns).
  update profiles set
    name = null, bio = null, profile_picture_url = null, mobile_number = null,
    branding_links = null, additional_emails = null, third_party_accounts = null,
    contact_email = null, brand = null, brand_website = null, brand_logo_url = null,
    host_brief = null, city = null, visitor_id = null,
    phone_e164 = null, phone_country = null, phone_carrier = null,
    phone_verified_at = null, phone_verification_source = null
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
      phone_e164 = null, phone_country = null, phone_carrier = null,
      phone_verified_at = null, phone_verification_source = null,
      whatsapp_capable_at = null,
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

  -- WhatsApp surface --------------------------------------------------
  if v_phones is not null and array_length(v_phones, 1) > 0 then
    select array_agg(id) into v_wa_outbox
      from whatsapp_outbox
     where to_phone_e164 = any(v_phones);

    if v_wa_outbox is not null then
      update whatsapp_outbox set
        to_phone_e164 = '+10000000000',   -- E.164-shaped placeholder so format check holds
        body_text     = null,
        body_media    = null,
        raw_payload   = null,
        template_variables = null,
        last_error_message = null
      where id = any(v_wa_outbox);
      v_wa_count := array_length(v_wa_outbox, 1);
    end if;

    delete from phone_opt_ins      where phone_e164 = any(v_phones);
    delete from magic_link_tokens  where phone_e164 = any(v_phones);
    delete from whatsapp_threads   where phone_e164 = any(v_phones);
    delete from whatsapp_suppressions where phone_e164 = any(v_phones);
  end if;

  return jsonb_build_object(
    'ok', true,
    'people_anonymized', coalesce(v_count, 0),
    'outbox_redacted',   coalesce(array_length(v_outbox, 1), 0),
    'profiles_scrubbed', coalesce(v_profiles, 0),
    'whatsapp_redacted', v_wa_count,
    'phones_scrubbed',   coalesce(array_length(v_phones, 1), 0)
  );
end;
$$;
