import { chromium } from 'playwright';
// Visual smoke test: all Supabase requests are intercepted, never production writes.
// Run against the local dev server: node scripts/check-cycle-layout.mjs
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844}});
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',email:'preview@example.test',is_anonymous:false,app_metadata:{provider:'email',providers:['email']},user_metadata:{name:'Preview'},created_at:new Date().toISOString()};
const exp=Math.floor(Date.now()/1000)+86400;
const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp})).toString('base64url')+'.test';
const tables={
workout_block_days:[],
workout_cycle_goals:[{id:'legacy',cycle_id:'cycle',title:'Meta antiga',kind:'descritiva',manual_done:false,start_value:0,target_value:0,unit:'',created_at:'2026-09-10'}],
workout_exercises:[{id:'e1',plan_id:'p1',lineage_id:'lineage1',name:'Remada',sets_target:3,reps_target:10,load_target:20,rest_seconds:90}],
workout_sessions:[{id:'s10',plan_id:'p1',date:'2026-09-10',status:'concluido',started_at:'2026-09-10T12:00:00Z',finished_at:'2026-09-10T13:00:00Z'},{id:'s15',plan_id:'p1',date:'2026-09-15',status:'concluido',started_at:'2026-09-15T12:00:00Z',finished_at:'2026-09-15T13:00:00Z'},{id:'outside',plan_id:'unrelated',date:'2026-09-16',status:'concluido',started_at:'2026-09-16T12:00:00Z',finished_at:'2026-09-16T13:00:00Z'}],
workout_exercise_logs:[{id:'log10',session_id:'s10',exercise_id:'e1',done:true},{id:'log15',session_id:'s15',exercise_id:'e1',done:true},{id:'logOther',session_id:'outside',exercise_id:'e1',done:true}],
workout_set_logs:[{exercise_log_id:'log10',set_index:0,weight:20,reps:10},{exercise_log_id:'log15',set_index:0,weight:25,reps:10},{exercise_log_id:'logOther',set_index:0,weight:99,reps:10}],
workout_body_weights:[{id:'w1',date:'2026-09-10',weight:80},{id:'w2',date:'2026-09-15',weight:81},{id:'w3',date:'2026-10-01',weight:99}],
goals:[{id:'normal',title:'Abrir minha loja',kind:'goal',category:'Trabalho',life_area:'profissional',tracking_type:'steps',created_at:'2026-09-10',deadline_date:'2026-10-24'}],
steps:[{id:'s1',goal_id:'normal',title:'Pesquisa de mercado',target_date:'2026-09-24',done:false,order_index:0},{id:'s2',goal_id:'normal',title:'Estruturar negócio',target_date:'2026-10-24',done:false,order_index:1}],
workout_cycles:[{id:'cycle',name:'Força e resistência',start_date:'2026-09-10',end_date:'2026-10-24',status:'ativo',created_at:'2026-09-10'}],
workout_cycle_blocks:[{id:'b1',cycle_id:'cycle',name:'Construir a base',focus:'Resistência',start_date:'2026-09-10',end_date:'2026-09-24',order_index:0},{id:'b2',cycle_id:'cycle',name:'Progredir as cargas',focus:'Força',start_date:'2026-09-25',end_date:'2026-10-24',order_index:1}],
workout_plans:[{id:'p1',name:'Costas e bíceps',letter:'A',order_index:0},{id:'p2',name:'Pernas',letter:'B',order_index:1}],
workout_block_plans:[{id:'bp1',block_id:'b1',plan_id:'p1',order_index:0},{id:'bp2',block_id:'b1',plan_id:'p2',order_index:1}],
};
await page.addInitScript(()=>sessionStorage.setItem('norte-welcome-entered','true'));
let failNextDaySave=true;
await page.route('**/*.supabase.co/**',async route=>{
 const url=new URL(route.request().url());
 const path=url.pathname;
 const table=path.split('/').pop();
 if(table==='workout_block_days' && route.request().method()==='POST' && failNextDaySave){failNextDaySave=false;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Falha simulada ao salvar dia'})});return;}
 if(path.includes('/rest/') && route.request().method()==='PATCH'){
   const row=tables[table]?.find(r=>r.id===url.searchParams.get('id')?.replace('eq.',''));
   Object.assign(row,route.request().postDataJSON());
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(row)});return;
 }
 if(path.includes('/rest/') && route.request().method()==='POST') {
   const input=route.request().postDataJSON();
   const rows=tables[table]??=[];
   const existing=table==='workout_block_days'?rows.find(r=>r.block_id===input.block_id && r.weekday===input.weekday):null;
   const row={id:existing?.id??`test-${rows.length}`,created_at:new Date().toISOString(),...input};
   if(existing)Object.assign(existing,row);else rows.push(row);
   await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify(row)});return;
 }
 const body=path.includes('/auth/')?(path.endsWith('/user')?user:{access_token:jwt,refresh_token:'test',expires_in:86400,expires_at:exp,token_type:'bearer',user}):(tables[path.split('/').pop()]??[]);
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8080/ciclo/cycle');
await page.getByRole('heading',{name:'Força e resistência'}).waitFor();
await page.getByRole('button',{name:/Etapa atual/}).click();
await page.waitForTimeout(400);
await page.screenshot({path:'/tmp/norte-cycle-planning.png',fullPage:true});
await page.getByRole('button',{name:'Novo treino',exact:true}).click();
await page.getByLabel('Letra do treino').waitFor();
await page.getByText('copiar de outra etapa',{exact:true}).waitFor();
await page.getByText('treino cadastrado',{exact:true}).waitFor();
await page.getByRole('button',{name:'Cancelar',exact:true}).click();
await page.getByText('Editar nome, foco e duração',{exact:true}).click();
await page.getByText('Dias da semana',{exact:true}).click();
await page.getByRole('button',{name:/^Seg /}).click();
await page.getByRole('radio',{name:'A Costas e bíceps'}).locator('..').click();
await page.getByLabel('Horário do treino').fill('12:30');
await page.getByRole('button',{name:'Salvar dia',exact:true}).click();
await page.getByText('Falha simulada ao salvar dia',{exact:true}).waitFor();
await page.getByRole('button',{name:'Salvar dia',exact:true}).click();
await page.getByRole('button',{name:'Seg A 12:30',exact:true}).waitFor();
if(tables.workout_block_days[0]?.block_id!=='b1')throw Error('Wrong stage for weekday');
await page.getByText('Metas da etapa',{exact:true}).click();
await page.getByRole('button',{name:'nova meta',exact:true}).click();
await page.getByLabel('Título',{exact:true}).fill('Melhorar minha técnica');
await page.getByRole('button',{name:'Acompanhamento manual',exact:true}).click();
await page.getByRole('button',{name:'Salvar meta',exact:true}).click();
await page.getByRole('button',{name:/Melhorar minha técnica/}).waitFor();
const createdGoal=tables.workout_cycle_goals.find(g=>g.title==='Melhorar minha técnica');
if(createdGoal?.block_id!=='b1'||createdGoal?.deadline!=='2026-09-24')throw Error('Wrong stage/deadline for goal');
await page.getByLabel('Vincular meta Meta antiga').selectOption('b2');
await page.getByLabel('Vincular meta Meta antiga').waitFor({state:'detached'});
if(tables.workout_cycle_goals[0].block_id!=='b2')throw Error('Legacy goal not linked');
await page.getByRole('button',{name:'Seg A 12:30',exact:true}).evaluate(el=>el.scrollIntoView({block:'center'}));
await page.screenshot({path:'/tmp/norte-cycle-week-viewport.png'});
await page.screenshot({path:'/tmp/norte-cycle-stage-week.png',fullPage:true});
await page.getByRole('button',{name:/^A Costas e bíceps/}).click();
await page.getByRole('tab',{name:'Cronograma',exact:true}).click();
await page.waitForTimeout(400);
await page.screenshot({path:'/tmp/norte-cycle-timeline.png',fullPage:true});
await page.getByRole('button',{name:'Abrir etapa 2: Progredir as cargas'}).click();
await page.getByText('Editar nome, foco e duração',{exact:true}).waitFor();
if(await page.getByRole('tab',{name:'Metas',exact:true}).count())throw Error('Separate goals tab remains');
await page.getByRole('tab',{name:'Evolução',exact:true}).click();
await page.getByLabel('Etapa a acompanhar').selectOption('b1');
await page.getByText('Primeiro registro: 80 kg · Último: 81 kg',{exact:true}).waitFor();
await page.getByText('Primeiro registro: 20 kg · Último: 25 kg',{exact:true}).waitFor();
await page.getByLabel('Etapa a acompanhar').selectOption('b2');
await page.getByText('Nenhuma pesagem registrada neste período.',{exact:true}).waitFor();
await page.getByLabel('Etapa a acompanhar').selectOption('b1');
await page.waitForTimeout(400);
await page.screenshot({path:'/tmp/norte-cycle-stage-evolution.png',fullPage:true});
if(errors.length) throw Error(errors.join('\n'));
await page.goto('http://127.0.0.1:8080/objetivo/normal');
await page.getByRole('heading',{name:'Abrir minha loja'}).waitFor();
await page.screenshot({path:'/tmp/norte-normal-planning.png',fullPage:true});
await page.evaluate(()=>localStorage.setItem('norte-appearance','light'));
await page.setViewportSize({width:360,height:800});
await page.goto('http://127.0.0.1:8080/ciclo/cycle');
await page.getByRole('heading',{name:'Força e resistência'}).waitFor();
await page.getByRole('button',{name:/Etapa atual/}).click();
await page.getByText('Dias da semana',{exact:true}).click();
await page.getByRole('button',{name:'Seg A 12:30',exact:true}).waitFor();
await page.getByText('Metas da etapa',{exact:true}).click();
await page.getByRole('button',{name:/Melhorar minha técnica/}).waitFor();
await page.waitForTimeout(400);
await page.screenshot({path:'/tmp/norte-cycle-light.png',fullPage:true});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Page overflows mobile viewport');
console.log('Cycle navigation, stage editing controls, workout editor, weekdays, timeline deep-link, goals and evolution: OK');
await browser.close();
