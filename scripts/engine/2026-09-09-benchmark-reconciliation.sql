-- Actual token usage priced by the route register: 0.415293 USD.
-- Run once after engine migrations; idempotent. No model call is made.
begin;
insert into public.brain_budget_months(month_start,hard_limit_usd)
select '2026-09-01'::date,hard_limit_usd from public.engine_settings where id=1 on conflict do nothing;
select month_start from public.brain_budget_months where month_start='2026-09-01'::date for update;
with charges(id,month_start,model,actual_usd,request_id) as (values
('b10653eb-b158-403d-95c6-3d74be7b1b37'::uuid,'2026-09-01'::date,'openai/gpt-5.6-luna',0.0020862000000000003,'resp_0bb51fda553f1f66006aa13b3ef0e887d299a37e28f844e7de'),
('2aa580e1-c653-42b9-ba16-7f59ac196a87'::uuid,'2026-09-01'::date,'openai/gpt-5.6-luna',0.00144456,'resp_0156c3b8bd64ff61006aa13b488fc887d2ac508d6c22e98e40'),
('9e8539ce-c25a-4ba2-ad00-949a15b50542'::uuid,'2026-09-01'::date,'openai/gpt-5.6-luna',0.00163896,'resp_0dab71d9aec7a060006aa13b509ce887d2a035ef9f991f18fd'),
('ab11d73d-61e3-4852-b48b-8aca5305ed81'::uuid,'2026-09-01'::date,'openai/gpt-5.6-luna',0.00131076,'resp_0f3032a6a087a0ab006aa13b5935c487d2b1a1a44223e05b0f'),
('d08c620d-e240-4bdf-987e-e7d85d6c5534'::uuid,'2026-09-01'::date,'openai/gpt-5.6-luna',0.00162876,'resp_041b89afd95d6425006aa13b5fe76487d2a700c48373a3a7dd'),
('f3d3b9ff-fe08-473c-a200-58644713ff0f'::uuid,'2026-09-01'::date,'openai/gpt-5.6-luna',0.00126356,'resp_0a34d62008307381006aa13b6861f887d2a2db884abf1a638f'),
('a60eaf0f-145e-4600-a62a-bca1923d990c'::uuid,'2026-09-01'::date,'openai/gpt-5.6-luna',0.0013399599999999998,'resp_017bc371eb249a6d006aa13b727b3487d28f0badfaa1243b7d'),
('c15adae0-976f-46c2-992b-cc9f49a1fd3c'::uuid,'2026-09-01'::date,'openai/gpt-5.6-luna',0.0010771599999999997,'resp_0b4ba6b6af3618b9006aa13b7a3bdc87d28942c5e8028c84e1'),
('227ba106-ec57-47d5-9d94-10b023c24e81'::uuid,'2026-09-01'::date,'openai/gpt-5.4-mini',0.00811575,'resp_0c355ec38498c504006aa13b809d6c87d2a8a6086f1731e247'),
('682631aa-5318-4650-b5d1-fc3c5d483940'::uuid,'2026-09-01'::date,'openai/gpt-5.4-mini',0.0055106999999999995,'resp_04f28276b077d3ba006aa13b8d854887d2b8081cbf46520d9e'),
('f0d30b8b-66b3-44fa-8b9a-2467f66c758e'::uuid,'2026-09-01'::date,'openai/gpt-5.4-mini',0.0060596999999999995,'resp_039473ba8259c837006aa13b92ebdc87d2959539c9bf53e804'),
('fc372e32-0665-44dc-aa4f-f9f67b2bd0f1'::uuid,'2026-09-01'::date,'openai/gpt-5.4-mini',0.00598995,'resp_00701922ff185eb0006aa13b9b277c87d2bd99ae48b003f3a1'),
('17bfd884-10bf-40c2-9795-b65c5139ea81'::uuid,'2026-09-01'::date,'openai/gpt-5.4-mini',0.00436995,'resp_01605fe6e01d32ba006aa13ba1accc87d29246c47859fc212f'),
('eb6a3ec2-8f8f-4cb2-9a9e-a8463a5f67a8'::uuid,'2026-09-01'::date,'openai/gpt-5.4-mini',0.00484095,'resp_0600c4bc3b72fe0b006aa13ba6cb7087d2a1d3a1e52eee5eb6'),
('aa849ca6-092c-47e6-9976-42a959b4875d'::uuid,'2026-09-01'::date,'openai/gpt-5.4-mini',0.0062479499999999995,'resp_02a130cc39d3fcc6006aa13bacad1887d2a0a6c587d8824aac'),
('a4f3dce3-7216-4845-ac7f-1064d642dc7c'::uuid,'2026-09-01'::date,'openai/gpt-5.4-mini',0.00418695,'resp_01ce831429771b3f006aa13bb4269087d2bd0988225a38fa34'),
('f81aef02-d24a-4026-a929-19ce25d8663e'::uuid,'2026-09-01'::date,'openai/gpt-5.6-terra',0.023154,'resp_02b801853144eeb1006aa13bb8c5cc87d2b0a8ec42aa78e297'),
('354e4998-1631-4e0f-8506-5656d804d9bd'::uuid,'2026-09-01'::date,'openai/gpt-5.6-terra',0.0170256,'resp_0fd3e88b71c9dca0006aa13bcef4c887d2917536c998a7a2ac'),
('72069fd4-9d24-4f33-944b-b3ea2e5af62c'::uuid,'2026-09-01'::date,'openai/gpt-5.6-terra',0.0233256,'resp_0e0dff3bd663aa94006aa13be17be887d2aec60ef5d1c4093f'),
('543b20ee-5e9b-4b25-a7bc-62e57170a487'::uuid,'2026-09-01'::date,'openai/gpt-5.6-terra',0.015783600000000002,'resp_09e26580c138ff73006aa13bfa60d087d2ad782636e71d2b61'),
('891120c6-0632-4447-aabe-163864376dcd'::uuid,'2026-09-01'::date,'openai/gpt-5.6-terra',0.0162396,'resp_0454a0ddb83a0d61006aa13c0ae17087d2af89f9f70c740f42'),
('a8d42436-28a3-4ccb-803c-0f4731fba930'::uuid,'2026-09-01'::date,'openai/gpt-5.6-terra',0.0116276,'resp_0605fa2ac9e0a0f7006aa13c1e194887d2b553efe33ac540be'),
('67f181ad-155e-44e1-8879-e8279fd15cdb'::uuid,'2026-09-01'::date,'openai/gpt-5.6-terra',0.027199599999999997,'resp_074e09d503448fab006aa13c2c670887d2868b15ac67724b68'),
('9fc9f3ce-284d-403b-b2c3-843bc69a5b4a'::uuid,'2026-09-01'::date,'openai/gpt-5.6-terra',0.0093316,'resp_0608252b3bd5c0a6006aa13c4fd18087d2a68e777a4b26749e'),
('4a7f5d3a-9301-4f89-babd-5dc32039ff19'::uuid,'2026-09-01'::date,'openai/gpt-5.6-sol',0.0347,'resp_0946cab4ab746162006aa13c5977e087d2b6374fbb65d957e1'),
('c21f4dbe-6ba2-4aaf-927f-e9a3ec7d456a'::uuid,'2026-09-01'::date,'openai/gpt-5.6-sol',0.0274752,'resp_05cf773253a5b5dd006aa13c6a9f0487d2b0a2cf6d099dbba3'),
('6fa7e69b-992f-4974-81de-10acd8a53255'::uuid,'2026-09-01'::date,'openai/gpt-5.6-sol',0.0306632,'resp_0ae0a09b922704dc006aa13c81850087d2829e710ee8785ddb'),
('7b3bcc7e-3bbd-44d2-b3d2-598905cd00f1'::uuid,'2026-09-01'::date,'openai/gpt-5.6-sol',0.0254352,'resp_02852ee00b56abc2006aa13c98f1bc87d2a40b82a1ca1e0d58'),
('49807a32-ce1b-444e-a721-dbacce8774c9'::uuid,'2026-09-01'::date,'openai/gpt-5.6-sol',0.0236192,'resp_006ba6bfaa8099e6006aa13caaa6dc87d2bec6026e0191ff9a'),
('fd340fbc-15f1-4ec0-8f15-d3d9c38c2af1'::uuid,'2026-09-01'::date,'openai/gpt-5.6-sol',0.0255392,'resp_039eebd6ea83ade9006aa13cbea94487d2bf144a120fb80d22'),
('f187a45a-8e4a-4aef-bb44-9012715d7782'::uuid,'2026-09-01'::date,'openai/gpt-5.6-sol',0.024631200000000002,'resp_0aa99f9a3a9e8d66006aa13cd3dfdc87d28374e9b6ad34fc1a'),
('58e7b4d3-6a55-4f3e-8000-1c39e3bbaba3'::uuid,'2026-09-01'::date,'openai/gpt-5.6-sol',0.022431200000000002,'resp_0f671fbaa42549a2006aa13ce7f40487d2ae126af87994c5d6'))
insert into public.brain_ai_usage(id,month_start,request_kind,model,reservation_usd,actual_usd,status,source,task,provider_request_id,metadata,finalized_at)
select id,month_start,'synthetic_panel_benchmark',model,0,actual_usd,'completed','benchmark','synthetic_panel_benchmark',request_id,'{"import":"local-synthetic-benchmark-2026-09-09"}'::jsonb,now()
from charges c where not exists(select 1 from public.brain_ai_usage u where u.provider_request_id=c.request_id) on conflict(id) do nothing;
update public.brain_budget_months b set spent_usd=(select coalesce(sum(u.actual_usd),0) from public.brain_ai_usage u where u.month_start=b.month_start and u.status='completed')
where b.month_start='2026-09-01'::date;
commit;
