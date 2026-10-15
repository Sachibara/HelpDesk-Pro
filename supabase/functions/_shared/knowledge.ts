// Bounded, workspace-local lexical retrieval. Article content is untrusted data.
export function retrieveKnowledge(articles, ticket, scrub) {
  const words = text => [...new Set(String(text||'').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])].filter(w=>!['the','and','for','with','this','that','from','have','not','user','ticket','please'].includes(w));
  const query=words([ticket.title,ticket.description,ticket.category].join(' '));
  return (Array.isArray(articles)?articles:[]).filter(a=>a && !a.archived && typeof a.id==='string').map(a=>{
    const title=words(a.title),body=words([a.category,a.summary,a.content].join(' '));
    const score=query.reduce((n,w)=>n+(title.includes(w)?3:0)+(body.includes(w)?1:0),0);
    return {a,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.a.id.localeCompare(b.a.id)).slice(0,3)
    .map(({a})=>({id:a.id,title:scrub(a.title,160),summary:scrub(a.summary,300),content:scrub(a.content||a.summary,1800)}));
}
export function validateCitations(ids, articles) {
  const allowed=new Set(articles.map(a=>a.id));
  return [...new Set(Array.isArray(ids)?ids.filter(id=>typeof id==='string'&&allowed.has(id)):[])];
}
