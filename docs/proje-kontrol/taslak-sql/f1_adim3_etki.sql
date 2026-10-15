  -- Faz 1 · Adım 3 · uygulama sonrası etki (Oturum 1d) — 09.10.2026
  -- Bugün canlıda iptal görev yok; Adım 3 (A7 iptal filtreleri, A8) kurulunca mevcut projelerin ilerlemesi değişmemeli.
  -- Her proje için ilerleme, kayıtlı değer ve yeniden hesaplanmış değer olarak iki kez ölçülür:
  --   [ONCE]  B1+B2+B4+F1 kurulu, Adım 3 kurulmadan; [SONRA] Adım 3 kurulduktan sonra.
  -- Yeniden hesaplama: projenin bir görevinde progress_pct = progress_pct (eski ve yeni trigger'ı aynı şekilde tetikler).
  -- Okuma RPC'leri admin oturumuyla çağrılır. Oturum hatayla bittiği için hiçbir değişiklik kalmaz.
  -- [ONCE]
  create temp table etki_olcum (asama text, prefix text, kayitli int, hesaplanan int, overall text,
                                kat_agirlik text, s_egrisi int, items int, santiye int, ozet_total bigint);
  create function pg_temp.etki(p_asama text) returns void language plpgsql as $f$
  declare r record; v_k int; j jsonb; s jsonb; v_t bigint;
  begin
    for r in select p.id, coalesce(prs.prefix, p.id) prefix from public.projects p
             left join public.project_register_settings prs on prs.project_id = p.id order by 2 loop
      select progress into v_k from public.projects where id = r.id;
      update public.project_tasks set progress_pct = progress_pct
       where id = (select id from public.project_tasks where project_id = r.id order by id limit 1);
      perform set_config('request.jwt.claims',
        (select json_build_object('sub', id, 'role', 'authenticated')::text from public.profiles where role_key = 'admin' order by id limit 1), true);
      set local role authenticated;
      j := public.get_project_by_date(r.id, current_date);
      s := public.get_santiye_dashboard(r.id, current_date);
      select total_tasks into v_t from public.vw_project_progress_summary where project_id = r.id;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      insert into etki_olcum values (p_asama, r.prefix, v_k, (select progress from public.projects where id = r.id),
        j ->> 'overall_pct', left(md5((j -> 'category_weights')::text), 8), jsonb_array_length(j -> 'tasks'),
        jsonb_array_length(j -> 'progress_items'), jsonb_array_length(s -> 'progress_items'), v_t);
    end loop;
  end $f$;
  perform pg_temp.etki('once');
  -- [SONRA]
  perform pg_temp.etki('sonra');
  select string_agg(o.prefix || ' ilerleme ' || o.kayitli || '/' || o.hesaplanan || '→' || s.hesaplanan
           || ' overall ' || o.overall || '→' || s.overall
           || ' ağırlık ' || o.kat_agirlik || case when o.kat_agirlik = s.kat_agirlik then '=' else '≠' || s.kat_agirlik end
           || ' görev ' || o.s_egrisi || '/' || o.items || '/' || o.santiye || '/' || o.ozet_total
           || case when (o.s_egrisi, o.items, o.santiye, o.ozet_total) = (s.s_egrisi, s.items, s.santiye, s.ozet_total)
                   then '' else '→' || s.s_egrisi || '/' || s.items || '/' || s.santiye || '/' || s.ozet_total end,
           E'\n' order by o.prefix),
         -- kayıtlı ≠ yeniden hesaplanan bugünkü bir bayatlıktır, taslaktan bağımsız: gösterilir, ölçüt değildir
         bool_and(o.hesaplanan = s.hesaplanan and o.overall is not distinct from s.overall
                  and o.kat_agirlik = s.kat_agirlik
                  and (o.s_egrisi, o.items, o.santiye, o.ozet_total) = (s.s_egrisi, s.items, s.santiye, s.ozet_total))
    into v, ok
    from etki_olcum o join etki_olcum s on s.prefix = o.prefix and s.asama = 'sonra'
   where o.asama = 'once';
  out := out || E'\nETKI (kayıtlı/önce→sonra; görev = S-eğrisi/ilerleme kalemi/şantiye/özet): '
             || case when ok then 'GEÇTİ' else 'KALDI' end || E'\n' || v;
