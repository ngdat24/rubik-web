begin;
insert into auth.users(id) values ('c3333333-3333-4333-8333-333333333333');
insert into public.profiles(id,name) values ('c3333333-3333-4333-8333-333333333333','Leaderboard test');
insert into public.solves(id,user_id,solve,size,time_ms,ranked)
select 'board-'||i,'c3333333-3333-4333-8333-333333333333','{}',3,i,true from generate_series(1,1010) i;
insert into public.solves(id,user_id,solve,size,time_ms,ranked,deleted) values
('deleted','c3333333-3333-4333-8333-333333333333','{}',3,0,true,true),
('unranked','c3333333-3333-4333-8333-333333333333','{}',3,0,false,false),
('dnf','c3333333-3333-4333-8333-333333333333','{}',3,null,true,false),
('two','c3333333-3333-4333-8333-333333333333','{}',2,1234,true,false);
set local role service_role;
do $$ begin
 if (select count(*) from public.leaderboard_top1000(3))<>1000 then raise exception 'Wrong cap';end if;
 if (select max("timeMs") from public.leaderboard_top1000(3))<>1000 then raise exception 'Wrong order';end if;
 if (select min("timeMs") from public.leaderboard_top1000(3))<>1 then raise exception 'Eligibility';end if;
 if exists(select id,name,"timeMs" from public.leaderboard(3) except select id,name,"timeMs" from public.leaderboard_top1000(3) limit 10) then raise exception 'Rules diverged';end if;
 if (select count(*) from public.leaderboard(3))<>10 then raise exception 'Old board changed';end if;
 if (select count(*) from public.leaderboard_top1000(2))<>1 then raise exception 'Wrong size';end if;
 if exists(select from public.leaderboard_top1000(4)) then raise exception 'Unsupported size';end if;
 if has_function_privilege('anon','public.leaderboard_top1000(integer)','EXECUTE') then raise exception 'Public RPC';end if;
end $$;
rollback;
