import { chromium } from 'playwright';
// Visual smoke test: all Supabase requests are intercepted, never production writes.
// Run against the local dev server: node scripts/check-cycle-layout.mjs
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844}});
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',email:'preview@example.test',is_anonymous:false,app_metadata:{provider:'email',providers:['email']},user_metadata:{name:'Preview'},created_at:new Date().toISOString()};
const exp=Math.floor(Date.now()/1000)+86400;
const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp})).toString('base64url')+'.test';
const tables={
goals:[{id:'normal',title:'Abrir minha loja',kind:'goal',category:'Trabalho',life_area:'profissional',tracking_type:'steps',created_at:'2026-09-10',deadline_date:'2026-10-24'}],
steps:[{id:'s1',goal_id:'normal',title:'Pesquisa de mercado',target_date:'2026-09-24',done:false,order_index:0},{id:'s2',goal_id:'normal',title:'Estruturar negócio',target_date:'2026-10-24',done:false,order_index:1}],
workout_cycles:[{id:'cycle',name:'Força e resistência',start_date:'2026-09-10',end_date:'2026-10-24',status:'ativo',created_at:'2026-09-10'}],
workout_cycle_blocks:[{id:'b1',cycle_id:'cycle',name:'Construir a base',focus:'Resistência',start_date:'2026-09-10',end_date:'2026-09-24',order_index:0},{id:'b2',cycle_id:'cycle',name:'Progredir as cargas',focus:'Força',start_date:'2026-09-25',end_date:'2026-10-24',order_index:1}],
workout_plans:[{id:'p1',name:'Costas e bíceps',letter:'A',order_index:0},{id:'p2',name:'Pernas',letter:'B',order_index:1}],
workout_block_plans:[{id:'bp1',block_id:'b1',plan_id:'p1',order_index:0},{id:'bp2',block_id:'b1',plan_id:'p2',order_index:1}],
};
await page.addInitScript(()=>sessionStorage.setItem('norte-welcome-entered','true'));
await page.route('**/*.supabase.co/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 const body=path.includes('/auth/')?(path.endsWith('/user')?user:{access_token:jwt,refresh_token:'test',expires_in:86400,expires_at:exp,token_type:'bearer',user}):(tables[path.split('/').pop()]??[]);
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8080/ciclo/cycle');
await page.getByRole('heading',{name:'Força e resistência'}).waitFor();
await page.getByRole('button',{name:/Etapa 1/}).click();
await page.screenshot({path:'/tmp/norte-cycle-planning.png',fullPage:true});
await page.getByText('Editar nome, foco e duração',{exact:true}).click();
await page.getByText('Dias da semana',{exact:true}).click();
if(await page.getByLabel('Treino de Seg').count()!==1) throw Error('Weekday selector missing');
await page.getByRole('button',{name:'A Costas e bíceps',exact:true}).click();
await page.getByRole('tab',{name:'Cronograma',exact:true}).click();
await page.waitForTimeout(400);
await page.screenshot({path:'/tmp/norte-cycle-timeline.png',fullPage:true});
await page.getByRole('button',{name:'Abrir etapa 2: Progredir as cargas'}).click();
await page.getByText('Editar nome, foco e duração',{exact:true}).waitFor();
await page.getByRole('tab',{name:'Metas',exact:true}).click();
await page.getByRole('tab',{name:'Evolução',exact:true}).click();
if(errors.length) throw Error(errors.join('\n'));
await page.goto('http://127.0.0.1:8080/objetivo/normal');
await page.getByRole('heading',{name:'Abrir minha loja'}).waitFor();
await page.screenshot({path:'/tmp/norte-normal-planning.png',fullPage:true});
await page.evaluate(()=>localStorage.setItem('norte-appearance','light'));
await page.setViewportSize({width:360,height:800});
await page.goto('http://127.0.0.1:8080/ciclo/cycle');
await page.getByRole('heading',{name:'Força e resistência'}).waitFor();
await page.getByRole('button',{name:/Etapa 1/}).click();
await page.waitForTimeout(400);
await page.screenshot({path:'/tmp/norte-cycle-light.png',fullPage:true});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Page overflows mobile viewport');
console.log('Cycle navigation, stage editing controls, workout editor, weekdays, timeline deep-link, goals and evolution: OK');
await browser.close();
