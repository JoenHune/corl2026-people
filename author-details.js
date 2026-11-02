(function(global){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shortTopics={'视觉语言动作与基础模型':'VLA / 基础模型','强化学习与奖励':'强化学习','生成策略与扩散':'生成策略 / 扩散','世界模型与仿真':'世界模型 / 仿真','灵巧操作与机器人手':'灵巧操作','移动、全身与人形':'移动 / 全身 / 人形','空间几何与三维':'空间几何 / 3D','记忆、推理与长时任务':'记忆 / 长时任务','安全、泛化与鲁棒性':'泛化与鲁棒性'};
  const short=topic=>shortTopics[topic]||topic;
  const safeHref=value=>{const url=String(value??'').trim();if(/^https?:\/\/[^\s<>"']+$/i.test(url))return url;if(/^\.\.\/papers\/[A-Za-z0-9_-]+\.pdf(?:#page=\d+)?$/.test(url))return url;if(/^people\/[a-z0-9_-]+\/index\.html$/.test(url))return url;return ''};
  const link=(url,label,extra='')=>{const href=safeHref(url);return href?`<a href="${esc(href)}" target="_blank" rel="noopener"${extra}>${esc(label)} ↗</a>`:''};
  const nf=n=>Number(n||0).toLocaleString('en-US');
  const rolesFor=(record,paper)=>{
    const roles=Array.isArray(record.roles)?record.roles:[],result=[];
    if(roles.includes('cofirst'))result.push('<span class="confirmed">共同一作 · 已核</span>');
    else if(record.first)result.push(`<span>首位署名${paper.role_evidence?.alphabetic?' · 字母序':''}</span>`);
    if(roles.includes('corresponding'))result.push('<span class="confirmed">通讯作者 · 已核</span>');
    if(roles.includes('project_lead'))result.push('<span>项目负责人 · 已核</span>');
    if(roles.includes('equal_advising'))result.push('<span>共同指导 · 已核</span>');
    if(!result.length)result.push('<span>共同署名</span>');
    return result.join('');
  };
  const pageHref=(url,page)=>{const href=safeHref(url);return href&&Number.isInteger(Number(page))&&Number(page)>0?href.replace(/#.*$/,'')+'#page='+Number(page):href};
  const paperPdf=paper=>safeHref(paper.pdf)||'https://openreview.net/pdf?id='+encodeURIComponent(paper.id);
  function paperCard(record,papers){
    const p=papers[record.id];if(!p)return '';
    const role=p.role_evidence,type=p.type==='Poster only'?'Poster':p.type,abstract=String(p.abstract||''),synopsis=p.summary||abstract.split(/(?<=[.!?])\s/)[0]||'暂无摘要';
    const sources=[link(p.openreview||'https://openreview.net/forum?id='+encodeURIComponent(p.id),'OpenReview'),link(paperPdf(p),'全文'),link((p.project||[])[0],'项目页'),link((p.code||[])[0],'代码')].filter(Boolean);
    const place=[p.poster_date,p.poster_time,p.poster_venue,p.poster_number?'#'+p.poster_number:''].filter(Boolean).join(' · ');
    return `<article class="paper-card" data-paper-id="${esc(p.id)}"><div class="paper-meta"><span class="presentation-label ${esc(String(type||'').toLowerCase())}">${esc(type||'Poster')}</span></div><h4>${esc(p.title||p.id)}</h4><div class="role-tags">${rolesFor(record,p)}</div><p>${esc(synopsis)}</p>${!p.summary?'<div class="auto-summary-note">摘要原文首句</div>':''}<div class="paper-links">${sources.join('')}</div><details class="source-details"><summary>摘要与署名依据</summary><blockquote>${esc(abstract||'暂无摘要')}</blockquote>${role?`<p>PDF 第 ${esc(role.page)} 页：${esc(role.note)}</p>${role.version_note?`<p>版本说明：${esc(role.version_note)}</p>`:''}<p>${link(pageHref(paperPdf(p),role.page),'查看署名原文')}</p>`:'<p>共同贡献与通讯标记尚未核对。</p>'}${place?`<p>论文展示：${esc(place)}。作者本人到场尚未核实。</p>`:''}</details></article>`;
  }
  function affiliationLine(author){
    const lines=[];
    if((author.current_institutions||[]).length)lines.push('现任：'+author.current_institutions.join(' / '));
    if((author.paper_institutions||[]).length)lines.push('论文：'+author.paper_institutions.slice(0,3).join(' / ')+(author.paper_institutions.length>3?' 等 '+author.paper_institutions.length+' 家':''));
    if(!lines.length&&(author.reference_institutions||[]).length)lines.push('公开资料关联：'+author.reference_institutions.join(' / '));
    if(!lines.length&&(author.institution_candidates||[]).length)lines.push('论文机构线索：'+author.institution_candidates.slice(0,2).join(' / ')+'（尚未逐人对应）');
    return lines.join('；')||'单位资料待补充';
  }
  function affiliations(author,papers){
    const evidence=author.affiliation_evidence||{},rows=evidence.direct||[],groups=new Map();
    for(const row of rows){if(!groups.has(row.institution))groups.set(row.institution,[]);groups.get(row.institution).push(row)}
    let html='';
    if(groups.size)html+=`<details class="source-details"><summary>个人署名单位与原文 · ${groups.size} 家</summary>${[...groups].map(([name,items])=>`<div class="institution-source-group"><strong>${esc(name)}</strong>${items.map(row=>{const p=papers[row.paper_id];return `<details class="source-details"><summary>${esc(p?.title||row.paper_id)}</summary><p>作者行：${esc(row.author_excerpt||'')}<br>机构行：${esc(row.institution_excerpt||'')}</p><p>${link(safeHref(row.source)||pageHref(p?paperPdf(p):'https://openreview.net/pdf?id='+encodeURIComponent(row.paper_id),1),'原文首页')}</p></details>`}).join('')}</div>`).join('')}</details>`;
    const candidates=evidence.paper_candidates||[];
    if(candidates.length)html+=`<details class="source-details"><summary>未逐人对应的论文机构线索 · ${candidates.length} 篇</summary>${candidates.map(row=>`<div class="institution-source-group"><strong>${esc((row.institutions||[]).join(' / '))}</strong><p>${link(safeHref(row.source)||'https://openreview.net/forum?id='+encodeURIComponent(row.paper_id),papers[row.paper_id]?.title||row.paper_id)}</p></div>`).join('')}</details>`;
    const references=author.public_affiliation_associations||[];
    if(references.length)html+=`<details class="source-details"><summary>公开资料中的单位关联</summary>${references.map(row=>`<div class="institution-source-group"><strong>${esc(row.institution)}</strong><p>${esc(row.note)}</p><div class="profile-sources">${(row.sources||[]).map(s=>link(s.url,s.label)).filter(Boolean).join('')}</div></div>`).join('')}</details>`;
    return html;
  }
  const clusterPriority=['触觉与接触','灵巧操作与机器人手','移动、全身与人形','导航与探索','视觉语言动作与基础模型','世界模型与仿真','生成策略与扩散','强化学习与奖励','模仿与示范学习','数据与评测'];
  function clusters(author,papers){
    const grouped=new Map(),rank=type=>({'Oral':0,'Spotlight':1,'Poster only':2}[type]??3);
    const records=[...(author.papers||[])].filter(row=>papers[row.id]).sort((a,b)=>Number((b.roles||[]).includes('corresponding'))-Number((a.roles||[]).includes('corresponding'))||Number(b.first||(b.roles||[]).includes('cofirst'))-Number(a.first||(a.roles||[]).includes('cofirst'))||rank(papers[a.id].type)-rank(papers[b.id].type));
    for(const row of records){const p=papers[row.id],topic=clusterPriority.find(t=>(p.title_topics||[]).includes(t))||clusterPriority.find(t=>(p.topics||[]).includes(t))||'其他相关工作';if(!grouped.has(topic))grouped.set(topic,[]);grouped.get(topic).push(row)}
    return [...grouped];
  }
  function recommendations(author,workspace,papers){
    const rows=workspace.recommendations?.[author.id]||[];if(!rows.length)return '';
    return `<details class="recommendation-note"><summary>助手推荐 · ${rows.length} 条理由</summary>${rows.map(row=>`<p>${esc(row.reason||'已加入推荐名单')}</p>${(row.paper_ids||[]).length?`<div class="paper-links">${row.paper_ids.map(id=>link(papers[id]?.openreview||'https://openreview.net/forum?id='+encodeURIComponent(id),papers[id]?.title||id)).join('')}</div>`:''}${row.source?`<p class="small">${esc(typeof row.source==='string'?row.source:row.source.label||'助手推荐')}</p>`:''}`).join('')}</details>`;
  }
  function render(author,ctx={}){
    if(!author)return '<div class="empty-state">选择作者查看介绍。</div>';
    const papers=ctx.papers||{},workspace=ctx.workspace?.state||ctx.workspace||{},byId=ctx.byId||new Map(),getAuthor=id=>byId instanceof Map?byId.get(id):byId[id],tab=['portfolio','profile','network'].includes(ctx.tab)?ctx.tab:'portfolio',scope=ctx.popup?'popup':'aside',prefix='person-'+scope;
    const counts=author.counts||{},n=counts.accepted_papers||0,first=counts.first_position_papers||0,oral=counts.Oral||0,spotlight=counts.Spotlight||0,co=author.role_counts?.cofirst||0,corr=author.role_counts?.corresponding||0,topics=Object.keys(author.topics||{}),profile=author.profile,selected=(workspace.mustMeetIds||[]).includes(author.id),groups=(workspace.groups||[]).filter(g=>(g.members||[]).includes(author.id));
    const intro=author.portfolio?.summary||`本届参与 ${n} 篇录用论文，研究线索主要涉及${topics.slice(0,3).map(short).join('、')||'未分类方向'}。${first?`其中 ${first} 篇为首位署名。`:''}${co?`已核 ${co} 篇共同一作。`:''}${corr?`已核 ${corr} 篇通讯作者。`:''}`;
    const closeId=ctx.popup?'close-profile-dialog':'close-detail';
    let html=`<div class="detail-header"><h2>${esc(author.name)}</h2><div class="detail-actions"><button class="button${selected?' primary':''}" type="button" data-action="mustmeet" data-id="${esc(author.id)}" aria-pressed="${selected}">${selected?'★ 必见':'☆ 标记必见'}</button><button class="button" type="button" data-action="assign" data-id="${esc(author.id)}">加入分组</button><button id="${closeId}" class="icon-button" type="button" data-action="close-profile" aria-label="关闭作者介绍">×</button></div></div><p class="detail-affiliation">${esc(affiliationLine(author))}</p><div class="detail-metrics"><span><strong>${nf(n)}</strong> 篇署名</span><span><strong>${nf(first)}</strong> 篇首位</span><span>Oral <strong>${oral}</strong> / Spotlight <strong>${spotlight}</strong></span>${co?`<span>共同一作 <strong>${co}</strong></span>`:''}${corr?`<span>通讯 <strong>${corr}</strong></span>`:''}</div><div class="detail-tags">${topics.slice(0,4).map(t=>`<span>${esc(short(t))}</span>`).join('')}${profile?.new_independent?`<span class="tag orange">新晋独立 · ${esc(profile.independent_since)}</span>`:''}</div>${groups.length?`<div class="person-groups">${groups.map(g=>`<button class="button text-button" type="button" data-action="show-group" data-id="${esc(g.id)}">${esc(g.name)}</button>`).join('')}</div>`:''}${recommendations(author,workspace,papers)}<div class="detail-summary"><p>${esc(intro)}</p></div><div class="detail-tabs" role="tablist" aria-label="作者介绍内容">${[['portfolio','研究组合'],['profile','背景与依据'],['network','共著与平台']].map(([key,label])=>`<button type="button" role="tab" id="${prefix}-tab-${key}" aria-controls="${prefix}-content" aria-selected="${tab===key}" data-action="detail-tab" data-tab="${key}" data-id="${esc(author.id)}">${label}</button>`).join('')}</div><div class="detail-body" id="${prefix}-content" role="tabpanel" aria-labelledby="${prefix}-tab-${tab}">`;
    if(tab==='portfolio'){
      for(const [topic,rows] of clusters(author,papers))html+=`<h3>${esc(short(topic))} · ${rows.length} 篇</h3>${rows.map(row=>paperCard(row,papers)).join('')}`;
      if(author.portfolio?.questions?.length)html+=`<details class="source-details discussion-questions"><summary>讨论切入点</summary>${author.portfolio.questions.map(q=>`<p>${esc(q)}</p>`).join('')}</details>`;
    }else if(tab==='profile'){
      html+='<div class="detail-profile">';
      if(profile){html+=`<dl><dt>现任职务</dt><dd>${esc(profile.position||'暂无资料')}</dd><dt>现任单位</dt><dd>${esc(profile.affiliation||'暂无资料')}</dd><dt>独立职位起始</dt><dd>${profile.independent_since?`${esc(profile.independent_since)} 年`:'暂无起始时间资料'}</dd>${profile.china_history?`<dt>学习 / 工作经历</dt><dd>${esc(profile.china_history)}</dd>`:''}</dl>${profile.bio?`<p class="profile-bio">${esc(profile.bio)}</p>`:''}<div class="profile-sources">${(profile.sources||[]).map(s=>link(s.url,s.label)).filter(Boolean).join('')}</div>`}
      else html+='<p class="muted">个人经历资料尚待补充；本届参与的论文见“研究组合”。</p>';
      const original=author.name_style||{},override=workspace.nameOverrides?.[author.id],hasOverride=typeof override==='boolean',nameMatch=hasOverride?override:!!original.match;
      html+=`<details class="source-details"><summary>拼音姓名：${nameMatch?'匹配':'未匹配'}${hasOverride?' · 已手动纠正':''}</summary><p>${esc(original.basis||'按姓名拼写规则匹配。')}此字段只描述姓名风格。</p><label class="field"><span>纠正姓名风格分类</span><select data-action="name-override" data-id="${esc(author.id)}" aria-label="纠正 ${esc(author.name)} 的拼音姓名分类"><option value="auto"${!hasOverride?' selected':''}>按自动规则</option><option value="yes"${override===true?' selected':''}>按拼音风格筛选</option><option value="no"${override===false?' selected':''}>不按拼音风格筛选</option></select></label></details>`;
      html+=affiliations(author,papers);
      const codeCount=new Set((author.papers||[]).flatMap(row=>papers[row.id]?.code||[])).size,socialCount=(author.papers||[]).filter(row=>papers[row.id]?.has_social_sample).length;
      html+=`<details class="source-details"><summary>指标与资料范围</summary><p>本届 ${n} 篇论文关联，${author.role_papers_reviewed||0} 篇署名角色页已核。共同一作、通讯、项目负责人分别记录；未核实不等于没有。</p><p>参与论文中收录 ${codeCount} 个代码链接，${socialCount}/${n} 篇有公开讨论样本。公开讨论来自 Grok 采集快照，不能直接归为个人贡献；生涯引用与仓库采用度尚未采集。</p><p>主题按标题与摘要规则归类，可重叠。作者本人是否到场尚未核实。${author.needs_identifier_review?'该作者使用非标准标识，仍需消歧。':''}</p></details></div>`;
    }else{
      const coauthors=new Map();for(const row of author.papers||[])for(const id of new Set(papers[row.id]?.authors||[]))if(id!==author.id)coauthors.set(id,(coauthors.get(id)||0)+1);
      const coRows=[...coauthors].sort((a,b)=>b[1]-a[1]||(getAuthor(a[0])?.name||a[0]).localeCompare(getAuthor(b[0])?.name||b[0])).slice(0,12);
      html+=`<h3>本届主要共著作者</h3>${coRows.map(([id,count])=>`<button class="coauthor-row" type="button" data-action="coauthor" data-id="${esc(id)}"><span>${esc(getAuthor(id)?.name||id)}</span><span>${count} 篇</span></button>`).join('')||'<p class="muted small">暂无共著关联。</p>'}`;
      const hardware=new Map();for(const row of author.papers||[])for(const device of papers[row.id]?.hardware||[]){if(!hardware.has(device.model))hardware.set(device.model,{total:0,real:0,sim:0});const value=hardware.get(device.model);value.total++;if((device.env||[]).includes('real'))value.real++;if((device.env||[]).includes('simulation'))value.sim++}
      html+=`<h3>参与论文中的实验平台</h3>${[...hardware].sort((a,b)=>b[1].total-a[1].total).map(([name,stats])=>`<div class="hardware-row"><span>${esc(name)}</span><small>真机 ${stats.real} · 仿真 ${stats.sim} 篇</small></div>`).join('')||'<p class="muted small">暂无型号记录。</p>'}<details class="source-details"><summary>共著与硬件口径</summary><p>共著次数来自本届共同署名，不能直接说明熟悉程度。硬件属于论文级证据，不等同于该作者本人负责的平台；真机与仿真可以重叠。</p></details>`;
    }
    html+='</div>';
    const noteId=prefix+'-note',note=workspace.authorNotes?.[author.id]||'';
    html+=`<div class="detail-note"><label for="${noteId}">个人备注</label><textarea id="${noteId}" rows="3" data-author-note="${esc(author.id)}" aria-label="${esc(author.name)} 的个人备注" placeholder="想聊的问题、见面线索…">${esc(note)}</textarea></div>`;
    const profileUrl=profile?.homepage||(String(author.id).startsWith('~')?'https://openreview.net/profile?id='+encodeURIComponent(author.id):'');
    html+=`<div class="paper-links detail-profile-links">${link(profileUrl,profile?.homepage?'个人主页':'OpenReview 档案')}${author.public_path?link(author.public_path,'独立资料页'):''}</div>`;
    if(ctx.generatedAt)html+=`<details class="source-details"><summary>资料快照 ${esc(ctx.generatedAt)}</summary><p>公开研究资料与个人工作区分开保存。论文单位、现任单位和未逐人对应的线索分别记录。</p></details>`;
    return html;
  }
  const api={render,escape:esc,safeHref};
  global.CORLDetails=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
